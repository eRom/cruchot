import { GitBranch } from 'lucide-react'
import { useGitStore } from '@/stores/git.store'
import { cn } from '@/lib/utils'

export function GitBranchBadge() {
  const info = useGitStore((s) => s.info)

  if (!info?.isRepo) return null

  return (
    <div className="flex items-center gap-1.5 px-1 min-w-0">
      <GitBranch className="size-3 text-muted-foreground/60 shrink-0" />
      <span className="text-[11px] text-muted-foreground truncate">
        {info.branch ?? 'HEAD'}
      </span>
      <span className={cn(
        'size-1.5 rounded-full shrink-0',
        info.isDirty ? 'bg-orange-400' : 'bg-emerald-400'
      )} />
      {info.modifiedCount > 0 && (
        <span className="text-[10px] text-orange-400/80 font-medium shrink-0">
          {info.modifiedCount}
        </span>
      )}
    </div>
  )
}
