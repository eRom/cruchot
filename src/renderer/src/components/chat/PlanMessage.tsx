import { useState, useEffect } from 'react'
import { Check, X, Play, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface PlanStep {
  id: number
  label: string
  tools?: string[]
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  enabled: boolean
}

interface PlanData {
  title: string
  steps: PlanStep[]
  status: 'proposed' | 'approved' | 'running' | 'done' | 'cancelled'
  level: 'light' | 'full'
  estimatedTokens?: number
  estimatedCost?: number
  approvedAt?: number
  completedAt?: number
}

interface PlanMessageProps {
  plan: PlanData
  messageId: string
  conversationId: string
  isStreaming: boolean
}

export function PlanMessage({ plan, messageId, conversationId, isStreaming }: PlanMessageProps) {
  const [localSteps, setLocalSteps] = useState<PlanStep[]>(plan.steps)
  const [expanded, setExpanded] = useState(plan.status !== 'done' && plan.status !== 'cancelled')

  // Sync with live updates during streaming
  useEffect(() => {
    if (plan.status === 'running' || plan.status === 'done') {
      setLocalSteps(plan.steps)
    }
  }, [plan.steps, plan.status])

  const doneCount = plan.steps.filter(s => s.status === 'done').length
  const totalEnabled = plan.steps.filter(s => s.enabled).length
  const progress = totalEnabled > 0 ? (doneCount / totalEnabled) * 100 : 0

  const handleToggleStep = (stepId: number) => {
    if (plan.status !== 'proposed') return
    setLocalSteps(prev => prev.map(s => s.id === stepId ? { ...s, enabled: !s.enabled } : s))
  }

  const handleApprove = () => {
    window.api.approvePlan({
      conversationId,
      messageId,
      decision: 'approved',
      steps: localSteps
    })
  }

  const handleCancel = () => {
    window.api.approvePlan({
      conversationId,
      messageId,
      decision: 'cancelled',
      steps: localSteps
    })
  }

  // Collapsed view for done/cancelled
  if (!expanded && (plan.status === 'done' || plan.status === 'cancelled')) {
    return (
      <div
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-sidebar px-3 py-2"
        onClick={() => setExpanded(true)}
      >
        {plan.status === 'done' ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <X className="size-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-muted-foreground">
          Plan : {plan.title}
        </span>
        <span className="text-xs text-muted-foreground">
          — {doneCount}/{totalEnabled} etapes
        </span>
        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {plan.status === 'running' ? (
          <Play className="size-4 text-green-500" />
        ) : plan.status === 'done' ? (
          <Check className="size-4 text-green-500" />
        ) : (
          <div className="flex size-5 items-center justify-center rounded bg-primary text-[11px] font-bold text-primary-foreground">P</div>
        )}
        <span className="text-sm font-semibold">{plan.title}</span>
        {plan.status === 'running' && (
          <span className="ml-auto text-xs text-green-500">En cours — {doneCount}/{totalEnabled}</span>
        )}
        {plan.estimatedTokens && plan.status === 'proposed' && (
          <span className="ml-auto text-xs text-muted-foreground">
            ~{plan.estimatedTokens} tokens
          </span>
        )}
        {(plan.status === 'done' || plan.status === 'cancelled') && (
          <button onClick={() => setExpanded(false)} className="ml-auto">
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Progress bar (running only) */}
      {plan.status === 'running' && (
        <div className="h-0.5 bg-muted">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-1 p-3">
        {(plan.status === 'proposed' ? localSteps : plan.steps).map((step) => (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
              step.status === 'running' && 'border border-green-500/30 bg-green-500/5',
              step.status === 'done' && 'opacity-50',
              step.status === 'failed' && 'border border-red-500/30 bg-red-500/5',
              step.status === 'pending' && plan.status === 'running' && 'opacity-40',
              !step.enabled && 'opacity-30 line-through'
            )}
          >
            {plan.status === 'proposed' ? (
              <input
                type="checkbox"
                checked={step.enabled}
                onChange={() => handleToggleStep(step.id)}
                className="size-4 rounded accent-primary"
              />
            ) : step.status === 'done' ? (
              <Check className="size-3.5 shrink-0 text-green-500" />
            ) : step.status === 'running' ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-green-500" />
            ) : step.status === 'failed' ? (
              <X className="size-3.5 shrink-0 text-red-500" />
            ) : (
              <div className="size-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
            )}
            <span className="text-xs text-muted-foreground">{step.id}.</span>
            <span>{step.label}</span>
            {step.tools && step.tools.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {step.tools.join(', ')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Actions (proposed only) */}
      {plan.status === 'proposed' && (
        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            onClick={handleApprove}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Check className="size-3.5" />
            Valider
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}
