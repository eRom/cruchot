import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useProjectsStore } from '@/stores/projects.store'
import { useSlashCommandsStore, type SlashCommand } from '@/stores/slash-commands.store'
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TerminalSquare,
  Trash2,
  Upload
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useBardaStore } from '@/stores/barda.store'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit'
type FilterScope = 'all' | 'builtin' | 'custom'

// ── Export / Import helpers ──────────────────────────────────

function exportCommandsToJson(commands: SlashCommand[]): void {
  const data = {
    type: 'multi-llm-commands',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: commands.map(({ name, description, prompt, category }) => ({
      name,
      description,
      prompt,
      ...(category && { category })
    }))
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `commands-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function uniqueName(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name
  let i = 1
  while (existing.has(`${name}-${i}`)) i++
  return `${name}-${i}`
}

// ── Main view ────────────────────────────────────────────────

export function CommandsView() {
  const { commands, setCommands, addCommand, updateCommand, removeCommand } = useSlashCommandsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const disabledNamespaces = useBardaStore((s) => s.disabledNamespaces)
  const projects = useProjectsStore((s) => s.projects)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [filterScope, setFilterScope] = useState<FilterScope>('all')
  const [subView, setSubView] = useState<SubView>('grid')
  const [editingCommand, setEditingCommand] = useState<SlashCommand | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // ── Load commands ───────────────────────────────────────────
  useEffect(() => {
    window.api.slashCommandsList().then(setCommands).catch(console.error)
  }, [setCommands])

  // ── Filtered + sorted ──────────────────────────────────────
  const filteredCommands = useMemo(() => {
    let list = commands.filter((c) => !c.namespace || !disabledNamespaces.has(c.namespace))

    if (filterScope === 'builtin') {
      list = list.filter((c) => c.isBuiltin)
    } else if (filterScope === 'custom') {
      list = list.filter((c) => !c.isBuiltin)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category?.toLowerCase().includes(q)
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
  }, [commands, search, sortMode, filterScope])

  // ── Grouped by scope ──────────────────────────────────────
  const globalCommands = useMemo(
    () => filteredCommands.filter((c) => !c.projectId),
    [filteredCommands]
  )
  const projectCommands = useMemo(
    () => filteredCommands.filter((c) => c.projectId),
    [filteredCommands]
  )

  // ── Handlers ───────────────────────────────────────────────
  const handleCreate = useCallback(
    async (data: CommandFormData) => {
      const cmd = await window.api.slashCommandsCreate({
        name: data.name.trim(),
        description: data.description.trim(),
        prompt: data.prompt,
        category: data.category || undefined,
        projectId: data.projectId || undefined
      })
      addCommand(cmd)
      setSubView('grid')
    },
    [addCommand]
  )

  const handleEdit = useCallback(
    async (data: CommandFormData) => {
      if (!editingCommand) return
      const updated = await window.api.slashCommandsUpdate(editingCommand.id, {
        name: data.name.trim(),
        description: data.description.trim(),
        prompt: data.prompt,
        category: data.category || null,
        projectId: data.projectId || null
      })
      if (updated) updateCommand(editingCommand.id, updated)
      setEditingCommand(null)
      setSubView('grid')
    },
    [editingCommand, updateCommand]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.slashCommandsDelete(id)
      removeCommand(id)
      setConfirmDeleteId(null)
    },
    [removeCommand]
  )

  const handleReset = useCallback(
    async (id: string) => {
      const updated = await window.api.slashCommandsReset(id)
      if (updated) {
        updateCommand(id, updated)
        toast.success('Commande reinitalisee')
      }
    },
    [updateCommand]
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }

  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 1_000_000) {
        toast.error('Fichier trop volumineux (max 1 MB)')
        return
      }
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (parsed.type !== 'multi-llm-commands' || !Array.isArray(parsed.items) || parsed.items.length === 0) {
          toast.error('Fichier invalide')
          return
        }
        if (parsed.items.length > 100) {
          toast.error('Maximum 100 commandes par import')
          return
        }
        const existingNames = new Set(commands.map((c) => c.name))
        let imported = 0
        for (const item of parsed.items) {
          if (!item.name || !item.description || !item.prompt) continue
          const name = uniqueName(item.name, existingNames)
          existingNames.add(name)
          const created = await window.api.slashCommandsCreate({
            name,
            description: item.description,
            prompt: item.prompt,
            category: item.category
          })
          addCommand(created)
          imported++
        }
        toast.success(`${imported} commande${imported > 1 ? 's' : ''} importee${imported > 1 ? 's' : ''}`)
      } catch {
        toast.error('Fichier JSON invalide')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [commands, addCommand]
  )

  // ── Sub-view: Formulaire (creation ou edition) ─────────────
  if (subView === 'create') {
    return <CommandForm onSave={handleCreate} onCancel={() => setSubView('grid')} projects={projects} activeProjectId={activeProjectId} />
  }

  if (subView === 'edit' && editingCommand) {
    return (
      <CommandForm
        command={editingCommand}
        onSave={handleEdit}
        onCancel={() => {
          setEditingCommand(null)
          setSubView('grid')
        }}
        projects={projects}
        activeProjectId={activeProjectId}
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Commandes</h1>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => exportCommandsToJson(commands.filter((c) => !c.isBuiltin))}
                    disabled={commands.filter((c) => !c.isBuiltin).length === 0}
                    className="size-9 text-muted-foreground hover:text-foreground"
                  >
                    <Download className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Exporter les commandes</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    className="size-9 text-muted-foreground hover:text-foreground"
                  >
                    <Upload className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Importer des commandes</TooltipContent>
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                onClick={() => {
                  setEditingCommand(null)
                  setSubView('create')
                }}
                className="gap-2 ml-1"
              >
                <Plus className="size-4" />
                Nouvelle commande
              </Button>
            </div>
          </div>

          {/* Search + Filter + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des commandes..."
                className="pl-10"
              />
            </div>

            {/* Scope filter pills */}
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-border/60 p-0.5">
              {(['all', 'builtin', 'custom'] as FilterScope[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterScope(t)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    filterScope === t
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t === 'all' ? 'Toutes' : t === 'builtin' ? 'Integrees' : 'Personnalisees'}
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
          {filteredCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <TerminalSquare className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search || filterScope !== 'all'
                  ? 'Aucune commande ne correspond a votre recherche.'
                  : 'Aucune commande pour le moment.'}
              </p>
              {!search && filterScope === 'all' && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => {
                    setEditingCommand(null)
                    setSubView('create')
                  }}
                >
                  <Plus className="size-4" />
                  Creer votre premiere commande
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Global + builtin commands */}
              {globalCommands.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Commandes globales
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {globalCommands.map((cmd) => (
                      <CommandCard
                        key={cmd.id}
                        command={cmd}
                        isDeleting={confirmDeleteId === cmd.id}
                        onExport={() => exportCommandsToJson([cmd])}
                        onEdit={() => {
                          setEditingCommand(cmd)
                          setSubView('edit')
                        }}
                        onDelete={() => setConfirmDeleteId(cmd.id)}
                        onConfirmDelete={() => handleDelete(cmd.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onReset={() => handleReset(cmd.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Project-scoped commands */}
              {projectCommands.length > 0 && (
                <div>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Commandes projet
                  </h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {projectCommands.map((cmd) => (
                      <CommandCard
                        key={cmd.id}
                        command={cmd}
                        isDeleting={confirmDeleteId === cmd.id}
                        onExport={() => exportCommandsToJson([cmd])}
                        onEdit={() => {
                          setEditingCommand(cmd)
                          setSubView('edit')
                        }}
                        onDelete={() => setConfirmDeleteId(cmd.id)}
                        onConfirmDelete={() => handleDelete(cmd.id)}
                        onCancelDelete={() => setConfirmDeleteId(null)}
                        onReset={() => handleReset(cmd.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Command Card ──────────────────────────────────────────────

interface CommandCardProps {
  command: SlashCommand
  isDeleting: boolean
  onExport: () => void
  onEdit: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onReset: () => void
}

function CommandCard({
  command,
  isDeleting,
  onExport,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onReset
}: CommandCardProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(`/${command.name}`)
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
          command.isBuiltin ? 'bg-gray-500' : 'bg-gray-500'
        )}
      />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate font-mono">
              /{command.name}
            </h3>
          </div>

          {/* Actions */}
          <div
            className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => { e.stopPropagation(); onExport() }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Exporter"
            >
              <Download className="size-3.5" />
            </button>
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
            {command.isBuiltin ? (
              <button
                onClick={onReset}
                className="rounded-md p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Reinitialiser"
              >
                <RotateCcw className="size-3.5" />
              </button>
            ) : (
              <button
                onClick={onDelete}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-1.5 text-xs text-muted-foreground/70 line-clamp-1">
          {command.description}
        </p>

        {/* Category + scope badge */}
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              command.isBuiltin
                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            )}
          >
            {command.isBuiltin ? 'Integree' : 'Personnalisee'}
          </span>
          {command.category && (
            <span className="text-[10px] text-muted-foreground/60">{command.category}</span>
          )}
        </div>

        {/* Prompt preview */}
        <div className="mt-3 rounded-md bg-muted/40 px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3 whitespace-pre-wrap font-mono">
            {command.prompt}
          </p>
        </div>

        {/* Footer — date */}
        <div className="mt-auto pt-3">
          <span className="text-[10px] text-muted-foreground/40">
            {new Date(command.updatedAt).toLocaleDateString('fr-FR', {
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
              Supprimer &quot;/{command.name}&quot; ?
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

// ── Command Form ──────────────────────────────────────────────

interface CommandFormData {
  name: string
  description: string
  prompt: string
  category: string
  projectId: string
}

interface CommandFormProps {
  command?: SlashCommand | null
  onSave: (data: CommandFormData) => Promise<void>
  onCancel: () => void
  projects: Array<{ id: string; name: string }>
  activeProjectId: string | null
}

function CommandForm({ command, onSave, onCancel, projects, activeProjectId }: CommandFormProps) {
  const [form, setForm] = useState<CommandFormData>({
    name: command?.name ?? '',
    description: command?.description ?? '',
    prompt: command?.prompt ?? '',
    category: command?.category ?? '',
    projectId: command?.projectId ?? ''
  })
  const [saving, setSaving] = useState(false)
  const [previewArgs, setPreviewArgs] = useState('')

  const canSave = form.name.trim().length > 0 &&
    form.description.trim().length > 0 &&
    form.prompt.trim().length > 0 &&
    /^[a-z][a-z0-9-]*$/.test(form.name.trim())

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

  // Auto-format name to kebab-case
  const handleNameChange = (value: string) => {
    const formatted = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-')
    setForm((f) => ({ ...f, name: formatted }))
  }

  // Preview resolved prompt
  const resolvedPreview = useMemo(() => {
    if (!previewArgs && !form.prompt.includes('$')) return null
    const args = parseArgs(previewArgs)
    let resolved = form.prompt
    resolved = resolved.replace(/\$ARGS/g, args.join(' '))
    resolved = resolved.replace(/\$MODEL/g, '(modele actif)')
    resolved = resolved.replace(/\$PROJECT/g, '(projet actif)')
    resolved = resolved.replace(/\$WORKSPACE/g, '(workspace actif)')
    resolved = resolved.replace(/\$DATE/g, new Date().toISOString().split('T')[0])
    for (let i = 0; i < args.length; i++) {
      resolved = resolved.replace(new RegExp(`\\$${i + 1}`, 'g'), args[i])
    }
    // Clean remaining $N
    resolved = resolved.replace(/\$\d+/g, '')
    return resolved
  }, [form.prompt, previewArgs])

  const isEditing = !!command

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
            Retour aux commandes
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier la commande' : 'Nouvelle commande'}
          </h1>
        </div>
      </div>

      {/* Form body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nom</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 font-mono">/</span>
              <Input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="ma-commande"
                className="pl-7 font-mono"
                autoFocus
                maxLength={50}
                disabled={command?.isBuiltin}
              />
            </div>
            <p className="text-xs text-muted-foreground/60">
              Lettres minuscules, chiffres et tirets. Commence par une lettre.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description courte affichee dans l'autocomplete..."
              maxLength={200}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Categorie <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="ex: code, general, git, devops..."
              maxLength={50}
            />
          </div>

          {/* Scope */}
          {!command?.isBuiltin && projects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Scope</label>
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm ring-offset-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              >
                <option value="">Global</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Prompt template */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Prompt template</label>
            <textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder={'Ecrivez le prompt template...\n\nVariables disponibles : $ARGS, $1, $2, $MODEL, $PROJECT, $WORKSPACE, $DATE'}
              rows={8}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'resize-y font-mono leading-relaxed'
              )}
            />
            <div className="flex flex-wrap gap-1.5">
              {['$ARGS', '$1', '$2', '$MODEL', '$PROJECT', '$WORKSPACE', '$DATE'].map((v) => (
                <span
                  key={v}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground cursor-pointer hover:bg-muted/80"
                  onClick={() => setForm((f) => ({ ...f, prompt: f.prompt + v }))}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Apercu <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Input
              value={previewArgs}
              onChange={(e) => setPreviewArgs(e.target.value)}
              placeholder='Arguments de test, ex: "Hello world" en francais'
            />
            {resolvedPreview && (
              <div className="rounded-md border border-border/40 bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground/60 mb-1.5">Prompt resolu :</p>
                <p className="text-sm whitespace-pre-wrap text-foreground/80">{resolvedPreview}</p>
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
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Creer la commande'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Argument parser ──────────────────────────────────────────

function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (const char of input) {
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false
        if (current) args.push(current)
        current = ''
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true
      quoteChar = char
    } else if (char === ' ') {
      if (current) args.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current) args.push(current)
  return args
}
