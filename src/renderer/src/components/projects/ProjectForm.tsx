import { useState, useMemo, useEffect } from 'react'
import { ArrowLeft, FolderOpen, Palette, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useProvidersStore } from '@/stores/providers.store'
import { cn } from '@/lib/utils'
import type { Project } from '@/stores/projects.store'

// ── Palette de couleurs predefinies ──────────────────────────
const PROJECT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#ec4899', // pink
  '#f43f5e', // rose
  '#78716c', // stone
]

// ── Types ────────────────────────────────────────────────────
export interface ProjectFormData {
  name: string
  description: string
  systemPrompt: string
  defaultModelId: string | null
  color: string
  workspacePath: string
}

export interface ProjectFormProps {
  project?: Project | null
  onSave: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
}

export function ProjectForm({ project, onSave, onCancel }: ProjectFormProps) {
  const isEditing = !!project

  const [form, setForm] = useState<ProjectFormData>({
    name: '',
    description: '',
    systemPrompt: '',
    defaultModelId: null,
    color: PROJECT_COLORS[5],
    workspacePath: '',
  })
  const [saving, setSaving] = useState(false)

  // Reset form quand le projet change
  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        description: project.description ?? '',
        systemPrompt: project.systemPrompt ?? '',
        defaultModelId: project.defaultModelId ?? null,
        color: project.color ?? PROJECT_COLORS[5],
        workspacePath: project.workspacePath ?? '',
      })
    } else {
      setForm({
        name: '',
        description: '',
        systemPrompt: '',
        defaultModelId: null,
        color: PROJECT_COLORS[5],
        workspacePath: '',
      })
    }
  }, [project])

  const handleSelectWorkspace = async () => {
    const selected = await window.api.workspaceSelectFolder()
    if (selected) {
      setForm((f) => ({ ...f, workspacePath: selected }))
    }
  }

  // ── Models groupes par provider ────────────────────────────
  const { providers, models } = useProvidersStore()

  const modelGroups = useMemo(() => {
    const groups: { providerName: string; providerId: string; models: { id: string; displayName: string }[] }[] = []

    for (const provider of providers) {
      if (!provider.isEnabled || !provider.isConfigured) continue
      const providerModels = models
        .filter((m) => m.providerId === provider.id)
        .map((m) => ({ id: `${provider.id}::${m.id}`, displayName: m.displayName }))
      if (providerModels.length > 0) {
        groups.push({ providerName: provider.name, providerId: provider.id, models: providerModels })
      }
    }

    return groups
  }, [providers, models])

  // ── Handlers ───────────────────────────────────────────────
  const canSave = form.name.trim().length > 0 && !!form.defaultModelId

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header avec bouton retour ───────────────────────── */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={onCancel}
            className={cn(
              'mb-4 flex items-center gap-1.5 text-sm text-muted-foreground',
              'hover:text-foreground transition-colors'
            )}
          >
            <ArrowLeft className="size-4" />
            Retour aux projets
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier le projet' : 'Nouveau projet'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isEditing
              ? 'Modifiez les parametres de votre projet.'
              : 'Creez un projet avec un contexte personnalise pour vos conversations.'}
          </p>
        </div>
      </div>

      {/* ── Formulaire ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Nom */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nom</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Mon projet..."
              autoFocus
            />
          </div>

          {/* Couleur */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Palette className="size-3.5 text-muted-foreground" />
              Couleur
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  className={cn(
                    'size-8 rounded-full transition-all duration-150',
                    'hover:scale-110 hover:shadow-md',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    form.color === color
                      ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110'
                      : 'ring-1 ring-black/10 dark:ring-white/10'
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Breve description du projet..."
            />
          </div>

          {/* System Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Prompt systeme</label>
            <p className="text-xs text-muted-foreground">
              Instructions envoyees automatiquement au modele pour chaque conversation de ce projet.
            </p>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              placeholder="Tu es un assistant specialise en..."
              rows={5}
              className={cn(
                'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm',
                'placeholder:text-muted-foreground/50',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                'resize-y min-h-[100px] max-h-[300px]',
                'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40'
              )}
            />
          </div>

          {/* Workspace folder */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <FolderOpen className="size-3.5 text-muted-foreground" />
              Dossier workspace
            </label>
            <p className="text-xs text-muted-foreground">
              Associez un dossier pour que le LLM puisse lire et modifier vos fichiers.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={form.workspacePath}
                readOnly
                placeholder="Aucun dossier selectionne..."
                className="flex-1 bg-muted/30 cursor-default"
                onClick={handleSelectWorkspace}
              />
              {form.workspacePath ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setForm((f) => ({ ...f, workspacePath: '' }))}
                  className="size-8 shrink-0"
                  title="Retirer"
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectWorkspace}
                  className="shrink-0"
                >
                  Parcourir
                </Button>
              )}
            </div>
          </div>

          {/* Modele par defaut */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Modele par defaut</label>
            <p className="text-xs text-muted-foreground">
              Modele selectionne automatiquement pour les nouvelles conversations de ce projet.
            </p>
            <Select
              value={form.defaultModelId ?? undefined}
              onValueChange={(value) => setForm((f) => ({ ...f, defaultModelId: value }))}
            >
              <SelectTrigger className={cn('w-full', !form.defaultModelId && 'text-muted-foreground')}>
                <SelectValue placeholder="Selectionner un modele..." />
              </SelectTrigger>
              <SelectContent>
                {modelGroups.map((group, index) => (
                  <div key={group.providerId}>
                    {index > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel>{group.providerName}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </div>
                ))}
                {modelGroups.length === 0 && (
                  <div className="px-4 py-3 text-center text-xs text-muted-foreground">
                    Aucun provider configure.
                  </div>
                )}
              </SelectContent>
            </Select>
            {!form.defaultModelId && (
              <p className="text-[11px] text-destructive/70">Un modele par defaut est requis.</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 pb-8 border-t border-border/40">
            <Button variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'En cours...' : isEditing ? 'Enregistrer' : 'Creer le projet'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
