import { useState, useEffect } from 'react'
import type { ToolApproval } from '../types/protocol'

interface ToolCallCardProps {
  approval: ToolApproval
  onApprove: () => void
  onDeny: () => void
}

export function ToolCallCard({ approval, onApprove, onDeny }: ToolCallCardProps) {
  const [remainingMs, setRemainingMs] = useState(approval.expiresAt - Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = approval.expiresAt - Date.now()
      setRemainingMs(remaining)
      if (remaining <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [approval.expiresAt])

  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(remainingSec / 60)
  const seconds = remainingSec % 60

  if (remainingMs <= 0) return null

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-md bg-cyan-accent/15 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="size-3 text-cyan-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-cyan-accent">{approval.toolName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums">
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      {/* Args */}
      <pre className="rounded-lg bg-background/50 border border-border px-3 py-2 text-[11px] text-muted-foreground overflow-x-auto max-h-24 leading-relaxed">
        {approval.args}
      </pre>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex-1 rounded-lg bg-emerald-accent/90 py-2 text-xs font-medium text-white hover:bg-emerald-accent transition-colors"
        >
          Approuver
        </button>
        <button
          onClick={onDeny}
          className="flex-1 rounded-lg bg-secondary py-2 text-xs font-medium text-secondary-foreground hover:bg-accent transition-colors"
        >
          Refuser
        </button>
      </div>
    </div>
  )
}
