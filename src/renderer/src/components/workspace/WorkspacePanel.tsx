import { PanelRightClose, PanelRightOpen, FolderOpen, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { FileTree } from './FileTree'
import { FilePanel } from './FilePanel'
import { cn } from '@/lib/utils'

export function WorkspacePanel() {
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const filePreview = useWorkspaceStore((s) => s.filePreview)
  const togglePanel = useWorkspaceStore((s) => s.togglePanel)
  const isPanelOpen = useWorkspaceStore((s) => s.isPanelOpen)
  const refreshTree = useWorkspaceStore((s) => s.refreshTree)
  const isLoading = useWorkspaceStore((s) => s.isLoading)

  if (!rootPath) return null

  const workspaceName = rootPath.split('/').pop() || 'workspace'

  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col',
        'border-l border-border/40 bg-background',
        'transition-[width] duration-200 ease-out',
        isPanelOpen ? 'w-60' : 'w-10'
      )}
    >
      {/* Header */}
      <div className={cn(
        'shrink-0 flex items-center border-b border-border/40 px-2 py-2',
        isPanelOpen ? 'justify-between gap-2' : 'justify-center'
      )}>
        {isPanelOpen && (
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="size-4 text-amber-500/70 shrink-0" />
            <span className="text-sm font-medium truncate">{workspaceName}</span>
          </div>
        )}
        <div className="flex items-center gap-0.5">
          {isPanelOpen && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.api.fileOpenInOS(rootPath)}
                className="size-6"
                title="Ouvrir dans le Finder"
              >
                <ExternalLink className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshTree}
                disabled={isLoading}
                className="size-6"
                title="Rafraichir"
              >
                <RefreshCw className={cn('size-3', isLoading && 'animate-spin')} />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePanel}
            className="size-6"
            title={isPanelOpen ? 'Replier le panneau' : 'Deployer le panneau'}
          >
            {isPanelOpen
              ? <PanelRightClose className="size-3.5" />
              : <PanelRightOpen className="size-3.5" />
            }
          </Button>
        </div>
      </div>

      {/* Collapsed state — just the toggle icon bar */}
      {!isPanelOpen && (
        <div className="flex flex-1 flex-col items-center pt-3">
          <FolderOpen className="size-4 text-amber-500/50" />
        </div>
      )}

      {/* Expanded: Tree (top) + File Preview (bottom) */}
      {isPanelOpen && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className={cn(
            'overflow-hidden',
            filePreview ? 'h-1/2 border-b border-border/30' : 'flex-1'
          )}>
            <FileTree />
          </div>

          {filePreview && (
            <div className="h-1/2 overflow-hidden">
              <FilePanel />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
