import React, { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useArenaStore } from '@/stores/arena.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

const TEXTAREA_MIN_HEIGHT = 44
const TEXTAREA_MAX_HEIGHT = 200

export function ArenaInputZone(): React.JSX.Element {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const leftProviderId = useArenaStore((s) => s.leftProviderId)
  const leftModelId = useArenaStore((s) => s.leftModelId)
  const rightProviderId = useArenaStore((s) => s.rightProviderId)
  const rightModelId = useArenaStore((s) => s.rightModelId)
  const isStreaming = useArenaStore((s) => s.isStreaming)
  const arenaConversationId = useArenaStore((s) => s.arenaConversationId)
  const setArenaConversationId = useArenaStore((s) => s.setArenaConversationId)
  const setCurrentUserContent = useArenaStore((s) => s.setCurrentUserContent)
  const vote = useArenaStore((s) => s.vote)
  const currentMatchId = useArenaStore((s) => s.currentMatchId)

  const addConversation = useConversationsStore((s) => s.addConversation)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const temperature = useSettingsStore((s) => s.temperature)
  const maxTokens = useSettingsStore((s) => s.maxTokens)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)

  const canSend = inputValue.trim().length > 0
    && leftProviderId && leftModelId
    && rightProviderId && rightModelId
    && !isStreaming
    && (!currentMatchId || vote != null) // Must vote before sending next

  const handleSend = useCallback(async () => {
    if (!canSend) return
    const content = inputValue.trim()
    setInputValue('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = `${TEXTAREA_MIN_HEIGHT}px`
    }

    try {
      // Create conversation if needed
      let convId = arenaConversationId
      if (!convId) {
        const conv = await window.api.createConversation(undefined, activeProjectId ?? undefined)
        if (conv) {
          // Mark as arena conversation — we update via the is_arena flag
          convId = conv.id
          setArenaConversationId(convId)
          addConversation({ ...conv, isArena: true } as typeof conv)
        }
      }
      if (!convId) return

      // Set current user content for display
      setCurrentUserContent(content)

      // Send to both models
      await window.api.arenaSend({
        conversationId: convId,
        content,
        leftProviderId: leftProviderId!,
        leftModelId: leftModelId!,
        rightProviderId: rightProviderId!,
        rightModelId: rightModelId!,
        temperature: temperature ?? undefined,
        maxTokens: maxTokens ?? undefined,
        thinkingEffort: thinkingEffort === 'off' ? undefined : thinkingEffort ?? undefined
      })
    } catch (err) {
      console.error('[Arena] Send failed:', err)
    }
  }, [canSend, inputValue, arenaConversationId, leftProviderId, leftModelId, rightProviderId, rightModelId, temperature, maxTokens, thinkingEffort, activeProjectId, addConversation, setArenaConversationId, setCurrentUserContent])

  const handleCancel = useCallback(async () => {
    try {
      await window.api.arenaCancel()
    } catch { /* silent */ }
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = `${TEXTAREA_MIN_HEIGHT}px`
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }, [])

  return (
    <div className="shrink-0 border-t border-border/50 bg-background/80 px-4 py-3">
      <div className="relative flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); handleInput() }}
          onKeyDown={handleKeyDown}
          placeholder="Entrez votre prompt pour les deux modeles..."
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-border/50 bg-muted/30',
            'px-3 py-2.5 text-sm placeholder:text-muted-foreground/50',
            'focus:outline-none focus:ring-1 focus:ring-ring/30',
            'transition-colors'
          )}
          style={{ minHeight: TEXTAREA_MIN_HEIGHT, maxHeight: TEXTAREA_MAX_HEIGHT }}
          disabled={isStreaming}
        />

        {isStreaming ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="destructive"
                className="size-9 shrink-0 rounded-lg"
                onClick={handleCancel}
              >
                <Square className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Annuler</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="size-9 shrink-0 rounded-lg"
                onClick={handleSend}
                disabled={!canSend}
              >
                <ArrowUp className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Envoyer (Enter)</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Status hint */}
      {(!leftModelId || !rightModelId) && (
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground/50">
          Selectionnez un modele dans chaque colonne pour commencer
        </p>
      )}
      {currentMatchId && !vote && !isStreaming && (
        <p className="mt-1.5 text-center text-[11px] text-amber-500/70">
          Votez avant d'envoyer le prochain prompt
        </p>
      )}
    </div>
  )
}
