import { AlertTriangle } from 'lucide-react'

interface PlanErrorBannerProps {
  step: { id: number; label: string }
  conversationId: string
  messageId: string
}

export function PlanErrorBanner({ step, conversationId, messageId }: PlanErrorBannerProps) {
  const handleAction = (action: 'retry' | 'skip' | 'abort') => {
    window.api.updatePlanStep({ conversationId, messageId, stepIndex: step.id, action })
  }

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Etape {step.id} echouee : {step.label}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => handleAction('retry')} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Reessayer
          </button>
          <button onClick={() => handleAction('skip')} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
            Passer
          </button>
          <button onClick={() => handleAction('abort')} className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10">
            Abandonner
          </button>
        </div>
      </div>
    </div>
  )
}
