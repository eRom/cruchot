import { useState } from 'react'
import { Smartphone, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRemoteStore } from '@/stores/remote.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

interface ContextWindowIndicatorProps {
  currentTokens: number
  maxTokens: number
  totalCost?: number
}

/** Format token count to a human-readable short form (e.g. 2.4k, 128k) */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `<$0.01`
  if (cost < 1) return `$${cost.toFixed(2)}`
  return `$${cost.toFixed(2)}`
}

const STATUS_LABELS: Record<string, string> = {
  disconnected: 'Remote',
  pairing: 'Pairing...',
  connected: 'Remote',
  expired: 'Expire',
  error: 'Erreur',
}

/**
 * Thin progress bar showing estimated token usage relative to the model's
 * context window. Green < 50%, yellow 50-80%, red > 80%.
 * Includes an optional Remote Telegram badge on the left.
 */
export function ContextWindowIndicator({
  currentTokens,
  maxTokens,
  totalCost
}: ContextWindowIndicatorProps) {
  if (maxTokens <= 0) return null

  const percentage = Math.min((currentTokens / maxTokens) * 100, 100)

  const barColor =
    percentage > 80
      ? 'bg-red-500/70'
      : percentage > 50
        ? 'bg-yellow-500/70'
        : 'bg-emerald-500/70'

  return (
    <div className="flex items-center gap-2 px-4">
      {/* Remote badge — left side */}
      <RemoteBadge />

      {/* Summary button */}
      <SummaryButton />

      {/* Progress track */}
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Token count + total cost */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
        ~{formatTokenCount(currentTokens)} / {formatTokenCount(maxTokens)} tokens
        {totalCost != null && totalCost > 0 && (
          <>
            {' '}
            <span className="font-semibold text-muted-foreground/70">{formatCost(totalCost)}</span>
          </>
        )}
      </span>
    </div>
  )
}

/** Small clickable badge for Remote Telegram status. */
function RemoteBadge() {
  const status = useRemoteStore((s) => s.status)
  const config = useRemoteStore((s) => s.config)
  const pairingCode = useRemoteStore((s) => s.pairingCode)
  const start = useRemoteStore((s) => s.start)
  const stop = useRemoteStore((s) => s.stop)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)

  const handleClick = async () => {
    if (!config?.hasToken) {
      setSettingsTab('remote')
      setCurrentView('settings')
    } else if (status === 'disconnected' || status === 'expired') {
      const code = await start(activeConversationId ?? undefined)
      const pairText = `/pair ${code}`
      navigator.clipboard.writeText(pairText).catch(() => {})
      toast(`Envoyez ${pairText} a votre bot Telegram`, {
        description: 'Commande copiee dans le presse-papier',
        duration: 8000
      })
    } else if (status === 'connected' || status === 'pairing') {
      stop()
    }
  }

  const isActive = status === 'connected'
  const isPairing = status === 'pairing'
  const label = STATUS_LABELS[status] ?? 'Remote'

  const tooltipText = !config?.hasToken
    ? 'Configurer Remote Telegram'
    : status === 'disconnected' || status === 'expired'
      ? 'Activer Remote sur cette conversation'
      : isPairing
        ? `Envoyez /pair ${pairingCode ?? '...'} sur Telegram — Cliquer pour annuler`
        : 'Remote actif — Cliquer pour arreter'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5',
            'text-[10px] font-medium transition-all duration-200',
            'hover:bg-accent/60',
            isActive
              ? 'text-emerald-500'
              : isPairing
                ? 'text-yellow-500'
                : 'text-muted-foreground/60 hover:text-muted-foreground/80'
          )}
        >
          <span className="relative">
            <Smartphone className="size-3" />
            {isActive && (
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
            {isPairing && (
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-yellow-400 animate-pulse" />
            )}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}

/** Small clickable button to generate a conversation summary. */
function SummaryButton() {
  const [loading, setLoading] = useState(false)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const messages = useMessagesStore((s) => s.messages)
  const summaryModelId = useSettingsStore((s) => s.summaryModelId) ?? ''
  const summaryPrompt = useSettingsStore((s) => s.summaryPrompt) ?? ''
  const isStreaming = useUiStore((s) => s.isStreaming)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)

  const nonSystemMessages = messages.filter((m) => m.role !== 'system')
  const isConfigured = summaryModelId.length > 0
  const hasEnoughMessages = nonSystemMessages.length >= 2
  const canGenerate = isConfigured && hasEnoughMessages && !isStreaming && !loading && !!activeConversationId

  const tooltipText = !isConfigured
    ? 'Configurer le modele dans Parametres > Resume'
    : !hasEnoughMessages
      ? 'Pas assez de messages pour un resume'
      : isStreaming
        ? 'Generation en cours...'
        : loading
          ? 'Resume en cours de generation...'
          : 'Generer un resume de la conversation'

  const handleClick = async () => {
    if (!canGenerate) {
      if (!isConfigured) {
        setSettingsTab('summary')
        setCurrentView('settings')
      }
      return
    }

    setLoading(true)
    try {
      const result = await window.api.summarizeConversation({
        conversationId: activeConversationId!,
        modelId: summaryModelId,
        prompt: summaryPrompt
      })
      await navigator.clipboard.writeText(result.text)
      toast.success('Resume copie dans le presse-papier')
    } catch (err) {
      toast.error('Erreur lors de la generation du resume', {
        description: err instanceof Error ? err.message : 'Erreur inconnue'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          disabled={isStreaming}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5',
            'text-[10px] font-medium transition-all duration-200',
            'hover:bg-accent/60',
            loading
              ? 'text-blue-500 animate-pulse'
              : canGenerate
                ? 'text-muted-foreground/60 hover:text-muted-foreground/80'
                : 'text-muted-foreground/40 cursor-default'
          )}
        >
          <FileText className="size-3" />
          <span className="hidden sm:inline">Resume</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  )
}
