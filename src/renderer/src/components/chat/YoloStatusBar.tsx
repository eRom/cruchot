import { FolderOpen, Square, Terminal } from 'lucide-react'
import { useSandboxStore } from '../../stores/sandbox.store'

export function YoloStatusBar() {
  const { isActive, sandboxPath, processes, stop } = useSandboxStore()

  if (!isActive) return null

  const truncatedPath = sandboxPath
    ? sandboxPath.length > 50
      ? '...' + sandboxPath.slice(-47)
      : sandboxPath
    : ''

  const handleOpenFolder = () => {
    if (sandboxPath) {
      window.api.sandboxOpenPreview(sandboxPath)
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs">
      <div className="flex items-center gap-1.5 text-amber-500 font-medium">
        <Terminal className="h-3.5 w-3.5" />
        YOLO
      </div>

      <span className="text-muted-foreground font-mono truncate" title={sandboxPath ?? ''}>
        {truncatedPath}
      </span>

      {processes.length > 0 && (
        <span className="text-muted-foreground">
          {processes.length} process{processes.length > 1 ? 'es' : ''}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleOpenFolder}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Ouvrir le dossier sandbox"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={stop}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          title="Arreter tous les processus"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
          Stop
        </button>
      </div>
    </div>
  )
}
