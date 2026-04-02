import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, FolderOpenDot, Zap } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { useConversationsStore } from '@/stores/conversations.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

const DEFAULT_SANDBOX = '~/.cruchot/sandbox/'

export function WorkspaceSection() {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const rootPath = useWorkspaceStore((s) => s.rootPath)
  const [yoloMode, setYoloLocal] = useState(false)

  const [workspacePath, setWorkspacePath] = useState(rootPath || DEFAULT_SANDBOX)

  useEffect(() => {
    if (!activeConversationId) return
    window.api.getYoloMode(activeConversationId).then(setYoloLocal).catch(() => {})
  }, [activeConversationId])

  useEffect(() => {
    if (rootPath) setWorkspacePath(rootPath)
    else setWorkspacePath(DEFAULT_SANDBOX)
  }, [rootPath])

  const isBusy = isStreaming

  const handleFolderPick = useCallback(async () => {
    if (!activeConversationId) return
    try {
      const chosenPath = await window.api.workspaceSelectFolder()
      if (chosenPath) {
        await window.api.conversationSetWorkspacePath(activeConversationId, chosenPath)
        setWorkspacePath(chosenPath)
        useWorkspaceStore.getState().openWorkspace(chosenPath)
      }
    } catch { /* silent */ }
  }, [activeConversationId])

  const handleOpenInFinder = useCallback(async () => {
    try {
      await window.api.workspaceOpenInFinder(workspacePath)
    } catch { /* silent */ }
  }, [workspacePath])

  const handleYoloToggle = useCallback(async () => {
    if (!activeConversationId) return
    const newValue = !yoloMode
    setYoloLocal(newValue)
    await window.api.setYoloMode(activeConversationId, newValue)
  }, [activeConversationId, yoloMode])

  const displayPath = workspacePath === DEFAULT_SANDBOX
    ? 'Sandbox (defaut)'
    : workspacePath.replace(/^\/Users\/[^/]+\//, '~/')

  return (
    <CollapsibleSection title="Dossier de travail" defaultOpen>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFolderPick}
            disabled={isBusy}
            className={cn(
              'flex flex-1 items-center gap-2 truncate rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-left text-xs',
              'transition-colors hover:bg-accent/50',
              'disabled:opacity-50',
              workspacePath !== DEFAULT_SANDBOX && 'border-primary/30 text-foreground/80'
            )}
            title={workspacePath}
          >
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate">{displayPath}</span>
          </button>
          <button
            onClick={handleOpenInFinder}
            disabled={isBusy}
            className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-muted-foreground"
            title="Ouvrir dans le Finder"
          >
            <FolderOpenDot className="size-3.5" />
          </button>
        </div>

        {/* YOLO Mode toggle */}
        <button
          onClick={handleYoloToggle}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
            yoloMode
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'text-muted-foreground/60 hover:bg-accent/50 hover:text-muted-foreground'
          )}
        >
          <Zap className={cn('size-3.5 shrink-0', yoloMode && 'fill-amber-400')} />
          <span className="flex-1 text-left">YOLO</span>
          <div
            className={cn(
              'relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors',
              yoloMode ? 'bg-amber-500' : 'bg-muted-foreground/30'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm transition-transform',
                yoloMode ? 'translate-x-3' : 'translate-x-0'
              )}
            />
          </div>
        </button>
      </div>
    </CollapsibleSection>
  )
}
