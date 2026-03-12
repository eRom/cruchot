import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, FolderOpen, ImageIcon, Loader2, Network, Paperclip, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { ContextWindowIndicator } from '@/components/chat/ContextWindowIndicator'
import { VoiceInput } from '@/components/chat/VoiceInput'
import { PromptPicker } from '@/components/chat/PromptPicker'
import { AspectRatioSelector, type AspectRatio } from '@/components/chat/AspectRatioSelector'
import { ThinkingSelector } from '@/components/chat/ThinkingSelector'
import { AttachmentPreview, type AttachmentItem } from '@/components/chat/AttachmentPreview'
import { RoleSelector } from '@/components/roles/RoleSelector'
import { SearchToggle } from '@/components/chat/SearchToggle'
import { useProvidersStore } from '@/stores/providers.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useRolesStore } from '@/stores/roles.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useContextWindow } from '@/hooks/useContextWindow'
import { cn } from '@/lib/utils'
import { FileReference } from '@/components/workspace/FileReference'
import type { AttachmentRef } from '../../../../preload/types'

// ── Types pour futures integrations (ModelParams) ──
export interface InputZoneProps {
  /** Contenu additionnel au-dessus du textarea (ex: AttachmentPreview) */
  topSlot?: ReactNode
  /** Contenu additionnel sous le textarea (ex: model params, tokens counter) */
  bottomSlot?: ReactNode
  /** Overlay sur la zone (ex: DropZone pour drag & drop) */
  overlaySlot?: ReactNode
  /** Callback apres envoi reussi */
  onMessageSent?: (content: string) => void
  /** Classes CSS additionnelles sur le conteneur racine */
  className?: string
}

// ── Constantes ───────────────────────────────────────────────
const TEXTAREA_MIN_HEIGHT = 44
const TEXTAREA_MAX_HEIGHT = 300
const TEXTAREA_LINE_HEIGHT = 22

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILES_PER_MESSAGE = 10

// ── Whitelist d'extensions ───────────────────────────────────
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.csv'])
const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h',
  '.html', '.css', '.json', '.yaml', '.yml', '.toml', '.xml', '.sql', '.sh', '.rb',
  '.php', '.swift', '.kt'
])
const ALL_ALLOWED = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...CODE_EXTENSIONS])

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])

function getFileCategory(ext: string): 'image' | 'document' | 'code' | null {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return null
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv'
  }
  return map[ext] ?? 'application/octet-stream'
}

