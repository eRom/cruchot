import React from 'react'
import { cn } from '@/lib/utils'

interface VsSeparatorProps {
  isStreaming: boolean
}

export function VsSeparator({ isStreaming }: VsSeparatorProps): React.JSX.Element {
  return (
    <div className="relative flex w-16 shrink-0 flex-col items-center justify-center">
      {/* Top gradient line */}
      <div className="flex-1 w-px bg-gradient-to-b from-transparent via-red-500/30 to-red-500/50" />

      {/* VS Badge */}
      <div className="relative my-3">
        {/* Glow */}
        <div
          className={cn(
            'absolute -inset-3 rounded-full blur-lg transition-opacity duration-500',
            isStreaming ? 'bg-red-500/25 opacity-100' : 'bg-red-500/10 opacity-60'
          )}
          style={isStreaming ? { animation: 'arena-pulse 2s ease-in-out infinite' } : undefined}
        />

        {/* Circle */}
        <div
          className={cn(
            'relative flex size-12 items-center justify-center rounded-full',
            'bg-gradient-to-br from-red-600 to-orange-500',
            'shadow-lg shadow-red-500/30',
            'ring-2 ring-red-400/50',
            'transition-all duration-300'
          )}
        >
          <span className="font-black text-white text-sm tracking-tighter drop-shadow-md select-none">
            VS
          </span>
        </div>

      </div>

      {/* Bottom gradient line */}
      <div className="flex-1 w-px bg-gradient-to-b from-red-500/50 via-red-500/30 to-transparent" />
    </div>
  )
}
