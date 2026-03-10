import { useState } from 'react'
import { Check, X, ChevronDown, ChevronRight, FilePlus, FilePen, FileX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FileOperation } from '../../../../preload/types'

interface FileOperationCardProps {
  operation: FileOperation
  onApprove: (op: FileOperation) => void
  onReject: (op: FileOperation) => void
}

const TYPE_CONFIG: Record<FileOperation['type'], { icon: typeof FilePlus; label: string; color: string }> = {
  create: { icon: FilePlus, label: 'CREER', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  modify: { icon: FilePen, label: 'MODIFIER', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  delete: { icon: FileX, label: 'SUPPRIMER', color: 'text-red-600 bg-red-500/10 border-red-500/20' }
}

export function FileOperationCard({ operation, onApprove, onReject }: FileOperationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const config = TYPE_CONFIG[operation.type]
  const Icon = config.icon
  const isPending = operation.status === 'pending'

  return (
    <div className={cn(
      'mt-2 rounded-lg border',
      config.color,
      'overflow-hidden'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 shrink-0" />
          <span className="text-xs font-bold tracking-wider uppercase">{config.label}</span>
          <span className="text-xs font-mono truncate opacity-80">{operation.path}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isPending ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReject(operation)}
                className="h-6 gap-1 px-2 text-[11px] text-red-600 hover:bg-red-500/10"
              >
                <X className="size-3" />
                Rejeter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onApprove(operation)}
                className="h-6 gap-1 px-2 text-[11px] text-emerald-600 hover:bg-emerald-500/10"
              >
                <Check className="size-3" />
                Appliquer
              </Button>
            </>
          ) : operation.status === 'approved' ? (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600">
              <Check className="size-3" /> Applique
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-red-500">
              <X className="size-3" /> Rejete
            </span>
          )}
        </div>
      </div>

      {/* Expand toggle for content */}
      {operation.content && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-1 border-t border-current/10 px-3 py-1 text-[11px] opacity-60 hover:opacity-100 transition-opacity"
          >
            {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {expanded ? 'Masquer le contenu' : 'Voir le contenu'}
          </button>
          {expanded && (
            <div className="border-t border-current/10 bg-black/5 dark:bg-white/5">
              <pre className="max-h-60 overflow-auto p-3 text-[11px] leading-4 font-mono">
                <code>{operation.content}</code>
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}
