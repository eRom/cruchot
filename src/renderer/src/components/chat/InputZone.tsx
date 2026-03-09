import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { ContextWindowIndicator } from '@/components/chat/ContextWindowIndicator'
import { VoiceInput } from '@/components/chat/VoiceInput'
import { useProvidersStore } from '@/stores/providers.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useContextWindow } from '@/hooks/useContextWindow'
import { cn } from '@/lib/utils'

// ── Types pour futures integrations (ModelParams, Attachments, DropZone) ──
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

export function InputZone({
  topSlot,
  bottomSlot,
  overlaySlot,
  onMessageSent,
  className
}: InputZoneProps) {
  const [content, setContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // ── Stores ───────────────────────────────────────────────
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const { activeConversationId, addConversation, setActiveConversation } = useConversationsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const { messages, addMessage } = useMessagesStore()
  const { isStreaming } = useUiStore()
  const temperature = useSettingsStore((s) => s.temperature)
  const settingsMaxTokens = useSettingsStore((s) => s.maxTokens)
  const topP = useSettingsStore((s) => s.topP)

  // ── Context window ────────────────────────────────────────
  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  const { currentTokens, maxTokens } = useContextWindow(
    conversationMessages,
    content,
    selectedModel?.contextWindow ?? 0
  )

  // ── Derived state ────────────────────────────────────────
  const canSend = content.trim().length > 0 && !isStreaming && !!selectedModelId && !!selectedProviderId
  const isEmpty = content.trim().length === 0

  // ── Auto-grow textarea ───────────────────────────────────
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset pour mesurer le scrollHeight reel
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
    // Focus leger au mount, sans scroll
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  // ── Re-focus apres fin de streaming ──────────────────────
  useEffect(() => {
    if (!isStreaming) {
      textareaRef.current?.focus({ preventScroll: true })
    }
  }, [isStreaming])

  // ── Envoi du message ─────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = content.trim()
    if (!trimmed || !selectedModelId || !selectedProviderId) return
    if (isStreaming) return

    // Determiner la conversation (existante ou nouvelle)
    let conversationId: string
    if (activeConversationId) {
      conversationId = activeConversationId
    } else {
      try {
        const conv = await window.api.createConversation(undefined, activeProjectId ?? undefined)
        conversationId = conv.id
        addConversation(conv)
        setActiveConversation(conv.id)
      } catch {
        return
      }
    }

    // Ajouter le message user au store local (optimistic update)
    const userMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user' as const,
      content: trimmed,
      createdAt: new Date()
    }
    addMessage(userMessage)

    // Clear le textarea immediatement
    setContent('')

    // Reset hauteur textarea
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`
      }
    })

    // Envoyer via IPC
    try {
      await window.api.sendMessage({
        conversationId,
        content: trimmed,
        modelId: selectedModelId,
        providerId: selectedProviderId,
        temperature,
        maxTokens: settingsMaxTokens,
        topP,
      })
    } catch {
      // Erreur geree par le stream handler dans le main
    }

    onMessageSent?.(trimmed)
  }, [
    content,
    selectedModelId,
    selectedProviderId,
    activeConversationId,
    activeProjectId,
    isStreaming,
    addMessage,
    addConversation,
    setActiveConversation,
    temperature,
    settingsMaxTokens,
    topP,
    onMessageSent
  ])

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
        // Conteneur principal — surface elevee en bas de l'ecran
        'relative flex w-full flex-col',
        // Separateur subtil en haut
        'border-t border-border/40',
        // Fond legerement different pour la separation visuelle
        'bg-background/80 backdrop-blur-sm',
        // Padding genereux
        'px-4 pb-4 pt-3',
        // Gradient tres subtil vers le haut pour la transition
        'before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6',
        'before:bg-gradient-to-t before:from-background/60 before:to-transparent',
        className
      )}
    >
      {/* Overlay slot (DropZone pour drag & drop) */}
      {overlaySlot}

      {/* Conteneur central — largeur max pour les grands ecrans */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        {/* Top slot (AttachmentPreview, etc.) */}
        {topSlot}

        {/* Zone de saisie principale */}
        <div
          className={cn(
            // Conteneur du textarea — surface card
            'group relative flex flex-col overflow-hidden rounded-2xl',
            // Bordure et fond
            'border border-border/60 bg-card',
            // Ombre douce pour l'elevation
            'shadow-sm',
            // Transition pour le focus state
            'transition-all duration-200 ease-out',
            // Focus-within — le glow subtil
            'focus-within:border-ring/40 focus-within:shadow-md',
            'focus-within:shadow-ring/5 dark:focus-within:shadow-ring/10',
            // Etat streaming — bordure animee
            isStreaming && 'border-primary/30'
          )}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Envoyer un message..."
            disabled={isStreaming}
            rows={1}
            className={cn(
              // Reset et base
              'w-full resize-none border-none bg-transparent outline-none',
              // Typographie
              'text-sm leading-relaxed text-foreground',
              'placeholder:text-muted-foreground/50',
              // Padding confortable
              'px-4 pt-3 pb-0',
              // Scrollbar discrete
              'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40',
              // Transition fluide de la hauteur
              'transition-[height] duration-150 ease-out',
              // Desactive pendant le streaming
              isStreaming && 'cursor-not-allowed opacity-50'
            )}
            style={{
              minHeight: `${TEXTAREA_MIN_HEIGHT}px`,
              maxHeight: `${TEXTAREA_MAX_HEIGHT}px`,
              lineHeight: `${TEXTAREA_LINE_HEIGHT}px`
            }}
          />

          {/* Barre d'outils en bas du textarea */}
          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
            {/* Cote gauche — ModelSelector + VoiceInput */}
            <div className="flex items-center gap-1.5">
              <ModelSelector disabled={isStreaming} />
              <VoiceInput
                onTranscript={(text) => setContent((prev) => prev ? `${prev} ${text}` : text)}
                disabled={isStreaming}
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
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      onClick={handleSend}
                      disabled={!canSend}
                      className={cn(
                        // Bouton circulaire
                        'size-8 rounded-full',
                        // Transition fluide
                        'transition-all duration-200 ease-out',
                        // Etat actif — apparition douce
                        canSend && [
                          'bg-primary text-primary-foreground',
                          'shadow-sm hover:shadow-md',
                          'hover:scale-105 active:scale-95'
                        ],
                        // Etat desactive — fantome
                        !canSend && [
                          'bg-muted/50 text-muted-foreground/30',
                          'shadow-none cursor-default'
                        ]
                      )}
                    >
                      <ArrowUp
                        className={cn(
                          'size-4 transition-transform duration-200',
                          canSend && 'translate-y-0',
                          !canSend && 'translate-y-0.5 opacity-50'
                        )}
                        strokeWidth={2.5}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {canSend ? 'Envoyer (Enter)' : 'Ecrivez un message'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>

        {/* Context window indicator */}
        {selectedModel && maxTokens > 0 && (
          <ContextWindowIndicator currentTokens={currentTokens} maxTokens={maxTokens} />
        )}

        {/* Bottom slot */}
        {bottomSlot}

        {/* Hint clavier — tres discret */}
        <div className="flex justify-center">
          <span className="text-[10px] text-muted-foreground/30 select-none">
            Enter pour envoyer &middot; Shift+Enter pour un saut de ligne
          </span>
        </div>
      </div>
    </div>
  )
}
