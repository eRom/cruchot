import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLibraryStore } from '@/stores/library.store'
import { useProjectsStore } from '@/stores/projects.store'
import type { LibraryInfo } from '../../../../preload/types'
import {
  ArrowLeft,
  ArrowUpDown,
  BookOpen,
  Database,
  FileText,
  Library,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { LibraryDetailView } from './LibraryDetailView'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit' | 'detail'

const LIBRARY_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'
]

export function LibrariesView() {
  const { libraries, setLibraries, addLibrary, updateLibrary, removeLibrary, loading } = useLibraryStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [subView, setSubView] = useState<SubView>('grid')
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryInfo | null>(null)
  const [editingLibrary, setEditingLibrary] = useState<LibraryInfo | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Load libraries ───────────────────────────────────────────
  useEffect(() => {
    window.api.libraryList().then(setLibraries).catch(console.error)
  }, [setLibraries])

  // ── Filtered + sorted ──────────────────────────────────────
  const filteredLibraries = useMemo(() => {
    let list = libraries

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.description?.toLowerCase().includes(q)
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
  }, [libraries, search, sortMode])

  // ── Handlers ───────────────────────────────────────────────
  const handleCreate = useCallback(
    async (data: LibraryFormData) => {
      const lib = await window.api.libraryCreate({
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        color: data.color || undefined,
        icon: data.icon || undefined,
        projectId: data.projectId || undefined,
        embeddingModel: data.embeddingModel
      })
      addLibrary(lib)
      setSubView('grid')
      toast.success('Referentiel cree')
    },
    [addLibrary]
  )

  const handleEdit = useCallback(
    async (data: LibraryFormData) => {
      if (!editingLibrary) return
      const updated = await window.api.libraryUpdate({
        id: editingLibrary.id,
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        color: data.color || undefined,
        icon: data.icon || undefined
      })
      if (updated) updateLibrary(editingLibrary.id, updated)
      setEditingLibrary(null)
      setSubView('grid')
      toast.success('Referentiel modifie')
    },
    [editingLibrary, updateLibrary]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.libraryDelete({ id })
      removeLibrary(id)
      setConfirmDeleteId(null)
      toast.success('Referentiel supprime')
    },
    [removeLibrary]
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }
  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  // ── Sub-view: Detail ─────────────────────────────────────────
  if (subView === 'detail' && selectedLibrary) {
    return (
      <LibraryDetailView
        library={selectedLibrary}
        onBack={() => {
          setSelectedLibrary(null)
          setSubView('grid')
          // Refresh libraries list
          window.api.libraryList().then(setLibraries).catch(console.error)
        }}
        onEdit={() => {
          setEditingLibrary(selectedLibrary)
          setSubView('edit')
        }}
      />
    )
  }

  // ── Sub-view: Formulaire (creation ou edition) ─────────────
  if (subView === 'create') {
    return <LibraryForm onSave={handleCreate} onCancel={() => setSubView('grid')} />
  }

  if (subView === 'edit' && editingLibrary) {
    return (
      <LibraryForm
        library={editingLibrary}
        onSave={handleEdit}
        onCancel={() => {
          setEditingLibrary(null)
          setSubView('grid')
        }}
      />
    )
  }

  // ── Sub-view: Grille ───────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Referentiels</h1>
            <Button
              onClick={() => {
                setEditingLibrary(null)
                setSubView('create')
              }}
              className="gap-2"
            >
              <Plus className="size-4" />
              Nouveau referentiel
            </Button>
          </div>

          {/* Search + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des referentiels..."
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

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLibraries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Library className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search
                  ? 'Aucun referentiel ne correspond a votre recherche.'
                  : 'Aucun referentiel pour le moment.'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => {
                    setEditingLibrary(null)
                    setSubView('create')
                  }}
                >
                  <Plus className="size-4" />
                  Creer votre premier referentiel
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredLibraries.map((lib) => (
                <LibraryCard
                  key={lib.id}
                  library={lib}
                  isDeleting={confirmDeleteId === lib.id}
                  onClick={() => {
                    setSelectedLibrary(lib)
                    setSubView('detail')
                  }}
                  onEdit={() => {
                    setEditingLibrary(lib)
                    setSubView('edit')
                  }}
                  onDelete={() => setConfirmDeleteId(lib.id)}
                  onConfirmDelete={() => handleDelete(lib.id)}
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

// ── Library Card ──────────────────────────────────────────────

interface LibraryCardProps {
  library: LibraryInfo
  isDeleting: boolean
  onClick: () => void
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function LibraryCard({
  library,
  isDeleting,
  onClick,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete
}: LibraryCardProps) {
  const statusLabel = library.status === 'ready'
    ? 'Pret'
    : library.status === 'indexing'
      ? 'Indexation...'
      : library.status === 'error'
        ? 'Erreur'
        : 'Vide'

  const statusColor = library.status === 'ready'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    : library.status === 'indexing'
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : library.status === 'error'
        ? 'bg-red-500/10 text-red-600 dark:text-red-400'
        : 'bg-gray-500/10 text-gray-600 dark:text-gray-400'

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer',
        'hover:shadow-md hover:border-border',
        'bg-card border-border/60'
      )}
    >
      {/* Color bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: library.color || '#6366f1' }}
      />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{library.icon || '📚'}</span>
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate">
              {library.name}
            </h3>
          </div>

          {/* Actions */}
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
        {library.description && (
          <p className="mt-1.5 text-xs text-muted-foreground/70 line-clamp-2">
            {library.description}
          </p>
        )}

        {/* Stats row */}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground/60">
          <span className="flex items-center gap-1">
            <FileText className="size-3" />
            {library.sourcesCount} source{library.sourcesCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Database className="size-3" />
            {library.chunksCount} chunk{library.chunksCount !== 1 ? 's' : ''}
          </span>
          <span
            className={cn(
              'ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              statusColor
            )}
          >
            {library.status === 'indexing' && <Loader2 className="mr-1 size-3 animate-spin" />}
            {statusLabel}
          </span>
        </div>

        {/* Embedding model badge */}
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {library.embeddingModel === 'google' ? 'Gemini Embedding' : 'Local (MiniLM)'}
          </span>
        </div>

        {/* Footer — date */}
        <div className="mt-auto pt-3">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(library.updatedAt).toLocaleDateString('fr-FR', {
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
            <p className="text-sm font-medium text-foreground">
              Supprimer &quot;{library.name}&quot; ?
            </p>
            <p className="text-xs text-muted-foreground">
              Toutes les sources et chunks seront supprimes. Cette action est irreversible.
            </p>
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

// ── Library Form ──────────────────────────────────────────────

interface LibraryFormData {
  name: string
  description: string
  color: string
  icon: string
  projectId: string
  embeddingModel: 'local' | 'google'
}

interface LibraryFormProps {
  library?: LibraryInfo | null
  onSave: (data: LibraryFormData) => Promise<void>
  onCancel: () => void
}

function LibraryForm({ library, onSave, onCancel }: LibraryFormProps) {
  const projects = useProjectsStore((s) => s.projects)

  const [form, setForm] = useState<LibraryFormData>({
    name: library?.name ?? '',
    description: library?.description ?? '',
    color: library?.color ?? LIBRARY_COLORS[0],
    icon: library?.icon ?? '📚',
    projectId: library?.projectId ?? '',
    embeddingModel: library?.embeddingModel ?? 'local'
  })
  const [saving, setSaving] = useState(false)

  const canSave = form.name.trim().length > 0

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const isEditing = !!library

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-3xl">
          <button
            onClick={onCancel}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Retour aux referentiels
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier le referentiel' : 'Nouveau referentiel'}
          </h1>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nom</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Documentation React 19, API Reference..."
              autoFocus
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Description <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description du referentiel..."
              maxLength={500}
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Couleur</label>
            <div className="flex items-center gap-2">
              {LIBRARY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={cn(
                    'size-7 rounded-full transition-all',
                    form.color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-primary scale-110' : 'hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Icone <span className="text-muted-foreground/60">(emoji)</span>
            </label>
            <Input
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              placeholder="📚"
              maxLength={4}
              className="w-20 text-center text-lg"
            />
          </div>

          {/* Embedding model — only on creation */}
          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Modele d'embedding</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setForm((f) => ({ ...f, embeddingModel: 'local' }))}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-4 transition-all',
                    form.embeddingModel === 'local'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border/60 hover:border-border'
                  )}
                >
                  <span className="text-sm font-medium">Local (MiniLM)</span>
                  <span className="text-xs text-muted-foreground">384 dimensions, gratuit, hors-ligne</span>
                </button>
                <button
                  onClick={() => setForm((f) => ({ ...f, embeddingModel: 'google' }))}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-4 transition-all',
                    form.embeddingModel === 'google'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border/60 hover:border-border'
                  )}
                >
                  <span className="text-sm font-medium">Google (Gemini)</span>
                  <span className="text-xs text-muted-foreground">768 dimensions, meilleure qualite, cle API requise</span>
                </button>
              </div>
            </div>
          )}

          {/* Project scope */}
          {projects.length > 0 && !isEditing && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Projet <span className="text-muted-foreground/60">(optionnel)</span>
              </label>
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm ring-offset-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              >
                <option value="">Tous les projets</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Footer — Save / Cancel */}
      <div className="shrink-0 border-t border-border/40 px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Creer le referentiel'}
          </Button>
        </div>
      </div>
    </div>
  )
}
