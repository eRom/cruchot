import { useMemo } from 'react'
import { Settings, Globe } from 'lucide-react'
import { ModelSelector } from '@/components/chat/ModelSelector'
import { ChatOptionsMenu } from '@/components/chat/ChatOptionsMenu'
import { RoleSelector } from '@/components/roles/RoleSelector'
import { useContextWindow } from '@/hooks/useContextWindow'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
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
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)

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
    <div className="border-b border-border/40">
      <div className="flex items-center gap-2 p-3 text-sm font-medium text-muted-foreground border-b border-border/40">
        <Settings className="size-4" />
        Parametres
      </div>
      <div className="flex flex-col gap-3 p-3">
        <ModelSelector disabled={isBusy} />
        <ChatOptionsMenu
          disabled={isBusy}
          supportsThinking={selectedModel?.supportsThinking}
        />
        <RoleSelector disabled={isBusy || isRoleLocked} />

        {/* Toggle Web Search */}
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Globe className="size-4" />
            Web Search
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={searchEnabled}
            onClick={() => setSearchEnabled(!searchEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              searchEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span
              className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                searchEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Token count & cost */}
        <div className="text-[11px] tabular-nums text-muted-foreground/60">
          ~{formatTokens(currentTokens)} / {formatTokens(maxTokens)} tokens
          {totalCost > 0 && (
            <span className="ml-2">
              {totalCost < 0.01
                ? `${(totalCost * 100).toFixed(2)} c`
                : `$${totalCost.toFixed(4)}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
