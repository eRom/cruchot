import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Search,
  BookOpen,
  Pencil,
  Trash2,
  ArrowUpDown,
  FileText,
  Puzzle,
  ArrowLeft,
  Copy,
  Check,
  Variable
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePromptsStore, type Prompt } from '@/stores/prompts.store'
import { cn } from '@/lib/utils'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit'
type FilterType = 'all' | 'complet' | 'complement'

// ── Type label/icon helpers ──────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  complet: { label: 'Complet', icon: FileText, color: 'text-blue-500' },
  complement: { label: 'Complement', icon: Puzzle, color: 'text-amber-500' }
}

// ── Main view ────────────────────────────────────────────────

export function PromptsView() {
  const { prompts, setPrompts, addPrompt, updatePrompt, removePrompt } = usePromptsStore()

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [subView, setSubView] = useState<SubView>('grid')
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Load prompts ───────────────────────────────────────────
  useEffect(() => {
    window.api.getPrompts().then(setPrompts).catch(console.error)
  }, [setPrompts])

  // ── Filtered + sorted ──────────────────────────────────────
  const filteredPrompts = useMemo(() => {
    let list = prompts

    if (filterType !== 'all') {
      list = list.filter((p) => p.type === filterType)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.tags?.some((t) => t.toLowerCase().includes(q))
      )
    }

    const sorted = [...list]
    switch (sortMode) {
      case 'name':
        sorted.sort((a, b) => a.title.localeCompare(b.title))
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
  }, [prompts, search, sortMode, filterType])

  // ── Handlers ───────────────────────────────────────────────
  const handleCreate = useCallback(
    async (data: PromptFormData) => {
      const prompt = await window.api.createPrompt({
        title: data.title.trim(),
        content: data.content,
        category: data.category || undefined,
        tags: data.tags.length > 0 ? data.tags : undefined,
        type: data.type,
        variables: data.variables.length > 0 ? data.variables : undefined
      })
      addPrompt(prompt)
      setSubView('grid')
    },
    [addPrompt]
  )

  const handleEdit = useCallback(
    async (data: PromptFormData) => {
      if (!editingPrompt) return
      const updated = await window.api.updatePrompt(editingPrompt.id, {
        title: data.title.trim(),
        content: data.content,
        category: data.category || null,
        tags: data.tags.length > 0 ? data.tags : null,
        type: data.type,
        variables: data.variables.length > 0 ? data.variables : null
      })
      if (updated) updatePrompt(editingPrompt.id, updated)
      setEditingPrompt(null)
      setSubView('grid')
    },
    [editingPrompt, updatePrompt]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.deletePrompt(id)
      removePrompt(id)
      setConfirmDeleteId(null)
    },
    [removePrompt]
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }

  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  // ── Sub-view: Formulaire (creation ou edition) ─────────────
  if (subView === 'create') {
    return <PromptForm onSave={handleCreate} onCancel={() => setSubView('grid')} />
  }

  if (subView === 'edit' && editingPrompt) {
    return (
      <PromptForm
        prompt={editingPrompt}
        onSave={handleEdit}
        onCancel={() => {
          setEditingPrompt(null)
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Prompts</h1>
            <Button
              onClick={() => {
                setEditingPrompt(null)
                setSubView('create')
              }}
              className="gap-2"
            >
              <Plus className="size-4" />
              Nouveau prompt
            </Button>
          </div>

          {/* Search + Filter + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des prompts..."
                className="pl-10"
              />
            </div>

            {/* Type filter pills */}
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 p-0.5">
              {(['all', 'complet', 'complement'] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filterType === t
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'all' ? 'Tous' : TYPE_CONFIG[t].label}
                </button>
              ))}
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
          {filteredPrompts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BookOpen className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search || filterType !== 'all'
                  ? 'Aucun prompt ne correspond a votre recherche.'
                  : 'Aucun prompt pour le moment.'}
              </p>
              {!search && filterType === 'all' && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => {
                    setEditingPrompt(null)
                    setSubView('create')
                  }}
                >
                  <Plus className="size-4" />
                  Creer votre premier prompt
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredPrompts.map((prompt) => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  isDeleting={confirmDeleteId === prompt.id}
                  onEdit={() => {
                    setEditingPrompt(prompt)
                    setSubView('edit')
                  }}
                  onDelete={() => setConfirmDeleteId(prompt.id)}
                  onConfirmDelete={() => handleDelete(prompt.id)}
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

// ── Prompt Card ──────────────────────────────────────────────

interface PromptCardProps {
  prompt: Prompt
  isDeleting: boolean
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

function PromptCard({
  prompt,
  isDeleting,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete
}: PromptCardProps) {
  const [copied, setCopied] = useState(false)
  const config = TYPE_CONFIG[prompt.type]
  const TypeIcon = config?.icon ?? FileText

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(prompt.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:border-border',
        'bg-card border-border/60'
      )}
    >
      {/* Type indicator bar */}
      <div
        className={cn(
          'h-1.5 w-full',
          prompt.type === 'complet' && 'bg-blue-500',
          prompt.type === 'complement' && 'bg-amber-500'
        )}
      />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TypeIcon className={cn('size-4 shrink-0', config?.color)} />
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate">
              {prompt.title}
            </h3>
          </div>

          {/* Actions */}
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Copier"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
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

        {/* Category + type badge */}
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              prompt.type === 'complet' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
              prompt.type === 'complement' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}
          >
            {config?.label}
          </span>
          {prompt.category && (
            <span className="text-[10px] text-muted-foreground/60">{prompt.category}</span>
          )}
        </div>

        {/* Content preview */}
        <div className="mt-3 rounded-md bg-muted/40 px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-wrap">
            {prompt.content}
          </p>
        </div>

        {/* Tags + variables */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {prompt.variables && prompt.variables.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Variable className="size-2.5" />
              {prompt.variables.length} variable{prompt.variables.length > 1 ? 's' : ''}
            </span>
          )}
          {prompt.tags?.map((tag) => (
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
            {new Date(prompt.updatedAt).toLocaleDateString('fr-FR', {
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
              Supprimer &quot;{prompt.title}&quot; ?
            </p>
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

// ── Prompt Form ──────────────────────────────────────────────

interface PromptFormData {
  title: string
  content: string
  category: string
  tags: string[]
  type: 'complet' | 'complement'
  variables: Array<{ name: string; description?: string }>
}

interface PromptFormProps {
  prompt?: Prompt | null
  onSave: (data: PromptFormData) => Promise<void>
  onCancel: () => void
}

function PromptForm({ prompt, onSave, onCancel }: PromptFormProps) {
  const [form, setForm] = useState<PromptFormData>({
    title: prompt?.title ?? '',
    content: prompt?.content ?? '',
    category: prompt?.category ?? '',
    tags: prompt?.tags ?? [],
    type: prompt?.type === 'system' ? 'complet' : (prompt?.type ?? 'complet'),
    variables: prompt?.variables ?? []
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)

  const canSave = form.title.trim().length > 0 && form.content.trim().length > 0

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

  const isEditing = !!prompt

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
            Retour aux prompts
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier le prompt' : 'Nouveau prompt'}
          </h1>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Titre</label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Nom du prompt..."
              autoFocus
            />
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Type</label>
            <div className="flex items-center gap-2">
              {(['complet', 'complement'] as const).map((t) => {
                const cfg = TYPE_CONFIG[t]
                const Icon = cfg.icon
                return (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
                      form.type === t
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:border-border hover:bg-accent/50'
                    )}
                  >
                    <Icon className={cn('size-4', cfg.color)} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {form.type === 'complet' && 'Prompt autonome, utilisable directement comme message.'}
              {form.type === 'complement' && "Fragment a inserer dans un prompt plus large."}
            </p>
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Categorie <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="ex: Developpement, Redaction, Analyse..."
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Contenu</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Ecrivez votre prompt ici...&#10;&#10;Utilisez {{variable}} pour les parties dynamiques."
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
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Creer le prompt'}
          </Button>
        </div>
      </div>
    </div>
  )
}
