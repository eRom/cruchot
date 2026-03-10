import { useState } from 'react'
import {
  Clock,
  Pencil,
  Trash2,
  Play,
  CheckCircle2,
  XCircle,
  Timer,
  CalendarDays,
  CalendarClock,
  Hand
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ScheduledTaskInfo } from '../../../../preload/types'

interface TaskCardProps {
  task: ScheduledTaskInfo
  isDeleting: boolean
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onToggle: () => void
  onExecute: () => void
}

const SCHEDULE_COLORS: Record<string, string> = {
  manual: 'bg-blue-500',
  interval: 'bg-emerald-500',
  daily: 'bg-orange-500',
  weekly: 'bg-violet-500'
}

const SCHEDULE_ICONS: Record<string, typeof Clock> = {
  manual: Hand,
  interval: Timer,
  daily: CalendarDays,
  weekly: CalendarClock
}

function formatSchedule(task: ScheduledTaskInfo): string {
  const config = task.scheduleConfig
  switch (task.scheduleType) {
    case 'manual':
      return 'Manuel'
    case 'interval': {
      if (!config?.value || !config?.unit) return 'Intervalle'
      const unitLabel = config.unit === 'seconds' ? 's' : config.unit === 'minutes' ? 'min' : 'h'
      return `Toutes les ${config.value} ${unitLabel}`
    }
    case 'daily': {
      if (!config?.time) return 'Quotidien'
      return `Chaque jour a ${config.time}`
    }
    case 'weekly': {
      if (!config?.days || !config?.time) return 'Hebdomadaire'
      const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
      const dayLabels = config.days.sort((a, b) => a - b).map((d) => dayNames[d])
      return `${dayLabels.join(', ')} a ${config.time}`
    }
    default:
      return 'Inconnu'
  }
}

function formatLastRun(task: ScheduledTaskInfo): string {
  if (!task.lastRunAt) return 'Jamais execute'
  const date = new Date(task.lastRunAt)
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function TaskCard({
  task,
  isDeleting,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onToggle,
  onExecute
}: TaskCardProps) {
  const [executing, setExecuting] = useState(false)

  const ScheduleIcon = SCHEDULE_ICONS[task.scheduleType] ?? Clock

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setExecuting(true)
    try {
      await onExecute()
    } finally {
      setTimeout(() => setExecuting(false), 1000)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:border-border',
        'bg-card border-border/60',
        !task.isEnabled && 'opacity-60'
      )}
    >
      {/* Color bar */}
      <div className={cn('h-1.5 w-full', SCHEDULE_COLORS[task.scheduleType] ?? 'bg-gray-500')} />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="size-4 shrink-0 text-blue-500" />
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate">
              {task.name}
            </h3>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                task.isEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform',
                  task.isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                )}
              />
            </button>

            {/* Hover actions */}
            <div
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleExecute}
                disabled={executing}
                className="rounded-md p-1.5 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                title="Executer maintenant"
              >
                <Play className="size-3.5" />
              </button>
              <button
                onClick={onEdit}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Modifier"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="mt-2 text-xs text-muted-foreground/70 line-clamp-2">
          {task.description}
        </p>

        {/* Schedule badge */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            task.scheduleType === 'manual' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            task.scheduleType === 'interval' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            task.scheduleType === 'daily' && 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
            task.scheduleType === 'weekly' && 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
          )}>
            <ScheduleIcon className="size-2.5" />
            {formatSchedule(task)}
          </span>

          {/* Status badge */}
          {task.lastRunStatus === 'success' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-2.5" />
              Succes
            </span>
          )}
          {task.lastRunStatus === 'error' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
              <XCircle className="size-2.5" />
              Erreur
            </span>
          )}
        </div>

        {/* Footer — info */}
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground/40">
            {formatLastRun(task)} — {task.runCount} execution{task.runCount !== 1 ? 's' : ''}
          </span>
          {task.nextRunAt && task.isEnabled && (
            <span className="text-[10px] text-muted-foreground/40">
              Prochaine : {new Date(task.nextRunAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {isDeleting && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-foreground">
              Supprimer &quot;{task.name}&quot; ?
            </p>
            <p className="text-xs text-muted-foreground">
              Les conversations creees par cette tache seront conservees.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={onConfirmDelete}>
                Supprimer
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelDelete}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
