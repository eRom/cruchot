import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Search,
  UserCircle,
  Pencil,
  Trash2,
  ArrowUpDown,
  ArrowLeft,
  Copy,
  Check,
  Variable,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRolesStore, type Role } from '@/stores/roles.store'
import { cn } from '@/lib/utils'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit'
type FilterCategory = 'all' | string

// ── Main view ────────────────────────────────────────────────

export function RolesView() {
  const { roles, setRoles, addRole, updateRole, removeRole } = useRolesStore()

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [subView, setSubView] = useState<SubView>('grid')
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Load roles ───────────────────────────────────────────
  useEffect(() => {
    window.api.getRoles().then(setRoles).catch(console.error)
  }, [setRoles])

  // ── Categories from roles ──────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const r of roles) {
      if (r.category) cats.add(r.category)
    }
    return Array.from(cats).sort()
  }, [roles])

  // ── Filtered + sorted ──────────────────────────────────────
  const filteredRoles = useMemo(() => {
    let list = roles

    if (filterCategory !== 'all') {
      list = list.filter((r) => r.category === filterCategory)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.systemPrompt?.toLowerCase().includes(q) ||
          r.category?.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.toLowerCase().includes(q))
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
  }, [roles, search, sortMode, filterCategory])

  // ── Handlers ───────────────────────────────────────────────
  const handleCreate = useCallback(
    async (data: RoleFormData) => {
      const role = await window.api.createRole({
        name: data.name.trim(),
        description: data.description || undefined,
        systemPrompt: data.systemPrompt || undefined,
        icon: data.icon || undefined,
        category: data.category || undefined,
        tags: data.tags.length > 0 ? data.tags : undefined,
        variables: data.variables.length > 0 ? data.variables : undefined
      })
      addRole(role)
      setSubView('grid')
    },
    [addRole]
  )

  const handleEdit = useCallback(
    async (data: RoleFormData) => {
      if (!editingRole) return
      const updated = await window.api.updateRole(editingRole.id, {
        name: data.name.trim(),
        description: data.description || null,
        systemPrompt: data.systemPrompt || null,
        icon: data.icon || null,
        category: data.category || null,
        tags: data.tags.length > 0 ? data.tags : null,
        variables: data.variables.length > 0 ? data.variables : null
      })
      if (updated) updateRole(editingRole.id, updated)
      setEditingRole(null)
      setSubView('grid')
    },
    [editingRole, updateRole]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.deleteRole(id)
      removeRole(id)
      setConfirmDeleteId(null)
    },
    [removeRole]
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }

  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  // ── Sub-view: Formulaire (creation ou edition) ─────────────
  if (subView === 'create') {
    return <RoleForm onSave={handleCreate} onCancel={() => setSubView('grid')} />
  }

  if (subView === 'edit' && editingRole) {
    return (
      <RoleForm
        role={editingRole}
        onSave={handleEdit}
        onCancel={() => {
          setEditingRole(null)
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Roles</h1>
            <Button
              onClick={() => {
                setEditingRole(null)
                setSubView('create')
              }}
              className="gap-2"
            >
              <Plus className="size-4" />
              Nouveau role
            </Button>
          </div>

          {/* Search + Filter + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des roles..."
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
          {filteredRoles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <UserCircle className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search || filterCategory !== 'all'
                  ? 'Aucun role ne correspond a votre recherche.'
                  : 'Aucun role pour le moment.'}
              </p>
              {!search && filterCategory === 'all' && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => {
                    setEditingRole(null)
                    setSubView('create')
                  }}
                >
                  <Plus className="size-4" />
                  Creer votre premier role
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredRoles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  isDeleting={confirmDeleteId === role.id}
                  onEdit={() => {
                    setEditingRole(role)
                    setSubView('edit')
                  }}
                  onDelete={() => setConfirmDeleteId(role.id)}
                  onConfirmDelete={() => handleDelete(role.id)}
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

// ── Role Card ──────────────────────────────────────────────

interface RoleCardProps {
  role: Role
  isDeleting: boolean
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function RoleCard({
  role,
  isDeleting,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete
}: RoleCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (role.systemPrompt) {
      await navigator.clipboard.writeText(role.systemPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:border-border',
        'bg-card border-border/60'
      )}
    >
      {/* Color bar */}
      <div className="h-1.5 w-full bg-emerald-500" />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <UserCircle className="size-4 shrink-0 text-emerald-500" />
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate">
              {role.name}
            </h3>
            {role.isBuiltin && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-secondary-foreground">
                <Shield className="size-2.5" />
                Integre
              </span>
            )}
          </div>

          {/* Actions */}
          {!role.isBuiltin && (
            <div
              className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {role.systemPrompt && (
                <button
                  onClick={handleCopy}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Copier le prompt"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              )}
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
          )}

          {/* Builtin roles — edit only */}
          {role.isBuiltin && (
            <div
              className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {role.systemPrompt && (
                <button
                  onClick={handleCopy}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Copier le prompt"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
              )}
              <button
                onClick={onEdit}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Modifier"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Content preview */}
        {role.systemPrompt && (
          <div className="mt-3 rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-wrap">
              {role.systemPrompt}
            </p>
          </div>
        )}

        {/* Tags + variables */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {role.variables && role.variables.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-600 dark:text-violet-400">
              <Variable className="size-2.5" />
              {role.variables.length} variable{role.variables.length > 1 ? 's' : ''}
            </span>
          )}
          {role.tags?.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer — date */}
        <div className="mt-auto pt-3">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(role.updatedAt).toLocaleDateString('fr-FR', {
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
              Supprimer &quot;{role.name}&quot; ?
            </p>
            <p className="text-xs text-muted-foreground">
              Les conversations utilisant ce role perdront leur reference.
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

// ── Role Form ──────────────────────────────────────────────

interface RoleFormData {
  name: string
  description: string
  systemPrompt: string
  icon: string
  category: string
  tags: string[]
  variables: Array<{ name: string; description?: string }>
}

interface RoleFormProps {
  role?: Role | null
  onSave: (data: RoleFormData) => Promise<void>
  onCancel: () => void
}

function RoleForm({ role, onSave, onCancel }: RoleFormProps) {
  const [form, setForm] = useState<RoleFormData>({
    name: role?.name ?? '',
    description: role?.description ?? '',
    systemPrompt: role?.systemPrompt ?? '',
    icon: role?.icon ?? '',
    category: role?.category ?? '',
    tags: role?.tags ?? [],
    variables: role?.variables ?? []
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = form.name.trim().length > 0

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }))
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))
  }

  const handleAddVariable = () => {
    setForm((f) => ({ ...f, variables: [...f.variables, { name: '', description: '' }] }))
  }

  const handleUpdateVariable = (
    index: number,
    field: 'name' | 'description',
    value: string
  ) => {
    setForm((f) => ({
      ...f,
      variables: f.variables.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    }))
  }

  const handleRemoveVariable = (index: number) => {
    setForm((f) => ({ ...f, variables: f.variables.filter((_, i) => i !== index) }))
  }

  const isEditing = !!role

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
            Retour aux roles
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier le role' : 'Nouveau role'}
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
              placeholder="Nom du role..."
              autoFocus
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Prompt systeme</label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder={"Instructions pour le modele...\n\nUtilisez {{variable}} pour les parties dynamiques."}
              rows={10}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'resize-y font-mono leading-relaxed'
              )}
            />
          </div>

          {/* Variables */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">
                Variables <span className="text-muted-foreground/60">(optionnel)</span>
              </label>
              <Button variant="outline" size="sm" onClick={handleAddVariable} className="gap-1.5">
                <Plus className="size-3.5" />
                Ajouter
              </Button>
            </div>

            {form.variables.length > 0 && (
              <div className="space-y-2">
                {form.variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={v.name}
                      onChange={(e) => handleUpdateVariable(i, 'name', e.target.value)}
                      placeholder="Nom de la variable"
                      className="flex-1"
                    />
                    <Input
                      value={v.description ?? ''}
                      onChange={(e) => handleUpdateVariable(i, 'description', e.target.value)}
                      placeholder="Description (optionnel)"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveVariable(i)}
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Tags <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Ajouter un tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleAddTag} disabled={!tagInput.trim()}>
                Ajouter
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-0.5 rounded-full hover:text-foreground transition-colors"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer — Save / Cancel */}
      <div className="shrink-0 border-t border-border/40 px-8 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Creer le role'}
          </Button>
        </div>
      </div>
    </div>
  )
}
