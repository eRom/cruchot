import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, RotateCcw } from 'lucide-react'
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

  const [workspacePath, setWorkspacePath] = useState(rootPath || DEFAULT_SANDBOX)

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

  const handleResetFolder = useCallback(async () => {
    if (!activeConversationId) return
    try {
      await window.api.conversationSetWorkspacePath(activeConversationId, DEFAULT_SANDBOX)
      setWorkspacePath(DEFAULT_SANDBOX)
      useWorkspaceStore.getState().setRootPath(null)
    } catch { /* silent */ }
  }, [activeConversationId])

  const displayPath = workspacePath === DEFAULT_SANDBOX
    ? 'Sandbox (defaut)'
    : workspacePath.replace(/^\/Users\/[^/]+\//, '~/')

  return (
    <CollapsibleSection title="Dossier de travail" defaultOpen>
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
        {workspacePath !== DEFAULT_SANDBOX && (
          <button
            onClick={handleResetFolder}
            disabled={isBusy}
            className="rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:bg-accent/50 hover:text-muted-foreground"
            title="Reinitialiser au sandbox par defaut"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
    </CollapsibleSection>
  )
}
