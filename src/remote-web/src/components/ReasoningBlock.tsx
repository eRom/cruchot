import { useState } from 'react'

interface ReasoningBlockProps {
  text: string
}

export function ReasoningBlock({ text }: ReasoningBlockProps) {
  const [expanded, setExpanded] = useState(false)

  if (!text) return null

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* Brain icon */}
        <svg viewBox="0 0 24 24" className={`size-3.5 ${expanded ? '' : 'animate-pulse'}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9.5 2A5.5 5.5 0 0 0 5 9.5a5.5 5.5 0 0 0 1.02 3.2A5.5 5.5 0 0 0 4 17.5 5.5 5.5 0 0 0 9.5 23h5a5.5 5.5 0 0 0 5.5-5.5 5.5 5.5 0 0 0-2.02-4.8A5.5 5.5 0 0 0 19 9.5 5.5 5.5 0 0 0 14.5 4h-1V2h-4z" />
        </svg>
        <span>Reflexion</span>
        <svg
          viewBox="0 0 12 12"
          className={`size-2.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
        >
          <path d="M4.5 2l4 4-4 4" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
}
