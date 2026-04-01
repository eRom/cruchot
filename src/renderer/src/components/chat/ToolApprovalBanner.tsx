import { useUiStore } from '@/stores/ui.store'
import { AlertTriangle, Check, Clock, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const TOOL_LABELS: Record<string, string> = {
  bash: 'Commande shell',
  writeFile: 'Ecriture de fichier',
  FileEdit: 'Modification de fichier',
  WebFetchTool: 'Acces web',
}

function getToolDetail(toolName: string, toolArgs: Record<string, unknown>): string {
  if (toolName === 'bash') return String(toolArgs.command ?? '')
  if (toolName === 'writeFile' || toolName === 'FileEdit') return String(toolArgs.path ?? toolArgs.file_path ?? '')
  if (toolName === 'WebFetchTool') return String(toolArgs.url ?? '')
  return JSON.stringify(toolArgs).slice(0, 200)
}

export function ToolApprovalBanner() {
  const approval = useUiStore((s) => s.pendingApproval)
  const setPendingApproval = useUiStore((s) => s.setPendingApproval)
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    if (!approval) return
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [approval?.approvalId])

  if (!approval) return null

  const label = TOOL_LABELS[approval.toolName] ?? approval.toolName
  const detail = getToolDetail(approval.toolName, approval.toolArgs)

  const handleDecision = (decision: 'allow' | 'deny' | 'allow-session') => {
    window.api.approveToolCall(approval.approvalId, decision)
    setPendingApproval(null)
  }

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yellow-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground font-mono mt-0.5">{detail}</p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={() => handleDecision('allow')} className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">
            <Check className="size-3" /> Autoriser
          </button>
          <button onClick={() => handleDecision('allow-session')} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
            <Clock className="size-3" /> Session
          </button>
          <button onClick={() => handleDecision('deny')} className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">
            <X className="size-3" /> Refuser
          </button>
          <span className="ml-auto text-xs text-muted-foreground">{countdown}s</span>
        </div>
      </div>
    </div>
  )
}
