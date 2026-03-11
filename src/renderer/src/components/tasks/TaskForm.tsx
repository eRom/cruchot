import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft,
  Brain,
  Hand,
  Timer,
  CalendarDays,
  CalendarClock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProvidersStore } from '@/stores/providers.store'
import { useRolesStore } from '@/stores/roles.store'
import { useProjectsStore } from '@/stores/projects.store'
import { cn } from '@/lib/utils'
import type { ScheduledTaskInfo, ScheduleType } from '../../../../preload/types'

export interface TaskFormData {
  name: string
  description: string
  prompt: string
  modelId: string
  roleId: string
  projectId: string
  useMemory: boolean
  scheduleType: ScheduleType
  intervalValue: number
  intervalUnit: 'seconds' | 'minutes' | 'hours'
  dailyTime: string
  weeklyDays: number[]
  weeklyTime: string
}

interface TaskFormProps {
  task?: ScheduledTaskInfo | null
  onSave: (data: TaskFormData) => Promise<void>
  onCancel: () => void
}

const DAY_NAMES = [
  { value: 0, label: 'Dim' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' }
]

const SCHEDULE_TYPES: Array<{ value: ScheduleType; label: string; icon: typeof Hand }> = [
  { value: 'manual', label: 'Manuel', icon: Hand },
  { value: 'interval', label: 'Intervalle', icon: Timer },
  { value: 'daily', label: 'Quotidien', icon: CalendarDays },
  { value: 'weekly', label: 'Hebdomadaire', icon: CalendarClock }
]

export function TaskForm({ task, onSave, onCancel }: TaskFormProps) {
  const models = useProvidersStore((s) => s.models)
  const roles = useRolesStore((s) => s.roles)
  const projects = useProjectsStore((s) => s.projects)

  // Load roles/models if not already loaded
  useEffect(() => {
    if (roles.length === 0) {
      window.api.getRoles().then(useRolesStore.getState().setRoles).catch(console.error)
    }
    if (models.length === 0) {
      window.api.getModels().then(useProvidersStore.getState().setModels).catch(console.error)
    }
    if (projects.length === 0) {
      window.api.getProjects().then(useProjectsStore.getState().setProjects).catch(console.error)
    }
  }, [])

  const textModels = useMemo(
    () => models.filter((m) => m.type === 'text'),
    [models]
  )

  const [form, setForm] = useState<TaskFormData>(() => {
    if (task) {
      const config = task.scheduleConfig
      return {
        name: task.name,
        description: task.description,
        prompt: task.prompt,
        modelId: task.modelId,
        roleId: task.roleId ?? '',
        projectId: task.projectId ?? '',
        useMemory: task.useMemory ?? true,
        scheduleType: task.scheduleType,
        intervalValue: config?.value ?? 5,
        intervalUnit: (config?.unit as 'seconds' | 'minutes' | 'hours') ?? 'minutes',
        dailyTime: config?.time ?? '09:00',
        weeklyDays: config?.days ?? [1], // Monday by default
        weeklyTime: config?.time ?? '09:00'
      }
    }
    return {
      name: '',
      description: '',
      prompt: '',
      modelId: '',
      roleId: '',
      projectId: '',
      useMemory: true,
      scheduleType: 'manual',
      intervalValue: 5,
      intervalUnit: 'minutes',
      dailyTime: '09:00',
      weeklyDays: [1],
      weeklyTime: '09:00'
    }
  })

  const [saving, setSaving] = useState(false)

  const scheduleValid = useMemo(() => {
    switch (form.scheduleType) {
      case 'manual':
        return true
      case 'interval':
        return form.intervalValue > 0
      case 'daily':
        return /^\d{2}:\d{2}$/.test(form.dailyTime)
      case 'weekly':
        return form.weeklyDays.length > 0 && /^\d{2}:\d{2}$/.test(form.weeklyTime)
    }
  }, [form.scheduleType, form.intervalValue, form.dailyTime, form.weeklyDays, form.weeklyTime])

  const canSave = form.name.trim() && form.description.trim() && form.prompt.trim() && form.modelId && scheduleValid

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      await onSave(form)
    } finally {
      setSaving(false)
    }
  }

  const toggleWeeklyDay = (day: number) => {
    setForm((f) => ({
      ...f,
      weeklyDays: f.weeklyDays.includes(day)
        ? f.weeklyDays.filter((d) => d !== day)
        : [...f.weeklyDays, day].sort((a, b) => a - b)
    }))
  }

  const isEditing = !!task

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
            Retour aux taches
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isEditing ? 'Modifier la tache' : 'Nouvelle tache'}
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
              placeholder="Nom de la tache..."
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description de la tache..."
              rows={2}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'resize-y leading-relaxed'
              )}
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Prompt</label>
            <textarea
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Le message envoye au LLM a chaque execution..."
              rows={6}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'resize-y font-mono leading-relaxed'
              )}
            />
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Modele</label>
            <Select
              value={form.modelId}
              onValueChange={(value) => setForm((f) => ({ ...f, modelId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un modele..." />
              </SelectTrigger>
              <SelectContent>
                {textModels.map((m) => (
                  <SelectItem key={`${m.providerId}::${m.id}`} value={`${m.providerId}::${m.id}`}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role (optional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Role <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Select
              value={form.roleId || '__none__'}
              onValueChange={(value) => setForm((f) => ({ ...f, roleId: value === '__none__' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucun role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun role</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Memory fragments */}
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Brain className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Utiliser la memoire</p>
                <p className="text-xs text-muted-foreground">Injecter les fragments memoire actifs dans le contexte</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.useMemory}
              onClick={() => setForm((f) => ({ ...f, useMemory: !f.useMemory }))}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
                form.useMemory ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform',
                  form.useMemory ? 'translate-x-4.5' : 'translate-x-0.5'
                )}
                style={{ marginTop: '2px' }}
              />
            </button>
          </div>

          {/* Project (optional) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Projet <span className="text-muted-foreground/60">(optionnel)</span>
            </label>
            <Select
              value={form.projectId || '__none__'}
              onValueChange={(value) => setForm((f) => ({ ...f, projectId: value === '__none__' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Aucun projet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun projet</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Planification</label>

            {/* Schedule type selection */}
            <div className="flex gap-2">
              {SCHEDULE_TYPES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setForm((f) => ({ ...f, scheduleType: value }))}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                    form.scheduleType === value
                      ? 'border-primary bg-primary/5 text-foreground font-medium'
                      : 'border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Conditional config */}
            {form.scheduleType === 'interval' && (
              <div className="flex items-center gap-3 pl-1">
                <span className="text-sm text-muted-foreground">Toutes les</span>
                <Input
                  type="number"
                  min={1}
                  value={form.intervalValue}
                  onChange={(e) => setForm((f) => ({ ...f, intervalValue: parseInt(e.target.value) || 1 }))}
                  className="w-20"
                />
                <Select
                  value={form.intervalUnit}
                  onValueChange={(value) => setForm((f) => ({ ...f, intervalUnit: value as 'seconds' | 'minutes' | 'hours' }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">secondes</SelectItem>
                    <SelectItem value="minutes">minutes</SelectItem>
                    <SelectItem value="hours">heures</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.scheduleType === 'daily' && (
              <div className="flex items-center gap-3 pl-1">
                <span className="text-sm text-muted-foreground">Chaque jour a</span>
                <Input
                  type="time"
                  value={form.dailyTime}
                  onChange={(e) => setForm((f) => ({ ...f, dailyTime: e.target.value }))}
                  className="w-32"
                />
              </div>
            )}

            {form.scheduleType === 'weekly' && (
              <div className="space-y-3 pl-1">
                <div className="flex items-center gap-2">
                  {DAY_NAMES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleWeeklyDay(value)}
                      className={cn(
                        'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                        form.weeklyDays.includes(value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="time"
                    value={form.weeklyTime}
                    onChange={(e) => setForm((f) => ({ ...f, weeklyTime: e.target.value }))}
                    className="w-32"
                  />
                </div>
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
            {saving ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Creer la tache'}
          </Button>
        </div>
      </div>
    </div>
  )
}
