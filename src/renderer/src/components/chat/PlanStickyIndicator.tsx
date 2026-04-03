import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface PlanStickyIndicatorProps {
  plan: {
    title: string
    steps: Array<{ id: number; label: string; status: string; enabled: boolean }>
    status: string
  }
  visible: boolean
  onScrollToPlan: () => void
}

export function PlanStickyIndicator({ plan, visible, onScrollToPlan }: PlanStickyIndicatorProps) {
  if (!visible || plan.status !== 'running') return null

  const doneCount = plan.steps.filter(s => s.status === 'done').length
  const totalEnabled = plan.steps.filter(s => s.enabled).length
  const currentStep = plan.steps.find(s => s.status === 'running')
  const progress = totalEnabled > 0 ? (doneCount / totalEnabled) * 100 : 0

  return (
    <div className="flex items-center gap-2 border-b border-border bg-sidebar/80 px-4 py-1.5 backdrop-blur-sm">
      <Loader2 className="size-3.5 animate-spin text-green-500" />
      <span className="text-xs font-medium">Plan en cours</span>
      <span className="truncate text-xs text-muted-foreground">
        — etape {doneCount + 1}/{totalEnabled}
        {currentStep ? ` : ${currentStep.label}` : ''}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <button onClick={onScrollToPlan} className="text-xs text-primary hover:underline">
          Voir
        </button>
      </div>
    </div>
  )
}
