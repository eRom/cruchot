import { useMemo } from 'react'
import { Plus, Minus, ChevronDown, ChevronRight, Sparkles, Check, Loader2, FolderUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useGitStore } from '@/stores/git.store'
import { DiffView } from './DiffView'
import { cn } from '@/lib/utils'
import type { GitFileStatus, GitFileStatusCode } from '../../../../preload/types'

function statusColor(code: GitFileStatusCode): string {
  switch (code) {
    case 'M': return 'text-orange-400'
    case 'A': return 'text-emerald-400'
    case 'D': return 'text-red-400'
    case 'R': return 'text-blue-400'
    case '?': return 'text-muted-foreground/60'
    case 'U': return 'text-yellow-400'
    default: return 'text-muted-foreground/40'
  }
}

function statusLabel(code: GitFileStatusCode): string {
  switch (code) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case '?': return '?'
    case 'U': return 'U'
    case 'C': return 'C'
    default: return ' '
  }
}

function FileStatusItem({
  file,
  type,
  onAction,
  onSelect,
  isSelected
}: {
  file: GitFileStatus
  type: 'staged' | 'unstaged'
  onAction: () => void
  onSelect: () => void
  isSelected: boolean
}) {
  const code = type === 'staged' ? file.staging : file.working
  const filename = file.path.split('/').pop() || file.path
  const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[12px]',
        'hover:bg-accent/50 transition-colors group',
        isSelected && 'bg-accent text-accent-foreground'
      )}
    >
      <span className={cn('font-mono text-[11px] w-3 shrink-0 font-bold', statusColor(code))}>
        {statusLabel(code)}
      </span>
      <span className="truncate flex-1 min-w-0">
        {dir && <span className="text-muted-foreground/50">{dir}/</span>}
        {filename}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); onAction() }}
        className="size-5 opacity-0 group-hover:opacity-100 shrink-0"
        title={type === 'staged' ? 'Unstage' : 'Stage'}
      >
        {type === 'staged'
          ? <Minus className="size-3" />
          : <Plus className="size-3" />
        }
      </Button>
    </button>
  )
}

export function ChangesPanel() {
  const status = useGitStore((s) => s.status)
  const diffContent = useGitStore((s) => s.diffContent)
  const selectedDiffPath = useGitStore((s) => s.selectedDiffPath)
  const commitMessage = useGitStore((s) => s.commitMessage)
  const isGeneratingMessage = useGitStore((s) => s.isGeneratingMessage)
  const isCommitting = useGitStore((s) => s.isCommitting)
  const setCommitMessage = useGitStore((s) => s.setCommitMessage)
  const stageFiles = useGitStore((s) => s.stageFiles)
  const stageAll = useGitStore((s) => s.stageAll)
  const unstageFiles = useGitStore((s) => s.unstageFiles)
  const commit = useGitStore((s) => s.commit)
  const generateCommitMessage = useGitStore((s) => s.generateCommitMessage)
  const loadDiff = useGitStore((s) => s.loadDiff)
  const refreshStatus = useGitStore((s) => s.refreshStatus)

  const { staged, unstaged } = useMemo(() => {
    if (!status) return { staged: [], unstaged: [] }
    const staged: GitFileStatus[] = []
    const unstaged: GitFileStatus[] = []

    for (const file of status) {
      if (file.staging !== ' ' && file.staging !== '?') {
        staged.push(file)
      }
      if (file.working !== ' ' || file.staging === '?') {
        unstaged.push(file)
      }
    }
    return { staged, unstaged }
  }, [status])

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    if (staged.length === 0) {
      // Auto-stage all if nothing staged
      await stageAll()
    }
    const success = await commit()
    if (success) {
      await refreshStatus()
    }
  }

  if (!status) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground/50">
        Chargement...
      </div>
    )
  }

  if (status.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground/50">
        Aucun changement
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* File lists */}
      <div className={cn(
        'overflow-y-auto overflow-x-hidden',
        diffContent ? 'h-2/5 border-b border-border/30' : 'flex-1'
      )}>
        {/* Staged section */}
        {staged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-emerald-400/80">
              <div className="flex items-center gap-1">
                <ChevronDown className="size-3" />
                <span>Staged ({staged.length})</span>
              </div>
            </div>
            {staged.map((file) => (
              <FileStatusItem
                key={`s-${file.path}`}
                file={file}
                type="staged"
                onAction={() => unstageFiles([file.path])}
                onSelect={() => loadDiff(file.path, true)}
                isSelected={selectedDiffPath === file.path}
              />
            ))}
          </div>
        )}

        {/* Unstaged section */}
        {unstaged.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-orange-400/80">
              <div className="flex items-center gap-1">
                <ChevronDown className="size-3" />
                <span>Non staged ({unstaged.length})</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={stageAll}
                className="size-5"
                title="Tout stager"
              >
                <FolderUp className="size-3" />
              </Button>
            </div>
            {unstaged.map((file) => (
              <FileStatusItem
                key={`u-${file.path}`}
                file={file}
                type="unstaged"
                onAction={() => stageFiles([file.path])}
                onSelect={() => loadDiff(file.path, false)}
                isSelected={selectedDiffPath === file.path}
              />
            ))}
          </div>
        )}
      </div>

      {/* Diff viewer */}
      {diffContent && (
        <div className="h-2/5 overflow-hidden border-b border-border/30">
          <DiffView diff={diffContent} />
        </div>
      )}

      {/* Commit zone */}
      <div className="shrink-0 p-2 space-y-1.5">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Message de commit..."
          className={cn(
            'w-full resize-none rounded-md border border-border/50 bg-background px-2 py-1.5',
            'text-xs placeholder:text-muted-foreground/40',
            'focus:outline-none focus:ring-1 focus:ring-ring/50'
          )}
          rows={2}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={generateCommitMessage}
            disabled={isGeneratingMessage || status.length === 0}
            className="h-6 text-[11px] gap-1 flex-1"
          >
            {isGeneratingMessage
              ? <Loader2 className="size-3 animate-spin" />
              : <Sparkles className="size-3" />
            }
            Generer
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCommit}
            disabled={isCommitting || !commitMessage.trim()}
            className="h-6 text-[11px] gap-1 flex-1"
          >
            {isCommitting
              ? <Loader2 className="size-3 animate-spin" />
              : <Check className="size-3" />
            }
            Committer
          </Button>
        </div>
      </div>
    </div>
  )
}
