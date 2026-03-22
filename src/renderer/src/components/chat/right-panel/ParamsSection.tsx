import { useMemo } from 'react'
import { Settings } from 'lucide-react'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { ChatOptionsMenu } from '@/components/chat/ChatOptionsMenu'
import { RoleSelector } from '@/components/roles/RoleSelector'
import { useContextWindow } from '@/hooks/useContextWindow'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useUiStore } from '@/stores/ui.store'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

export function ParamsSection() {
  const messages = useMessagesStore((s) => s.messages)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const isStreaming = useUiStore((s) => s.isStreaming)

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

  const { currentTokens, maxTokens } = useContextWindow(
    conversationMessages,
    '',
    selectedModel?.contextWindow ?? 0
  )

  const totalCost = useMemo(
    () => conversationMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [conversationMessages]
  )

  return (
    <div className="rounded-xl border border-border/40 bg-card/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-foreground/80">
        <Settings className="size-4 text-muted-foreground" />
        Parametres
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2.5 px-3.5 pb-3">
        <ModelSelector disabled={isBusy} />
        <ChatOptionsMenu
          disabled={isBusy}
          supportsThinking={selectedModel?.supportsThinking}
        />
        <RoleSelector disabled={isBusy || isRoleLocked} />

        {/* Token count & cost */}
        {maxTokens > 0 && (
          <div className="text-[11px] tabular-nums text-muted-foreground/50 pt-1">
            ~{formatTokens(currentTokens)} / {formatTokens(maxTokens)} tokens
            {totalCost > 0 && (
              <span className="ml-1.5 font-medium text-muted-foreground/70">
                ${totalCost.toFixed(3)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
