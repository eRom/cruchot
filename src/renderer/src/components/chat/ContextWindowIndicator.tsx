import { cn } from '@/lib/utils'

interface ContextWindowIndicatorProps {
  currentTokens: number
  maxTokens: number
}

/** Format token count to a human-readable short form (e.g. 2.4k, 128k) */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}

/**
 * Thin progress bar showing estimated token usage relative to the model's
 * context window. Green < 50%, yellow 50-80%, red > 80%.
 */
export function ContextWindowIndicator({
  currentTokens,
  maxTokens
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
    <div className="flex items-center gap-2 px-1">
      {/* Progress track */}
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Token count label */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
        ~{formatTokenCount(currentTokens)} / {formatTokenCount(maxTokens)} tokens
      </span>
    </div>
  )
}
