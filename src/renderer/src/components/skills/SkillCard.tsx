import { cn } from '@/lib/utils'
import type { SkillInfo } from '../../../../preload/types'
import { Trash2 } from 'lucide-react'

interface SkillCardProps {
  skill: SkillInfo
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onClick: (skill: SkillInfo) => void
}

function VerdictDot({ verdict }: { verdict: string | null }): React.JSX.Element {
  if (!verdict) {
    return <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/30" title="Inconnu" />
  }
  const upper = verdict.toUpperCase()
  if (upper === 'OK') {
    return <span className="size-2.5 shrink-0 rounded-full bg-emerald-500" title="OK" />
  }
  if (upper === 'WARNING') {
    return <span className="size-2.5 shrink-0 rounded-full bg-orange-500" title="Warning" />
  }
  if (upper === 'CRITICAL') {
    return <span className="size-2.5 shrink-0 rounded-full bg-red-500" title="Critical" />
  }
  return <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/30" title={verdict} />
}

function SourceBadge({ skill }: { skill: SkillInfo }): React.JSX.Element {
  if (skill.source === 'git') {
    return (
      <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        Git
      </span>
    )
  }
  if (skill.source === 'barda' && skill.namespace) {
    return (
      <span className="shrink-0 inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
        Barda · {skill.namespace}
      </span>
    )
  }
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      Local
    </span>
  )
}

export function SkillCard({ skill, onToggle, onDelete, onClick }: SkillCardProps): React.JSX.Element {
  const isEnabled = skill.enabled ?? true

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle(skill.id, !isEnabled)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete(skill.id)
  }

  return (
    <div
      className={cn(
        'group relative flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-border/80 hover:bg-sidebar/50',
        !isEnabled && 'opacity-50'
      )}
      onClick={() => onClick(skill)}
    >
      {/* Verdict dot */}
      <VerdictDot verdict={skill.matonVerdict} />

      {/* Center: name + badge + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{skill.name}</h3>
          <SourceBadge skill={skill} />
        </div>
        {skill.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/70">
            {skill.description}
          </p>
        )}
      </div>

      {/* Right: toggle + delete */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Delete button — visible on hover */}
        <button
          onClick={handleDelete}
          className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Desinstaller"
        >
          <Trash2 className="size-3.5" />
        </button>

        {/* Switch toggle */}
        <button
          onClick={handleToggle}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'
          )}
          role="switch"
          aria-checked={isEnabled}
          title={isEnabled ? 'Desactiver' : 'Activer'}
        >
          <span
            className={cn(
              'pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform',
              isEnabled ? 'translate-x-4' : 'translate-x-0'
            )}
          />
        </button>
      </div>
    </div>
  )
}
