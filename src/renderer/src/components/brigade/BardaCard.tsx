import { cn } from '@/lib/utils'
import { useBardaStore } from '@/stores/barda.store'
import type { BardaInfo } from '../../../../preload/types'
import {
  BookOpen,
  Brain,
  FileText,
  Plug,
  Terminal,
  Trash2,
  Users
} from 'lucide-react'
import { toast } from 'sonner'

interface BardaCardProps {
  barda: BardaInfo
}

const COUNTER_ITEMS = [
  { key: 'rolesCount' as const, icon: Users, label: 'Roles' },
  { key: 'commandsCount' as const, icon: Terminal, label: 'Commandes' },
  { key: 'promptsCount' as const, icon: FileText, label: 'Prompts' },
  { key: 'fragmentsCount' as const, icon: Brain, label: 'Fragments' },
  { key: 'librariesCount' as const, icon: BookOpen, label: 'Referentiels' },
  { key: 'mcpServersCount' as const, icon: Plug, label: 'MCP' }
]

export function BardaCard({ barda }: BardaCardProps): React.JSX.Element {
  const toggleBarda = useBardaStore((s) => s.toggleBarda)
  const uninstallBarda = useBardaStore((s) => s.uninstallBarda)

  const handleToggle = async () => {
    await toggleBarda(barda.id, !barda.isEnabled)
  }

  const handleUninstall = async () => {
    if (
      window.confirm(
        `Desinstaller le barda "${barda.name}" ? Toutes les ressources du namespace "${barda.namespace}" seront supprimees.`
      )
    ) {
      await uninstallBarda(barda.id)
      toast.success(`Barda "${barda.name}" desinstalle`)
    }
  }

  const nonZeroCounters = COUNTER_ITEMS.filter((item) => barda[item.key] > 0)

  return (
    <div
      className={cn(
        'border rounded-lg p-4 transition-opacity bg-card border-border/60',
        !barda.isEnabled && 'opacity-50'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{barda.name}</h3>
          <span className="mt-1 inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
            {barda.namespace}
          </span>
        </div>
      </div>

      {/* Description */}
      {barda.description && (
        <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-2">
          {barda.description}
        </p>
      )}

      {/* Metadata */}
      {(barda.version || barda.author) && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/50">
          {barda.version && `v${barda.version}`}
          {barda.version && barda.author && ' — '}
          {barda.author}
        </p>
      )}

      {/* Compteurs */}
      {nonZeroCounters.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {nonZeroCounters.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.key}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60"
              >
                <Icon className="size-3 shrink-0" />
                <span>
                  {barda[item.key]} {item.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3">
        {/* Toggle ON/OFF */}
        <button
          onClick={handleToggle}
          className={cn(
            'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
            barda.isEnabled
              ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          {barda.isEnabled ? 'Actif' : 'Inactif'}
        </button>

        {/* Desinstaller */}
        <button
          onClick={handleUninstall}
          className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Desinstaller"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
