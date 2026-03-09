import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BranchNavigationProps {
  currentBranch: number
  totalBranches: number
  onNavigate: (direction: 'prev' | 'next') => void
}

/**
 * Navigation arrows for conversation branching.
 * Displays "1/3" style indicator with prev/next buttons.
 */
function BranchNavigation({
  currentBranch,
  totalBranches,
  onNavigate,
}: BranchNavigationProps) {
  if (totalBranches <= 1) return null

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground/60">
      <button
        onClick={() => onNavigate('prev')}
        disabled={currentBranch <= 1}
        className={cn(
          'flex size-5 items-center justify-center rounded transition-colors',
          currentBranch > 1
            ? 'hover:bg-muted hover:text-foreground'
            : 'cursor-default opacity-30'
        )}
        aria-label="Branche precedente"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="min-w-[28px] text-center text-[10px] font-medium tabular-nums">
        {currentBranch}/{totalBranches}
      </span>
      <button
        onClick={() => onNavigate('next')}
        disabled={currentBranch >= totalBranches}
        className={cn(
          'flex size-5 items-center justify-center rounded transition-colors',
          currentBranch < totalBranches
            ? 'hover:bg-muted hover:text-foreground'
            : 'cursor-default opacity-30'
        )}
        aria-label="Branche suivante"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}

export default React.memo(BranchNavigation)
