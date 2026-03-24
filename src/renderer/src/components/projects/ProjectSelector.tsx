import { useState, useEffect, useRef, useCallback } from 'react'
import { FolderOpen, Plus, ChevronDown, Pencil, Settings2, Trash2 } from 'lucide-react'
import { useProjectsStore, type Project } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

export function ProjectSelector() {
  const { projects, activeProjectId, setProjects, setActiveProject, removeProject } =
    useProjectsStore()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const setCurrentView = useUiStore((s) => s.setCurrentView)

  // ── Load projects ──────────────────────────────────────────
  useEffect(() => {
    window.api.getProjects().then(setProjects).catch(console.error)
  }, [setProjects])

  // ── Click outside ──────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setConfirmDeleteId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectModel = useProvidersStore((s) => s.selectModel)

  // ── Handlers ───────────────────────────────────────────────
  function applyProjectModel(project: Project | undefined) {
    if (project?.defaultModelId) {
      const [providerId, modelId] = project.defaultModelId.split('::')
      if (providerId && modelId) selectModel(providerId, modelId)
    }
  }

  function handleSelect(id: string | null) {
    setActiveProject(id)
    if (id) {
      const project = projects.find((p) => p.id === id)
      applyProjectModel(project)
    }
    setIsOpen(false)
    setConfirmDeleteId(null)
  }

  const handleDelete = useCallback(async (id: string) => {
    await window.api.deleteProject(id)
    removeProject(id)
    setConfirmDeleteId(null)
  }, [removeProject])

  const openNewProject = () => {
    setIsOpen(false)
    setCurrentView('projects')
  }

  // ── Active project ─────────────────────────────────────────
  const activeProject = projects.find((p) => p.id === activeProjectId)

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => { setIsOpen(!isOpen); setConfirmDeleteId(null) }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-200',
          'border border-border/60 hover:border-border hover:bg-accent/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
        )}
      >
        {/* Color dot */}
        {activeProject?.color ? (
          <span
            className="size-3 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
            style={{ backgroundColor: activeProject.color }}
          />
        ) : (
          <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="flex-1 truncate text-left">
          {activeProject ? activeProject.name : 'Playground'}
        </span>

        <ChevronDown className={cn(
          'size-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={cn(
          'absolute top-full left-0 z-50 mt-1 w-72',
          'rounded-lg border border-border/60 bg-popover/95 backdrop-blur-xl',
          'shadow-lg shadow-black/10 dark:shadow-black/30',
          'animate-in fade-in-0 zoom-in-95 duration-150'
        )}>
          {/* Option: aucun projet */}
          <div className="p-1">
            <button
              onClick={() => handleSelect(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'hover:bg-accent',
                !activeProjectId && 'bg-accent text-accent-foreground'
              )}
            >
              <FolderOpen className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Playground</span>
            </button>
          </div>

          {/* Liste des projets */}
          {projects.length > 0 && (
            <div className="border-t border-border/40 p-1">
              {projects.map((project) => (
                <div key={project.id} className="group relative">
                  {confirmDeleteId === project.id ? (
                    <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2">
                      <span className="flex-1 text-xs text-destructive">Supprimer ?</span>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="rounded px-2 py-0.5 text-xs font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors"
                      >
                        Oui
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                        className="rounded px-2 py-0.5 text-xs font-medium border border-border hover:bg-accent transition-colors"
                      >
                        Non
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelect(project.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                        'hover:bg-accent',
                        activeProjectId === project.id && 'bg-accent text-accent-foreground'
                      )}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                        style={{ backgroundColor: project.color ?? '#78716c' }}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <span className="block truncate">{project.name}</span>
                        {project.systemPrompt && (
                          <span className="block truncate text-[10px] text-muted-foreground/60">
                            {project.systemPrompt.slice(0, 60)}{project.systemPrompt.length > 60 ? '...' : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(project.id) }}
                          className="rounded p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions projets */}
          <div className="border-t border-border/40 p-1">
            <button
              onClick={openNewProject}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'text-primary hover:bg-primary/5'
              )}
            >
              <Plus className="size-4" />
              <span className="font-medium">Nouveau projet</span>
            </button>
            <button
              onClick={() => { setIsOpen(false); setCurrentView('projects') }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Settings2 className="size-4" />
              <span>Gerer les projets...</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