export function InputZone({
  topSlot,
  bottomSlot,
  overlaySlot,
  onMessageSent,
  className
}: InputZoneProps) {
  const [content, setContent] = useState('')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Stores ───────────────────────────────────────────────
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const { activeConversationId, addConversation, setActiveConversation, updateConversation } = useConversationsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const { messages, addMessage } = useMessagesStore()
  const { isStreaming } = useUiStore()
  const temperature = useSettingsStore((s) => s.temperature)
  const settingsMaxTokens = useSettingsStore((s) => s.maxTokens)
  const topP = useSettingsStore((s) => s.topP)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const activeRoleId = useRolesStore((s) => s.activeRoleId)
  const activeSystemPrompt = useRolesStore((s) => s.activeSystemPrompt)
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const workspaceAttachedFiles = useWorkspaceStore((s) => s.attachedFiles)
  const detachWorkspaceFile = useWorkspaceStore((s) => s.detachFile)
  const toggleWorkspacePanel = useWorkspaceStore((s) => s.togglePanel)
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const providers = useProvidersStore((s) => s.providers)
  const hasPerplexityKey = useMemo(
    () => providers.some((p) => p.id === 'perplexity' && p.isConfigured),
    [providers]
  )
  const mcpServers = useMcpStore((s) => s.servers)
  const mcpConnectedCount = useMemo(
    () => mcpServers.filter((s) => s.status === 'connected').length,
    [mcpServers]
  )

  // ── Context window ────────────────────────────────────────
  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  const isImageMode = selectedModel?.type === 'image'

  const { currentTokens, maxTokens } = useContextWindow(
    conversationMessages,
    content,
    selectedModel?.contextWindow ?? 0
  )

  const totalCost = useMemo(
    () => conversationMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [conversationMessages]
  )

  // ── Derived state ────────────────────────────────────────
  const isBusy = isStreaming || isGeneratingImage
  const hasAttachments = pendingAttachments.length > 0
  const canSend = (content.trim().length > 0 || hasAttachments) && !isBusy && !!selectedModelId && !!selectedProviderId
  const isRoleLocked = conversationMessages.length > 0

  // ── Auto-grow textarea ───────────────────────────────────
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = `${TEXTAREA_MIN_HEIGHT}px`
    const scrollHeight = textarea.scrollHeight
    const newHeight = Math.min(Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT)
    textarea.style.height = `${newHeight}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [content, adjustHeight])

  // ── Focus au mount ───────────────────────────────────────
  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  // ── Re-focus apres fin de streaming ──────────────────────
  useEffect(() => {
    if (!isBusy) {
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [isBusy])

  // ── Save a browser File to disk via main process IPC ──────
  const saveFileToDisk = useCallback(async (file: File): Promise<{ path: string; size: number } | null> => {
    try {
      const buffer = await file.arrayBuffer()
      const result = await window.api.fileSave({ buffer, filename: file.name })
      return result
    } catch (err) {
      console.error('[InputZone] Failed to save file:', file.name, err)
      return null
    }
  }, [])

  // ── Add files from drag & drop or paste (browser File objects) ──
  const addBrowserFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      if (pendingAttachments.length >= MAX_FILES_PER_MESSAGE) {
        console.warn(`[InputZone] Maximum ${MAX_FILES_PER_MESSAGE} fichiers atteint`)
        break
      }

      const name = file.name
      if (name.startsWith('.')) {
        console.warn(`[InputZone] Fichier cache refuse : ${name}`)
        continue
      }

      const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
      if (!ALL_ALLOWED.has(ext)) {
        console.warn(`[InputZone] Extension non supportee : ${ext}`)
        continue
      }

      if (file.size > MAX_FILE_SIZE) {
        console.warn(`[InputZone] Fichier trop volumineux : ${name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
        continue
      }

      // Save to disk via IPC (sandbox blocks File.path)
      const saved = await saveFileToDisk(file)
      if (!saved) continue

      const category = getFileCategory(ext)!
      const mimeType = file.type || getMimeType(ext)
      const isImage = IMAGE_MIMES.has(mimeType) && ext !== '.svg'
      const url = isImage ? URL.createObjectURL(file) : undefined

      const item: AttachmentItem = {
        name,
        type: mimeType,
        size: saved.size,
        url,
        path: saved.path,
        category
      }

      setPendingAttachments((prev) => [...prev, item])
    }
  }, [pendingAttachments.length, saveFileToDisk])

  // ── Add files from native dialog (already have paths from main) ──
  const addPickedFiles = useCallback((pickedFiles: Array<{ path: string; name: string; size: number; type: 'image' | 'document' | 'code'; mimeType: string }>) => {
    for (const pf of pickedFiles) {
      if (pendingAttachments.length >= MAX_FILES_PER_MESSAGE) break

      const isImage = IMAGE_MIMES.has(pf.mimeType) && !pf.name.endsWith('.svg')
      const url = isImage ? `local-image://${pf.path}` : undefined

      const item: AttachmentItem = {
        name: pf.name,
        type: pf.mimeType,
        size: pf.size,
        url,
        path: pf.path,
        category: pf.type
      }

      setPendingAttachments((prev) => [...prev, item])
    }
  }, [pendingAttachments.length])

  // ── Remove attachment ────────────────────────────────────
  const handleRemoveAttachment = useCallback((index: number) => {
    setPendingAttachments((prev) => {
      const item = prev[index]
      if (item?.url) URL.revokeObjectURL(item.url)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // ── Paperclip click → native file dialog via main process ──
  const handlePaperclipClick = useCallback(async () => {
    try {
      const pickedFiles = await window.api.filePick()
      if (pickedFiles && pickedFiles.length > 0) {
        addPickedFiles(pickedFiles)
      }
    } catch (err) {
      console.error('[InputZone] File pick error:', err)
    }
  }, [addPickedFiles])

  // ── Drag & drop ──────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (isImageMode) return
    setDragCounter((prev) => {
      const next = prev + 1
      if (next === 1) setIsDragging(true)
      return next
    })
  }, [isImageMode])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragCounter((prev) => {
      const next = prev - 1
      if (next === 0) setIsDragging(false)
      return next
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      setDragCounter(0)
      if (isImageMode) return

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addBrowserFiles(e.dataTransfer.files)
        e.dataTransfer.clearData()
      }
    },
    [addBrowserFiles, isImageMode]
  )

  // ── Cmd+V paste image from clipboard ────────────────────
  useEffect(() => {
    if (isImageMode) return

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageFiles: File[] = []
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            // Create a proper filename from the mime type
            const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]
            const namedFile = new File([file], `pasted-image.${ext}`, { type: file.type })
            imageFiles.push(namedFile)
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault()
        addBrowserFiles(imageFiles)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [addBrowserFiles, isImageMode])

  // ── Cleanup URLs on unmount ────────────────────────────
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => {
        if (a.url) URL.revokeObjectURL(a.url)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ensure conversation exists ──────────────────────────
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeConversationId) return activeConversationId
    try {
      const conv = await window.api.createConversation(undefined, activeProjectId ?? undefined)
      addConversation(conv)
      setActiveConversation(conv.id)
      return conv.id
    } catch {
      return null
    }
  }, [activeConversationId, activeProjectId, addConversation, setActiveConversation])

  // ── Build attachment refs for IPC ──────────────────────
  const buildAttachmentRefs = useCallback((): AttachmentRef[] => {
    return pendingAttachments
      .filter((a) => a.path) // Only files with a path (not pasted blobs without path)
      .map((a) => ({
        path: a.path!,
        name: a.name,
        size: a.size,
        type: a.category ?? 'document',
        mimeType: a.type
      }))
  }, [pendingAttachments])

  // ── Clear attachments ──────────────────────────────────
  const clearAttachments = useCallback(() => {
    pendingAttachments.forEach((a) => {
      if (a.url) URL.revokeObjectURL(a.url)
    })
    setPendingAttachments([])
  }, [pendingAttachments])

  // ── Envoi image ────────────────────────────────────────
  const handleSendImage = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || !selectedModelId) return

    const conversationId = await ensureConversation()
    if (!conversationId) return

    const userMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user' as const,
      content: trimmed,
      createdAt: new Date()
    }
    addMessage(userMessage)
    setContent('')
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`
      }
    })

    setIsGeneratingImage(true)
    try {
      const result = await window.api.generateImage({
        prompt: trimmed,
        model: selectedModelId,
        aspectRatio,
        conversationId,
        providerId: selectedProviderId ?? undefined
      })

      const assistantMessage = {
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant' as const,
        content: trimmed,
        modelId: selectedModelId,
        providerId: selectedProviderId ?? undefined,
        contentData: {
          type: 'image' as const,
          imageId: result.id,
          path: result.path
        },
        createdAt: new Date()
      }
      addMessage(assistantMessage)
    } catch (error) {
      addMessage({
        id: crypto.randomUUID(),
        conversationId,
        role: 'assistant' as const,
        content: `Erreur de generation : ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
        modelId: selectedModelId,
        providerId: selectedProviderId ?? undefined,
        createdAt: new Date()
      })
    } finally {
      setIsGeneratingImage(false)
    }
  }, [content, selectedModelId, selectedProviderId, aspectRatio, ensureConversation, addMessage])

  // ── Envoi du message texte ─────────────────────────────
  const handleSendText = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed && !hasAttachments) return
    if (!selectedModelId || !selectedProviderId) return
    if (isStreaming) return

    const conversationId = await ensureConversation()
    if (!conversationId) return

    // Build attachment refs before clearing
    const attachmentRefsForIpc = buildAttachmentRefs()

    // Build contentData for optimistic user message
    const userContentData = attachmentRefsForIpc.length > 0
      ? { attachments: attachmentRefsForIpc.map(r => ({ path: r.path, name: r.name, size: r.size, type: r.type, mimeType: r.mimeType })) }
      : undefined

    // Ajouter le message user au store local (optimistic update)
    const messageContent = trimmed || (hasAttachments ? `[${pendingAttachments.length} fichier(s) joint(s)]` : '')
    const userMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user' as const,
      content: messageContent,
      contentData: userContentData,
      createdAt: new Date()
    }
    addMessage(userMessage)

    // Clear le textarea et les attachments immediatement
    setContent('')
    clearAttachments()

    // Reset hauteur textarea
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`
      }
    })

    // Update conversation model in store (DB is updated by chat.ipc.ts)
    updateConversation(conversationId, { modelId: `${selectedProviderId}::${selectedModelId}` })

    // Resolve role ID for persistence (skip virtual __project__ id)
    const roleIdForPersist = activeRoleId && activeRoleId !== '__project__' ? activeRoleId : undefined

    // Load workspace file contexts if any
    let fileContexts: { path: string; content: string; language: string }[] | undefined
    if (workspaceAttachedFiles.length > 0) {
      try {
        fileContexts = await useWorkspaceStore.getState().getAttachedFileContexts()
      } catch { /* ignore */ }
    }

    // Envoyer via IPC
    try {
      // Check if workspace is active for tool-based file access
      const workspaceIsOpen = !!useWorkspaceStore.getState().rootPath

      await window.api.sendMessage({
        conversationId,
        content: messageContent,
        modelId: selectedModelId,
        providerId: selectedProviderId,
        systemPrompt: activeSystemPrompt ?? undefined,
        temperature,
        maxTokens: settingsMaxTokens,
        topP,
        thinkingEffort: selectedModel?.supportsThinking ? thinkingEffort : undefined,
        roleId: roleIdForPersist,
        attachments: attachmentRefsForIpc.length > 0 ? attachmentRefsForIpc : undefined,
        fileContexts: fileContexts && fileContexts.length > 0 ? fileContexts : undefined,
        hasWorkspace: workspaceIsOpen || undefined,
        searchEnabled: searchEnabled || undefined
      })
    } catch {
      // Erreur geree par le stream handler dans le main
    }

    // Clear workspace attached files after send
    if (workspaceAttachedFiles.length > 0) {
      useWorkspaceStore.getState().clearAttachedFiles()
    }

    // Persist role on conversation after first message
    if (activeRoleId && conversationMessages.length === 0) {
      try {
        await window.api.setConversationRole(conversationId, roleIdForPersist ?? null)
      } catch {
        // Silent
      }
    }

    onMessageSent?.(messageContent)
  }, [
    content,
    hasAttachments,
    pendingAttachments.length,
    selectedModelId,
    selectedProviderId,
    isStreaming,
    ensureConversation,
    buildAttachmentRefs,
    addMessage,
    clearAttachments,
    updateConversation,
    temperature,
    settingsMaxTokens,
    topP,
    thinkingEffort,
    selectedModel?.supportsThinking,
    searchEnabled,
    activeRoleId,
    activeSystemPrompt,
    conversationMessages.length,
    onMessageSent
  ])

  // ── Dispatch send ──────────────────────────────────────
  const handleSend = useCallback(() => {
    if (isImageMode) {
      handleSendImage()
    } else {
      handleSendText()
    }
  }, [isImageMode, handleSendImage, handleSendText])

  // ── Insertion depuis PromptPicker ─────────────────────────
  const handlePromptInsert = useCallback(
    (text: string, mode: 'replace' | 'append') => {
      if (mode === 'replace') {
        setContent(text)
      } else {
        setContent((prev) => (prev ? `${prev}\n\n${text}` : text))
      }
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    []
  )

  // ── Cancel stream ────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    try {
      await window.api.cancelStream()
    } catch {
      // Silencieux
    }
  }, [])

  // ── Keyboard ─────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter seul = envoyer, Shift+Enter = saut de ligne
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (canSend) {
          handleSend()
        }
      }
    },
    [canSend, handleSend]
  )

  return (
    <div
      className={cn(
        'relative flex w-full flex-col',
        'border-t border-border/40',
        'bg-background/80 backdrop-blur-sm',
        'px-4 pb-6 pt-3',
        'before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6',
        'before:bg-gradient-to-t before:from-background/60 before:to-transparent',
        className
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Overlay slot */}
      {overlaySlot}

      {/* Drag & drop overlay */}
      {isDragging && (
        <div
          className={cn(
            'absolute inset-0 z-50',
            'flex flex-col items-center justify-center gap-3',
            'rounded-2xl border-2 border-dashed border-primary/50',
            'bg-primary/10 backdrop-blur-sm',
            'pointer-events-none',
            'animate-in fade-in duration-200'
          )}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/20">
            <Paperclip className="size-7 text-primary" />
          </div>
          <p className="text-sm font-medium text-primary">Deposez vos fichiers ici</p>
        </div>
      )}

      {/* Conteneur central */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {/* Top slot */}
        {topSlot}

        {/* Zone de saisie principale */}
        <div
          className={cn(
            'group relative flex flex-col rounded-2xl',
            'border border-border/60 bg-card',
            'shadow-sm',
            'transition-all duration-200 ease-out',
            'focus-within:border-ring/40 focus-within:shadow-md',
            'focus-within:shadow-ring/5 dark:focus-within:shadow-ring/10',
            isStreaming && 'border-primary/30',
            isImageMode && 'border-primary/30 focus-within:border-primary/40'
          )}
        >
          {/* Workspace file references */}
          {workspaceAttachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
              {workspaceAttachedFiles.map((path) => (
                <FileReference
                  key={path}
                  path={path}
                  onRemove={() => detachWorkspaceFile(path)}
                />
              ))}
            </div>
          )}

          {/* Attachment preview bar */}
          {hasAttachments && (
            <div className="px-3 pt-2">
              <AttachmentPreview
                attachments={pendingAttachments}
                onRemove={handleRemoveAttachment}
              />
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isImageMode ? 'Decrivez l\'image a generer...' : 'Envoyer un message...'}
            disabled={isBusy}
            rows={1}
            className={cn(
              'w-full resize-none border-none bg-transparent outline-none',
              'text-sm leading-relaxed text-foreground',
              'placeholder:text-muted-foreground/50',
              'px-4 pt-3 pb-0',
              'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40',
              'transition-[height] duration-150 ease-out',
              isBusy && 'cursor-not-allowed opacity-50'
            )}
            style={{
              minHeight: `${TEXTAREA_MIN_HEIGHT}px`,
              maxHeight: `${TEXTAREA_MAX_HEIGHT}px`,
              lineHeight: `${TEXTAREA_LINE_HEIGHT}px`
            }}
          />

          {/* Aspect ratio selector — mode image uniquement */}
          {isImageMode && (
            <div className="px-4 pb-1 pt-2">
              <AspectRatioSelector
                value={aspectRatio}
                onChange={setAspectRatio}
                disabled={isBusy}
              />
            </div>
          )}

          {/* Barre d'outils en bas du textarea */}
          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            {/* Cote gauche — Paperclip + ModelSelector + pills */}
            <div className="flex items-center gap-1.5">
              {/* Workspace toggle — visible only if workspace active */}
              {!isImageMode && workspaceRootPath && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleWorkspacePanel}
                      disabled={isBusy}
                      className={cn(
                        'size-7 rounded-lg',
                        'text-muted-foreground/60 hover:text-muted-foreground',
                        'transition-colors',
                        workspaceAttachedFiles.length > 0 && 'text-cyan-600 dark:text-cyan-400'
                      )}
                    >
                      <FolderOpen className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Workspace (Cmd+B)</TooltipContent>
                </Tooltip>
              )}
              {/* Paperclip — attach files (hidden in image mode) */}
              {!isImageMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handlePaperclipClick}
                      disabled={isBusy}
                      className={cn(
                        'size-7 rounded-lg',
                        'text-muted-foreground/60 hover:text-muted-foreground',
                        'transition-colors',
                        hasAttachments && 'text-primary'
                      )}
                    >
                      <Paperclip className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Joindre des fichiers</TooltipContent>
                </Tooltip>
              )}
              <ModelSelector disabled={isBusy} />
              {selectedModel?.supportsThinking && !isImageMode && (
                <ThinkingSelector disabled={isBusy} />
              )}
              {hasPerplexityKey && !isImageMode && (
                <SearchToggle disabled={isBusy} />
              )}
              {!isImageMode && (
                <RoleSelector disabled={isBusy || isRoleLocked} />
              )}
              <PromptPicker
                onInsert={handlePromptInsert}
                disabled={isBusy}
              />
              <VoiceInput
                onTranscript={(text) => setContent((prev) => prev ? `${prev} ${text}` : text)}
                disabled={isBusy}
              />
              {mcpConnectedCount > 0 && !isImageMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground">
                      <Network className="size-3 text-emerald-500" />
                      <span>{mcpConnectedCount}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {mcpConnectedCount} serveur{mcpConnectedCount > 1 ? 's' : ''} MCP connecte{mcpConnectedCount > 1 ? 's' : ''}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Cote droit — Bouton envoyer / annuler */}
            <div className="flex items-center gap-1.5">
              {isStreaming ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCancel}
                      className={cn(
                        'size-8 rounded-full',
                        'bg-destructive/10 text-destructive hover:bg-destructive/20',
                        'transition-all duration-200'
                      )}
                    >
                      <Square className="size-3.5 fill-current" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Arreter la generation</TooltipContent>
                </Tooltip>
              ) : isGeneratingImage ? (
                <Button
                  variant="ghost"
                  size="icon"
                  disabled
                  className="size-8 rounded-full bg-muted text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" />
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={handleSend}
                      disabled={!canSend}
                      className={cn(
                        'size-8 rounded-full',
                        'transition-all duration-200 ease-out',
                        canSend && [
                          'bg-primary text-primary-foreground',
                          'shadow-sm hover:shadow-md',
                          'hover:scale-105 active:scale-95'
                        ],
                        !canSend && [
                          'bg-muted/50 text-muted-foreground/30',
                          'shadow-none cursor-default'
                        ]
                      )}
                    >
                      {isImageMode ? (
                        <ImageIcon className="size-4" strokeWidth={2.5} />
                      ) : (
                        <ArrowUp
                          className={cn(
                            'size-4 transition-transform duration-200',
                            canSend && 'translate-y-0',
                            !canSend && 'translate-y-0.5 opacity-50'
                          )}
                          strokeWidth={2.5}
                        />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {canSend
                      ? isImageMode
                        ? 'Generer (Enter)'
                        : 'Envoyer (Enter)'
                      : 'Ecrivez un message'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Context window indicator — mode texte uniquement */}
        {!isImageMode && selectedModel && maxTokens > 0 && (
          <ContextWindowIndicator currentTokens={currentTokens} maxTokens={maxTokens} totalCost={totalCost} />
        )}

        {/* Bottom slot */}
        {bottomSlot}

        {/* Hint clavier — tres discret */}
        <div className="flex justify-center">
          <span className="text-[10px] text-muted-foreground/30 select-none">
            {isImageMode
              ? 'Enter pour generer · Shift+Enter pour un saut de ligne'
              : 'Enter pour envoyer · Shift+Enter pour un saut de ligne'}
          </span>
        </div>
      </div>
    </div>
  )
}
