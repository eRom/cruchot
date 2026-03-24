import { useMemo } from 'react'
import { Brain } from 'lucide-react'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { RoleSelector } from '@/components/roles/RoleSelector'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
  const { selectedModelId, selectedProviderId } = useProvidersStore()
  const isStreaming = useUiStore((s) => s.isStreaming)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const setThinkingEffort = useSettingsStore((s) => s.setThinkingEffort)

  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const selectedModel = useProvidersStore((s) => s.getSelectedModel())

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

  return (
    <div className="rounded-xl border border-border/40 bg-sidebar">
      <div className="px-3.5 py-2.5 text-sm font-medium text-foreground/80">
        Parametres
      </div>

      <div className="flex flex-col gap-2.5 px-3.5 pb-3">
        <div className="[&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm">
          <ModelSelector disabled={isBusy} />
        </div>

        <div className="[&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm">
          <Select
            value={supportsThinking ? thinkingEffort : 'off'}
            onValueChange={(v) => setThinkingEffort(v as ThinkingEffort)}
            disabled={isBusy || !supportsThinking}
          >
            <SelectTrigger>
              <Brain className={cn('size-4 shrink-0 text-purple-500', supportsThinking ? currentLevel.opacity : 'opacity-20')} />
              <SelectValue>
                <span className="truncate text-xs font-medium">
                  {supportsThinking ? currentLevel.label : 'Off'}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {THINKING_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  <Brain className={cn('size-4 text-purple-500', level.opacity)} />
                  <span>{level.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
