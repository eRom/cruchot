import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, ImageIcon, Loader2, Paperclip, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { VoiceInput } from '@/components/chat/VoiceInput'
import { AspectRatioSelector, type AspectRatio } from '@/components/chat/AspectRatioSelector'
import { AttachmentPreview, type AttachmentItem } from '@/components/chat/AttachmentPreview'
import { useProvidersStore } from '@/stores/providers.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useRolesStore } from '@/stores/roles.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useLibraryStore } from '@/stores/library.store'
import { cn, EVENTS } from '@/lib/utils'
import { FileReference } from '@/components/workspace/FileReference'
import { SlashCommandPicker } from '@/components/chat/SlashCommandPicker'
import { FileMentionPopover } from '@/components/chat/FileMentionPopover'
import { MentionOverlay } from '@/components/chat/MentionOverlay'
import { useSlashCommands } from '@/hooks/useSlashCommands'
import { useFileMention } from '@/hooks/useFileMention'
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

// Extensions that can be read as text context (for drag & drop from Finder)
const TEXT_CONTEXT_EXTENSIONS = new Set([...DOCUMENT_EXTENSIONS, ...CODE_EXTENSIONS])
// Remove binary document types that shouldn't be read as text
TEXT_CONTEXT_EXTENSIONS.delete('.pdf')
TEXT_CONTEXT_EXTENSIONS.delete('.docx')

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
  const [content, setContentLocal] = useState('')
  const setContent = useCallback((v: string | ((prev: string) => string)) => {
    setContentLocal((prev) => {
      const next = typeof v === 'function' ? v(prev) : v
      useUiStore.getState().setDraftContent(next)
      return next
    })
  }, [])
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)
  const [droppedFileContexts, setDroppedFileContexts] = useState<Map<string, { content: string; language: string; name: string }>>(new Map())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Stores ───────────────────────────────────────────────
  const { selectedModelId, selectedProviderId } = useProvidersStore()
  const { activeConversationId, addConversation, setActiveConversation, updateConversation } = useConversationsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const { messages, addMessage } = useMessagesStore()
  const isStreaming = useUiStore((s) => s.isStreaming)

  const temperature = useSettingsStore((s) => s.temperature)
  const settingsMaxTokens = useSettingsStore((s) => s.maxTokens)
  const topP = useSettingsStore((s) => s.topP)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const activeRoleId = useRolesStore((s) => s.activeRoleId)
  const activeSystemPrompt = useRolesStore((s) => s.activeSystemPrompt)
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const workspaceTree = useWorkspaceStore((s) => s.tree)
  const workspaceAttachedFiles = useWorkspaceStore((s) => s.attachedFiles)
  const detachWorkspaceFile = useWorkspaceStore((s) => s.detachFile)
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const activeLibraryId = useLibraryStore((s) => s.activeLibraryId)

  // ── Cursor position for @ mention ──────────────────────────
  const [cursorPos, setCursorPos] = useState(0)

  // ── Mentioned files (inline @path in textarea) ─────────────
  const [mentionedFiles, setMentionedFiles] = useState<Set<string>>(new Set())
  const hasMentions = mentionedFiles.size > 0

  // ── Cleanup removed mentions when content changes ──────────
  useEffect(() => {
    if (mentionedFiles.size === 0) return
    let changed = false
    const next = new Set<string>()
    for (const path of mentionedFiles) {
      if (content.includes(`@${path}`)) {
        next.add(path)
      } else {
        changed = true
      }
    }
    if (changed) setMentionedFiles(next)
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── File mention (@) ───────────────────────────────────────
  const mention = useFileMention({
    content,
    cursorPosition: cursorPos,
    hasWorkspace: !!workspaceRootPath,
    tree: workspaceTree,
    attachedFiles: workspaceAttachedFiles,
    mentionedFiles
  })

  // ── Slash commands ─────────────────────────────────────────
  const { isActive: slashActive, matches: slashMatches, resolve: resolveSlashCommand } = useSlashCommands(content)
  const [slashPickerOpen, setSlashPickerOpen] = useState(false)
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)

  // Open/close picker based on slash detection
  useEffect(() => {
    if (slashActive && slashMatches.length > 0) {
      setSlashPickerOpen(true)
      setSlashSelectedIndex(0)
    } else {
      setSlashPickerOpen(false)
    }
  }, [slashActive, slashMatches.length])

  // ── Context window ────────────────────────────────────────
  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const selectedModel = useProvidersStore((s) => s.getSelectedModel())

  const isImageMode = selectedModel?.type === 'image'

  // ── Derived state ────────────────────────────────────────
  const isBusy = isStreaming || isGeneratingImage
  const hasAttachments = pendingAttachments.length > 0
  const hasDroppedFiles = droppedFileContexts.size > 0
  const canSend = (content.trim().length > 0 || hasAttachments || hasDroppedFiles) && !isBusy && !!selectedModelId && !!selectedProviderId

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

  // ── Remove dropped file context ────────────────────────────
  const handleRemoveDroppedFile = useCallback((filePath: string) => {
    setDroppedFileContexts((prev) => {
      const next = new Map(prev)
      next.delete(filePath)
      return next
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
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      setDragCounter(0)
      if (isImageMode) return

      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return

      const files = Array.from(e.dataTransfer.files)
      const imageFiles: File[] = []

      // Process each dropped file
      for (const file of files) {
        const name = file.name
        if (name.startsWith('.')) continue

        const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''

        // Text/code files → read as context via IPC (like workspace files)
        if (TEXT_CONTEXT_EXTENSIONS.has(ext)) {
          try {
            const filePath = window.api.getFilePath(file)
            if (!filePath) continue

            // Skip if already attached
            if (droppedFileContexts.has(filePath)) continue

            const result = await window.api.fileReadText(filePath)
            setDroppedFileContexts((prev) => {
              const next = new Map(prev)
              next.set(result.path, { content: result.content, language: result.language, name: result.name })
              return next
            })
          } catch (err) {
            console.warn(`[InputZone] Impossible de lire le fichier texte : ${name}`, err)
          }
          continue
        }

        // Images and other binary attachments → existing flow
        if (ALL_ALLOWED.has(ext)) {
          imageFiles.push(file)
        }
      }

      // Process non-text files via existing addBrowserFiles
      if (imageFiles.length > 0) {
        addBrowserFiles(imageFiles)
      }

      e.dataTransfer.clearData()
    },
    [addBrowserFiles, isImageMode, droppedFileContexts]
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

      // Attach pending library selection to the newly created conversation
      const pendingLibId = useLibraryStore.getState().activeLibraryId
      if (pendingLibId) {
        window.api.libraryAttach({ conversationId: conv.id, libraryId: pendingLibId }).catch(() => {})
      }

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
    if (!trimmed && !hasAttachments && !hasDroppedFiles) return
    if (!selectedModelId || !selectedProviderId) return
    if (isStreaming) return

    const conversationId = await ensureConversation()
    if (!conversationId) return

    // ── Slash command resolution ─────────────────────────────
    let resolvedContent = trimmed
    let slashCommandName: string | undefined
    if (trimmed.startsWith('/')) {
      const resolved = resolveSlashCommand(trimmed)
      if (resolved) {
        // Action commands (e.g. /fork) — execute client-side, don't send to LLM
        if (resolved.isAction && resolved.commandName === 'fork') {
          if (activeConversationId) {
            try {
              const forked = await window.api.forkConversation(activeConversationId)
              if (forked) {
                addConversation(forked)
                setActiveConversation(forked.id)
              }
            } catch (err) {
              console.error('Failed to fork conversation:', err)
            }
          }
          setContent('')
          return
        }

        // Skill commands — send with skillName/skillArgs, main process handles injection
        if (resolved.isSkill) {
          const skillContent = `/${resolved.commandName}${resolved.prompt ? ' ' + resolved.prompt : ''}`

          // Optimistic update — add user message to store so it's visible immediately
          addMessage({
            id: crypto.randomUUID(),
            conversationId,
            role: 'user',
            content: skillContent,
            createdAt: new Date()
          })

          setContent('')
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`
            }
          })
          updateConversation(conversationId, { modelId: `${selectedProviderId}::${selectedModelId}` })
          try {
            await window.api.sendMessage({
              conversationId,
              content: skillContent,
              modelId: selectedModelId,
              providerId: selectedProviderId,
              systemPrompt: activeSystemPrompt ?? undefined,
              temperature,
              maxTokens: settingsMaxTokens,
              topP,
              thinkingEffort: selectedModel?.supportsThinking ? thinkingEffort : undefined,
              roleId: activeRoleId && activeRoleId !== '__project__' ? activeRoleId : undefined,
              skillName: resolved.commandName,
              skillArgs: resolved.prompt,
              yoloMode: yoloMode || undefined
            })
          } catch {
            // Error handled by stream handler in main
          }
          onMessageSent?.(skillContent)
          return
        }

        resolvedContent = resolved.prompt
        slashCommandName = resolved.commandName
      }
    }

    // Build attachment refs before clearing
    const attachmentRefsForIpc = buildAttachmentRefs()

    // Build contentData for optimistic user message
    const baseContentData: Record<string, unknown> = {}
    if (attachmentRefsForIpc.length > 0) {
      baseContentData.attachments = attachmentRefsForIpc.map(r => ({ path: r.path, name: r.name, size: r.size, type: r.type, mimeType: r.mimeType }))
    }
    if (slashCommandName) {
      baseContentData.slashCommand = slashCommandName
    }
    const userContentData = Object.keys(baseContentData).length > 0 ? baseContentData : undefined

    // Ajouter le message user au store local (optimistic update)
    const messageContent = resolvedContent || (hasAttachments ? `[${pendingAttachments.length} fichier(s) joint(s)]` : hasDroppedFiles ? `[${droppedFileContexts.size} fichier(s) depose(s)]` : '')
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

    // Load workspace file contexts (panel-attached + @mentioned)
    let fileContexts: { path: string; content: string; language: string }[] | undefined
    const loadedPaths = new Set<string>()

    // From workspace panel attached files
    if (workspaceAttachedFiles.length > 0) {
      try {
        const wsContexts = await useWorkspaceStore.getState().getAttachedFileContexts()
        fileContexts = wsContexts
        for (const ctx of wsContexts) loadedPaths.add(ctx.path)
      } catch { /* ignore */ }
    }

    // From @mentions (inline in text)
    if (mentionedFiles.size > 0) {
      if (!fileContexts) fileContexts = []
      for (const mentionPath of mentionedFiles) {
        if (loadedPaths.has(mentionPath)) continue
        try {
          const file = await window.api.workspaceReadFile(mentionPath)
          fileContexts.push({ path: file.path, content: file.content, language: file.language })
          loadedPaths.add(file.path)
        } catch { /* skip unreadable */ }
      }
    }

    // From dropped files (drag & drop from Finder)
    if (droppedFileContexts.size > 0) {
      if (!fileContexts) fileContexts = []
      for (const [filePath, ctx] of droppedFileContexts) {
        if (loadedPaths.has(filePath)) continue
        fileContexts.push({ path: filePath, content: ctx.content, language: ctx.language })
        loadedPaths.add(filePath)
      }
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
        searchEnabled: searchEnabled || undefined,
        libraryId: activeLibraryId || undefined,
        yoloMode: yoloMode || undefined
      })
    } catch {
      // Erreur geree par le stream handler dans le main
    }

    // Clear workspace attached files + mentioned files after send
    if (workspaceAttachedFiles.length > 0) {
      useWorkspaceStore.getState().clearAttachedFiles()
    }
    if (mentionedFiles.size > 0) {
      setMentionedFiles(new Set())
    }
    if (droppedFileContexts.size > 0) {
      setDroppedFileContexts(new Map())
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
    hasDroppedFiles,
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
    activeLibraryId,
    activeRoleId,
    activeSystemPrompt,
    conversationMessages.length,
    onMessageSent,
    resolveSlashCommand,
    mentionedFiles,
    droppedFileContexts
  ])

  // ── Dispatch send ──────────────────────────────────────
  const handleSend = useCallback(() => {
    if (isImageMode) {
      handleSendImage()
    } else {
      handleSendText()
    }
  }, [isImageMode, handleSendImage, handleSendText])

  // ── File mention selection ──────────────────────────────
  const handleMentionSelect = useCallback(
    (index: number) => {
      const selection = mention.selectItem(index)
      if (!selection) return

      if (selection.isDirectory) {
        // Navigate into directory: replace query with dir path + /
        const before = content.slice(0, selection.mentionStart + 1) // keep the @
        const after = content.slice(selection.cursorPosition)
        const dirPath = mention.results[index]?.fullPath
        if (dirPath) {
          const newContent = `${before}${dirPath}/${after}`
          setContent(newContent)
          const newCursor = selection.mentionStart + 1 + dirPath.length + 1
          setCursorPos(newCursor)
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newCursor
              textareaRef.current.selectionEnd = newCursor
            }
          })
        }
        return
      }

      // File selected: replace @query with @fullPath (keep inline in text)
      const fullPath = selection.selectedPath
      const before = content.slice(0, selection.mentionStart)
      const after = content.slice(selection.cursorPosition)
      const mentionText = `@${fullPath}`
      const newContent = `${before}${mentionText} ${after}`
      setContent(newContent)

      // Track as mentioned file
      setMentionedFiles((prev) => {
        const next = new Set(prev)
        next.add(fullPath)
        return next
      })

      // Place cursor after the mention + space
      const newCursor = before.length + mentionText.length + 1
      setCursorPos(newCursor)
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursor
          textareaRef.current.selectionEnd = newCursor
          textareaRef.current.focus()
        }
      })
    },
    [mention, content]
  )

  // ── Slash command selection from picker ──────────────────
  const handleSlashSelect = useCallback(
    (commandName: string) => {
      setContent(`/${commandName} `)
      setSlashPickerOpen(false)
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    []
  )

  // ── Listen for prompt insert/optimize events from RightPanel ──
  useEffect(() => {
    function handlePromptInsert(e: Event) {
      const text = (e as CustomEvent).detail as string
      if (text) setContent((prev) => prev ? `${prev}\n\n${text}` : text)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
    function handlePromptOptimized(e: Event) {
      const text = (e as CustomEvent).detail as string
      if (text) setContent(text)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
    window.addEventListener(EVENTS.PROMPT_INSERT, handlePromptInsert)
    window.addEventListener(EVENTS.PROMPT_OPTIMIZED, handlePromptOptimized)
    return () => {
      window.removeEventListener(EVENTS.PROMPT_INSERT, handlePromptInsert)
      window.removeEventListener(EVENTS.PROMPT_OPTIMIZED, handlePromptOptimized)
    }
  }, [])

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
      // File mention picker keyboard navigation (priority over slash)
      if (mention.isOpen) {
        if (mention.handleKeyDown(e)) {
          // Tab or Enter = select current item
          if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
            handleMentionSelect(mention.selectedIndex)
          }
          // Escape = just close (handled by removing @ from content or user presses Escape)
          return
        }
      }

      // Slash command picker keyboard navigation
      if (slashPickerOpen && slashMatches.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashSelectedIndex((i) => (i + 1) % slashMatches.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashSelectedIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length)
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          handleSlashSelect(slashMatches[slashSelectedIndex].command.name)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setSlashPickerOpen(false)
          return
        }
        // Enter with picker open = select the command (not send)
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          // If content is just "/something" without a space (still selecting), select
          const firstWord = content.split(' ')[0]
          if (firstWord === content.trim()) {
            e.preventDefault()
            handleSlashSelect(slashMatches[slashSelectedIndex].command.name)
            return
          }
        }
      }

      // Enter seul = envoyer, Shift+Enter = saut de ligne
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        if (canSend) {
          handleSend()
        }
      }
    },
    [canSend, handleSend, slashPickerOpen, slashMatches, slashSelectedIndex, handleSlashSelect, content, mention, handleMentionSelect]
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
            // Extra class needed for absolute positioning of picker
            'border border-border/60 bg-card',
            'shadow-sm',
            'transition-all duration-200 ease-out',
            'focus-within:border-ring/40 focus-within:shadow-md',
            'focus-within:shadow-ring/5 dark:focus-within:shadow-ring/10',
            isStreaming && 'border-primary/30',
            isImageMode && 'border-primary/30 focus-within:border-primary/40'
          )}
        >
          {/* Slash command autocomplete picker */}
          <SlashCommandPicker
            matches={slashMatches}
            selectedIndex={slashSelectedIndex}
            onSelectedIndexChange={setSlashSelectedIndex}
            onSelect={handleSlashSelect}
            onClose={() => setSlashPickerOpen(false)}
            visible={slashPickerOpen}
          />

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

          {/* Dropped file references (drag & drop from Finder) */}
          {hasDroppedFiles && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-2">
              {Array.from(droppedFileContexts.entries()).map(([filePath, ctx]) => (
                <FileReference
                  key={filePath}
                  path={ctx.name}
                  onRemove={() => handleRemoveDroppedFile(filePath)}
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

          {/* File mention popover */}
          {mention.isOpen && (
            <FileMentionPopover
              results={mention.results}
              selectedIndex={mention.selectedIndex}
              currentDir={mention.currentDir}
              onSelect={handleMentionSelect}
              onClose={() => {}}
            />
          )}

          {/* Textarea + mention overlay */}
          <div className="relative">
            {/* Mention highlight overlay (renders @mentions in colored spans) */}
            {hasMentions && (
              <MentionOverlay
                content={content}
                mentionedFiles={mentionedFiles}
                textareaRef={textareaRef}
                className={cn(
                  'text-sm leading-relaxed text-foreground',
                  'px-4 pt-3 pb-0'
                )}
                style={{ lineHeight: `${TEXTAREA_LINE_HEIGHT}px` }}
              />
            )}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setCursorPos(e.target.selectionStart)
              }}
              onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
              onKeyDown={handleKeyDown}
              placeholder={isImageMode ? 'Decrivez l\'image a generer...' : 'Envoyer un message...'}
              disabled={isBusy}
              rows={1}
              className={cn(
                'relative w-full resize-none border-none bg-transparent outline-none',
                'text-sm leading-relaxed',
                'placeholder:text-muted-foreground/50',
                'px-4 pt-3 pb-0',
                'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40',
                'transition-[height] duration-150 ease-out',
                isBusy && 'cursor-not-allowed opacity-50',
                // When mentions exist: text invisible (overlay renders it), but caret stays visible
                hasMentions
                  ? 'text-transparent caret-foreground [-webkit-text-fill-color:transparent]'
                  : 'text-foreground'
              )}
              style={{
                minHeight: `${TEXTAREA_MIN_HEIGHT}px`,
                maxHeight: `${TEXTAREA_MAX_HEIGHT}px`,
                lineHeight: `${TEXTAREA_LINE_HEIGHT}px`
              }}
            />
          </div>

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
            {/* Cote gauche — Paperclip + VoiceInput */}
            <div className="flex items-center gap-1.5">
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
              <VoiceInput
                onTranscript={(text) => setContent((prev) => prev ? `${prev} ${text}` : text)}
                disabled={isBusy}
              />
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

        {/* Bottom slot */}
        {bottomSlot}
      </div>
    </div>
  )
}
