import React, { useState } from 'react'
import { cn } from '@/lib/utils'

export interface PerplexitySource {
  title: string
  url: string
  snippet?: string
}

interface PerplexitySourcesProps {
  sources: PerplexitySource[]
}

/**
 * Compact bar of numbered source badges from a Perplexity response.
 * Each badge opens the URL in the default browser on click.
 * Hovering shows a tooltip with the title and snippet.
 */
export function PerplexitySources({ sources }: PerplexitySourcesProps): React.JSX.Element | null {
  if (!sources.length) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/30 pt-2">
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider mr-1">
        Sources
      </span>
      {sources.map((source, index) => (
        <SourceBadge key={index} source={source} index={index} />
      ))}
    </div>
  )
}

function SourceBadge({ source, index }: { source: PerplexitySource; index: number }): React.JSX.Element {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <span className="relative">
      <button
        onClick={() => {
          try {
            const parsed = new URL(source.url)
            if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
              window.open(source.url, '_blank', 'noopener,noreferrer')
            }
          } catch { /* URL invalide */ }
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full',
          'text-[10px] font-semibold',
          'bg-primary/10 text-primary hover:bg-primary/20',
          'transition-colors duration-150 cursor-pointer',
          'ring-1 ring-primary/20 hover:ring-primary/40'
        )}
        aria-label={`Source ${index + 1}: ${source.title}`}
      >
        {index + 1}
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-popover-foreground shadow-md ring-1 ring-border/50 max-w-xs">
          <p className="text-xs font-medium">{source.title}</p>
          {source.snippet && (
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
              {source.snippet}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
