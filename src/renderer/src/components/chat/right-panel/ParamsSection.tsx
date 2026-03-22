import { useMemo, useState, useRef, useEffect } from 'react'
import { Brain } from 'lucide-react'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { RoleSelector } from '@/components/roles/RoleSelector'
import { useContextWindow } from '@/hooks/useContextWindow'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore, type ThinkingEffort } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { cn, formatTokenCount } from '@/lib/utils'

const THINKING_LEVELS: { value: ThinkingEffort; label: string; opacity: string }[] = [
  { value: 'off', label: 'Off', opacity: 'opacity-20' },
  { value: 'low', label: 'Faible', opacity: 'opacity-40' },
  { value: 'medium', label: 'Moyen', opacity: 'opacity-70' },
  { value: 'high', label: 'Eleve', opacity: 'opacity-100' },
]

export function ParamsSection() {
  const messages = useMessagesStore((s) => s.messages)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const isStreaming = useUiStore((s) => s.isStreaming)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const setThinkingEffort = useSettingsStore((s) => s.setThinkingEffort)

  const [thinkingOpen, setThinkingOpen] = useState(false)
  const thinkingRef = useRef<HTMLDivElement>(null)

  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  const isRoleLocked = conversationMessages.length > 0
  const isBusy = isStreaming
  const supportsThinking = selectedModel?.supportsThinking ?? false

  const { currentTokens, maxTokens } = useContextWindow(
    conversationMessages,
    '',
    selectedModel?.contextWindow ?? 0
  )

  const totalCost = useMemo(
    () => conversationMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [conversationMessages]
  )

  const currentLevel = THINKING_LEVELS.find((l) => l.value === thinkingEffort) ?? THINKING_LEVELS[0]

  useEffect(() => {
    if (!thinkingOpen) return
    function handleClick(e: MouseEvent) {
      if (thinkingRef.current && !thinkingRef.current.contains(e.target as Node)) {
        setThinkingOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [thinkingOpen])

  return (
    <div className="rounded-xl border border-border/40 bg-card/50">
      <div className="px-3.5 py-2.5 text-sm font-medium text-foreground/80">
        Parametres
      </div>

      <div className="flex flex-col gap-2.5 px-3.5 pb-3">
        <div className="[&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm">
          <ModelSelector disabled={isBusy} />
        </div>

        <div className="relative" ref={thinkingRef}>
          <button
            onClick={() => !isBusy && supportsThinking && setThinkingOpen(!thinkingOpen)}
            disabled={isBusy || !supportsThinking}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-1.5',
              'text-sm transition-colors',
              supportsThinking && !isBusy ? 'hover:bg-accent/50 cursor-pointer' : 'opacity-50 cursor-not-allowed'
            )}
          >
            <Brain className={cn('size-4 text-purple-500', supportsThinking ? currentLevel.opacity : 'opacity-20')} />
            <span className="flex-1 text-left text-muted-foreground">
              {supportsThinking ? currentLevel.label : 'Off'}
            </span>
          </button>

          {thinkingOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border/60 bg-popover py-1 shadow-md">
              {THINKING_LEVELS.map((level) => (
                <button
                  key={level.value}
                  onClick={() => {
                    setThinkingEffort(level.value)
                    setThinkingOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50',
                    thinkingEffort === level.value && 'bg-accent/30'
                  )}
                >
                  <Brain className={cn('size-4 text-purple-500', level.opacity)} />
                  <span>{level.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="[&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm [&_button_svg:first-child]:size-4">
          <RoleSelector disabled={isBusy || isRoleLocked} />
        </div>

        {maxTokens > 0 && (
          <>
            <div className="border-t border-border/40" />
            <div className="text-[11px] tabular-nums text-muted-foreground/50 text-right">
              ~{formatTokenCount(currentTokens)} / {formatTokenCount(maxTokens)} tokens
              {totalCost > 0 && (
                <span className="ml-1.5 font-medium text-muted-foreground/70">
                  ${totalCost.toFixed(3)}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
