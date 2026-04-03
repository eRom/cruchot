import * as React from 'react'
import type { VcrEvent } from '../../../../../preload/types'
import { cn } from '@/lib/utils'

interface VcrProgressBarProps {
  events: VcrEvent[]
  totalDuration: number
  currentOffsetMs: number
  onSeek: (offsetMs: number) => void
}

function markerColor(event: VcrEvent): string {
  if (event.type === 'permission-decision' || event.type === 'permission-response') {
    return 'bg-amber-500'
  }
  if (event.type === 'tool-call') {
    // Check if the tool result had an error
    const isError = (event.data as { isError?: boolean }).isError
    return isError ? 'bg-red-500' : 'bg-green-500'
  }
  if (event.type === 'tool-result') {
    const isError = (event.data as { isError?: boolean }).isError
    return isError ? 'bg-red-500' : 'bg-green-500'
  }
  return 'bg-green-500'
}

export function VcrProgressBar({
  events,
  totalDuration,
  currentOffsetMs,
  onSeek
}: VcrProgressBarProps) {
  const barRef = React.useRef<HTMLDivElement>(null)

  const fillPct = totalDuration > 0
    ? Math.min(100, (currentOffsetMs / totalDuration) * 100)
    : 0

  const markerEvents = events.filter(
    (e) =>
      e.type === 'tool-call' ||
      e.type === 'tool-result' ||
      e.type === 'permission-decision' ||
      e.type === 'permission-response'
  )

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!barRef.current || totalDuration <= 0) return
    const rect = barRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(Math.round(ratio * totalDuration))
  }

  return (
    <div
      ref={barRef}
      role="progressbar"
      aria-valuenow={currentOffsetMs}
      aria-valuemin={0}
      aria-valuemax={totalDuration}
      className="relative h-1.5 w-full cursor-pointer rounded-full bg-zinc-800"
      onClick={handleClick}
    >
      {/* Fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-[width] duration-100"
        style={{ width: `${fillPct}%` }}
      />

      {/* Tool-call markers */}
      {totalDuration > 0 &&
        markerEvents.map((event, i) => {
          const pct = Math.min(100, (event.offsetMs / totalDuration) * 100)
          return (
            <span
              key={i}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2 rounded-full',
                markerColor(event)
              )}
              style={{ left: `${pct}%` }}
            />
          )
        })}
    </div>
  )
}
