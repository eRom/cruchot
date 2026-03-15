import React from 'react'
import { cn } from '@/lib/utils'
import type { ArenaMessage } from '@/stores/arena.store'

interface ArenaMetricsProps {
  message: ArenaMessage | null
  otherMessage: ArenaMessage | null
  side: 'left' | 'right'
}

function formatCost(cost?: number): string {
  if (cost == null || cost === 0) return '-'
  if (cost < 0.001) return '<$0.001'
  return `$${cost.toFixed(4)}`
}

function formatTime(ms?: number): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ArenaMetrics({ message, otherMessage }: ArenaMetricsProps): React.JSX.Element | null {
  if (!message || message.isStreaming) return null

  const isBetterCost = otherMessage && !otherMessage.isStreaming && message.cost != null && otherMessage.cost != null
    ? message.cost <= otherMessage.cost
    : null
  const isBetterTime = otherMessage && !otherMessage.isStreaming && message.responseTimeMs != null && otherMessage.responseTimeMs != null
    ? message.responseTimeMs <= otherMessage.responseTimeMs
    : null
  const isBetterTokens = otherMessage && !otherMessage.isStreaming && message.tokensOut != null && otherMessage.tokensOut != null
    ? message.tokensOut >= otherMessage.tokensOut
    : null

  return (
    <div className="flex items-center gap-3 border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>
        <span className="opacity-60">in:</span>{' '}
        <span className="font-mono">{message.tokensIn ?? '-'}</span>
      </span>
      <span>
        <span className="opacity-60">out:</span>{' '}
        <span className={cn('font-mono', isBetterTokens === true && 'text-green-500', isBetterTokens === false && 'text-red-400/60')}>
          {message.tokensOut ?? '-'}
        </span>
      </span>
      <span className={cn('font-mono', isBetterCost === true && 'text-green-500', isBetterCost === false && 'text-red-400/60')}>
        {formatCost(message.cost)}
      </span>
      <span className={cn('ml-auto font-mono', isBetterTime === true && 'text-green-500', isBetterTime === false && 'text-red-400/60')}>
        {formatTime(message.responseTimeMs)}
      </span>
    </div>
  )
}
