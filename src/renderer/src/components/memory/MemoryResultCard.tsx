import { Trash2, User, Bot } from 'lucide-react'
import type { SemanticMemorySearchResult } from '../../../../../src/preload/types'
import { cn } from '@/lib/utils'

interface MemoryResultCardProps {
  result: SemanticMemorySearchResult
  onForget: (pointId: string) => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
}

function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-500'
  if (score >= 0.5) return 'text-yellow-500'
  return 'text-orange-500'
}

export function MemoryResultCard({ result, onForget }: MemoryResultCardProps) {
  const isUser = result.role === 'user'
  const Icon = isUser ? User : Bot

  return (
    <div className="group rounded-lg border border-border/30 bg-card p-3 hover:border-border/60 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn('font-mono font-semibold', scoreColor(result.score))}>
            {result.score.toFixed(2)}
          </span>
          <Icon className="size-3 text-muted-foreground" />
          <span className="text-muted-foreground/70">{formatDate(result.createdAt)}</span>
        </div>
        <button
          onClick={() => onForget(result.id)}
          className="opacity-0 group-hover:opacity-100 rounded p-1 text-muted-foreground/50 hover:text-red-500 hover:bg-red-500/10 transition-all"
          title="Oublier ce souvenir"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Content preview */}
      <p className="text-xs text-foreground/80 line-clamp-3 leading-relaxed">
        {result.contentPreview}
      </p>
    </div>
  )
}
