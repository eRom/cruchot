import { useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useProvidersStore } from '@/stores/providers.store'
import { formatTokenCount } from '@/lib/utils'

export function ContextWindowBar() {
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const messages = useMessagesStore((s) => s.messages)
  const selectedModel = useProvidersStore((s) => s.getSelectedModel())
  const isCompacting = useUiStore((s) => s.isCompacting)
  const compactStatus = useUiStore((s) => s.compactStatus)
  const setIsCompacting = useUiStore((s) => s.setIsCompacting)
  const setCompactStatus = useUiStore((s) => s.setCompactStatus)
  const isStreaming = useUiStore((s) => s.isStreaming)

  const maxTokens = selectedModel?.contextWindow ?? 0
  const conversationMessages = messages.filter(m => m.conversationId === activeConversationId)

  // Use real tokensIn from the last assistant message (= actual context size sent to LLM)
  // Falls back to heuristic content.length/4 if no API response yet
  const fallbackEstimate = (() => {
    // Find the last assistant message with real token data
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const m = conversationMessages[i]
      if (m.role === 'assistant' && m.tokensIn) return m.tokensIn
    }
    // No real data yet — rough heuristic
    return conversationMessages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
  })()
  const currentTokens = compactStatus?.tokenEstimate ?? fallbackEstimate
  const needsFullCompact = compactStatus?.needsFullCompact ?? false

  // Listen to compact:status IPC
  useEffect(() => {
    window.api.onCompactStatus((status) => {
      if (status.isCompacting !== undefined) setIsCompacting(status.isCompacting)
      if (status.needsFullCompact !== undefined || status.tokenEstimate !== undefined) {
        setCompactStatus({
          needsFullCompact: status.needsFullCompact ?? false,
          tokenEstimate: status.tokenEstimate ?? 0
        })
      }
    })
    return () => {
      window.api.offCompactStatus()
    }
  }, [setIsCompacting, setCompactStatus])

  // Reset compact status on conversation change
  useEffect(() => {
    setCompactStatus(null)
  }, [activeConversationId, setCompactStatus])

  const handleCompact = useCallback(async () => {
    if (!activeConversationId || isCompacting) return
    try {
      await window.api.runCompact(activeConversationId)
    } catch (error) {
      toast.error('Echec de la compaction')
      console.error('[Compact] Failed:', error)
    }
  }, [activeConversationId, isCompacting])

  if (!activeConversationId || maxTokens <= 0) return null

  const percentage = Math.min((currentTokens / maxTokens) * 100, 100)

  const barColor =
    needsFullCompact || percentage > 80
      ? 'bg-red-500/70'
      : percentage > 50
        ? 'bg-yellow-500/70'
        : 'bg-emerald-500/70'

  const totalCost = conversationMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0)

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-1">
      {/* Progress bar */}
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Info */}
      <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground/50 shrink-0">
        {isCompacting ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            <span>Compaction...</span>
          </>
        ) : (
          <>
            <span>~{formatTokenCount(currentTokens)} / {formatTokenCount(maxTokens)}</span>
            {totalCost > 0 && (
              <span className="font-medium text-muted-foreground/70">
                ${totalCost.toFixed(3)}
              </span>
            )}
            {needsFullCompact && (
              <button
                onClick={handleCompact}
                disabled={isStreaming}
                className="ml-1 px-2 py-0.5 text-[10px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
              >
                Compacter
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
