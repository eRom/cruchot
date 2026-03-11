import { useState, useMemo } from 'react'
import { Paperclip, ExternalLink, GitCompare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useGitStore } from '@/stores/git.store'
import { DiffView } from './DiffView'
import { cn } from '@/lib/utils'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePanel() {
  const [showDiff, setShowDiff] = useState(false)
  const filePreview = useWorkspaceStore((s) => s.filePreview)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const attachFile = useWorkspaceStore((s) => s.attachFile)
  const attachedFiles = useWorkspaceStore((s) => s.attachedFiles)
  const gitStatus = useGitStore((s) => s.status)
  const diffContent = useGitStore((s) => s.diffContent)
  const loadDiff = useGitStore((s) => s.loadDiff)

  // Check if current file has git modifications
  const hasGitStatus = useMemo(() => {
    if (!filePreview || !gitStatus) return false
    return gitStatus.some((s) => s.path === filePreview.path)
  }, [filePreview, gitStatus])

  if (!filePreview) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground/50">
        Selectionnez un fichier pour le previsualiser
      </div>
    )
  }

  const isAttached = attachedFiles.includes(filePreview.path)
  const pathParts = filePreview.path.split('/')

  const handleToggleDiff = () => {
    if (!showDiff) {
      loadDiff(filePreview.path)
    }
    setShowDiff(!showDiff)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border/30 px-3 py-1.5">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
          {pathParts.map((part: string, i: number) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/30">/</span>}
              <span className={cn(i === pathParts.length - 1 && 'text-foreground font-medium')}>
                {part}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {hasGitStatus && (
            <Button
              variant={showDiff ? 'secondary' : 'ghost'}
              size="icon"
              onClick={handleToggleDiff}
              className="size-6"
              title={showDiff ? 'Voir le contenu' : 'Voir le diff'}
            >
              <GitCompare className="size-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (rootPath) {
                window.api.fileOpenInOS(`${rootPath}/${filePreview.path}`)
              }
            }}
            className="size-6"
            title="Ouvrir avec l'app par defaut"
          >
            <ExternalLink className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => attachFile(filePreview.path)}
            disabled={isAttached}
            className={cn(
              'size-6',
              isAttached && 'text-cyan-600 dark:text-cyan-400'
            )}
            title={isAttached ? 'Attache' : 'Attacher'}
          >
            <Paperclip className="size-3" />
          </Button>
        </div>
      </div>

      {/* Content or Diff */}
      {showDiff && diffContent ? (
        <DiffView diff={diffContent} />
      ) : (
        <div className="flex-1 overflow-auto">
          <pre className={cn(
            'p-3 text-[12px] leading-5 font-mono',
            'text-foreground/80 selection:bg-primary/20'
          )}>
            <code>{filePreview.content}</code>
          </pre>
        </div>
      )}

      {/* Footer — size + language */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border/30 text-[10px] text-muted-foreground/50">
        <span>{filePreview.language}</span>
        <span>{formatSize(filePreview.size)}</span>
      </div>
    </div>
  )
}
