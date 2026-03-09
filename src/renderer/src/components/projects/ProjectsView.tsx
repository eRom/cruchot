import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Search, FolderOpen, Pencil, Trash2, MessageSquare, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProjectsStore, type Project } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useUiStore } from '@/stores/ui.store'
import { ProjectForm, type ProjectFormData } from './ProjectForm'
import { cn } from '@/lib/utils'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit'

export function ProjectsView() {
  const { projects, setProjects, setActiveProject, addProject, updateProject, removeProject } =
    useProjectsStore()
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const selectModel = useProvidersStore((s) => s.selectModel)

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [subView, setSubView] = useState<SubView>('grid')
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Load projects ──────────────────────────────────────────
  useEffect(() => {
    window.api.getProjects().then(setProjects).catch(console.error)
  }, [setProjects])

  // ── Filtered + sorted ─────────────────────────────────────
  const filteredProjects = useMemo(() => {
    let list = projects

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.systemPrompt?.toLowerCase().includes(q)
      )
    }

    const sorted = [...list]
    switch (sortMode) {
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'created':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'activity':
      default:
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        break
    }

    return sorted
  }, [projects, search, sortMode])

  // ── Handlers ───────────────────────────────────────────────
  const handleSelectProject = useCallback(
    (project: Project) => {
      setActiveProject(project.id)
      if (project.defaultModelId) {
        const [providerId, modelId] = project.defaultModelId.split('::')
        if (providerId && modelId) selectModel(providerId, modelId)
      }
      setCurrentView('chat')
    },
    [setActiveProject, setCurrentView, selectModel]
  )

  const handleCreate = useCallback(
    async (data: ProjectFormData) => {
      const project = await window.api.createProject({
        name: data.name.trim(),
        description: data.description || undefined,
        systemPrompt: data.systemPrompt || undefined,
        defaultModelId: data.defaultModelId ?? undefined,
        color: data.color,
      })
      addProject(project)
      setSubView('grid')
    },
    [addProject]
  )

  const handleEdit = useCallback(
    async (data: ProjectFormData) => {
      if (!editingProject) return
      const updated = await window.api.updateProject(editingProject.id, {
        name: data.name.trim(),
        description: data.description || null,
        systemPrompt: data.systemPrompt || null,
        defaultModelId: data.defaultModelId,
        color: data.color,
      })
      if (updated) updateProject(editingProject.id, updated)
      setEditingProject(null)
      setSubView('grid')
    },
    [editingProject, updateProject]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.deleteProject(id)
      removeProject(id)
      setConfirmDeleteId(null)
    },
    [removeProject]
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }

  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  // ── Sub-view: Formulaire (creation ou edition) ─────────────
  if (subView === 'create') {
    return (
      <ProjectForm
        onSave={handleCreate}
        onCancel={() => setSubView('grid')}
      />
    )
  }

  if (subView === 'edit' && editingProject) {
    return (
      <ProjectForm
        project={editingProject}
        onSave={handleEdit}
        onCancel={() => { setEditingProject(null); setSubView('grid') }}
      />
    )
  }

  // ── Sub-view: Grille ───────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projets</h1>
            <Button
              onClick={() => { setEditingProject(null); setSubView('create') }}
              className="gap-2"
            >
              <Plus className="size-4" />
              Nouveau projet
            </Button>
          </div>

          {/* Search + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des projets..."
                className="pl-10"
              />
            </div>
            <button
              onClick={cycleSortMode}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-md border border-border/60 px-3 py-2',
                'text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors'
              )}
            >
              <span className="text-xs text-muted-foreground/60">Trier par</span>
              <span className="font-medium">{sortLabel}</span>
              <ArrowUpDown className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FolderOpen className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search ? 'Aucun projet ne correspond a votre recherche.' : 'Aucun projet pour le moment.'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => { setEditingProject(null); setSubView('create') }}
                >
                  <Plus className="size-4" />
                  Creer votre premier projet
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  isDeleting={confirmDeleteId === project.id}
                  onClick={() => handleSelectProject(project)}
                  onEdit={() => { setEditingProject(project); setSubView('edit') }}
                  onDelete={() => setConfirmDeleteId(project.id)}
                  onConfirmDelete={() => handleDelete(project.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Project Card ─────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
  isDeleting: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function ProjectCard({
  project,
  isDeleting,
  onClick,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete
}: ProjectCardProps) {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:border-border cursor-pointer',
        'bg-card border-border/60'
      )}
      onClick={onClick}
    >
      {/* Color accent bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: project.color ?? '#78716c' }}
      />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug">
            {project.name}
          </h3>

          {/* Actions — visible on hover */}
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
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

        {/* Description */}
        {project.description && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {project.description}
          </p>
        )}

        {/* System prompt preview */}
        {project.systemPrompt && (
          <div className="mt-3 flex items-start gap-1.5 rounded-md bg-muted/40 px-2.5 py-2">
            <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground/50" />
            <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-2">
              {project.systemPrompt}
            </p>
          </div>
        )}

        {/* Footer — date */}
        <div className="mt-auto pt-3">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(project.updatedAt).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {isDeleting && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-foreground">Supprimer "{project.name}" ?</p>
            <p className="text-xs text-muted-foreground">Cette action est irreversible.</p>
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
