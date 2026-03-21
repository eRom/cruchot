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
      toast.info('Redemarrez l\'application pour appliquer les changements', { duration: 8000 })
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
      {/* Row layout : info left, actions right */}
      <div className="flex items-start gap-4">
        {/* Left — info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">{barda.name}</h3>
            <span className="shrink-0 inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
              {barda.namespace}
            </span>
            {(barda.version || barda.author) && (
              <span className="text-[11px] text-muted-foreground/50 shrink-0">
                {barda.version && `v${barda.version}`}
                {barda.version && barda.author && ' — '}
                {barda.author}
              </span>
            )}
          </div>

          {barda.description && (
            <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-1">
              {barda.description}
            </p>
          )}

          {/* Compteurs inline */}
          {nonZeroCounters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {nonZeroCounters.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground/60"
                  >
                    <Icon className="size-3 shrink-0" />
                    <span>{barda[item.key]} {item.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Switch toggle */}
          <button
            onClick={handleToggle}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              barda.isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
            )}
            role="switch"
            aria-checked={barda.isEnabled}
            title={barda.isEnabled ? 'Desactiver' : 'Activer'}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform',
                barda.isEnabled ? 'translate-x-4' : 'translate-x-0'
              )}
            />
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
    </div>
  )
}
