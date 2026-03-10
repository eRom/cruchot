import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Search,
  Clock,
  ArrowUpDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTasksStore } from '@/stores/tasks.store'
import type { ScheduledTaskInfo } from '../../../../preload/types'
import { TaskCard } from './TaskCard'
import { TaskForm, type TaskFormData } from './TaskForm'

type SortMode = 'activity' | 'name' | 'created'
type SubView = 'grid' | 'create' | 'edit'

export function TasksView() {
  const { tasks, setTasks, addTask, updateTask, removeTask } = useTasksStore()

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('activity')
  const [subView, setSubView] = useState<SubView>('grid')
  const [editingTask, setEditingTask] = useState<ScheduledTaskInfo | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Load tasks
  useEffect(() => {
    window.api.getScheduledTasks().then(setTasks).catch(console.error)
  }, [setTasks])

  // Listen for task execution events
  useEffect(() => {
    window.api.onTaskExecuted((data) => {
      // Refresh the task to get updated lastRunAt, runCount, etc.
      window.api.getScheduledTask(data.taskId).then((task) => {
        if (task) updateTask(data.taskId, task)
      })
    })
    return () => {
      window.api.offTaskExecuted()
    }
  }, [updateTask])

  // Filtered + sorted
  const filteredTasks = useMemo(() => {
    let list = tasks

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.prompt.toLowerCase().includes(q)
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
  }, [tasks, search, sortMode])

  // Handlers
  const handleCreate = useCallback(
    async (data: TaskFormData) => {
      const task = await window.api.createScheduledTask({
        name: data.name.trim(),
        description: data.description.trim(),
        prompt: data.prompt.trim(),
        modelId: data.modelId,
        roleId: data.roleId || null,
        projectId: data.projectId || null,
        scheduleType: data.scheduleType,
        scheduleConfig: buildScheduleConfig(data)
      })
      addTask(task)
      setSubView('grid')
    },
    [addTask]
  )

  const handleEdit = useCallback(
    async (data: TaskFormData) => {
      if (!editingTask) return
      const updated = await window.api.updateScheduledTask(editingTask.id, {
        name: data.name.trim(),
        description: data.description.trim(),
        prompt: data.prompt.trim(),
        modelId: data.modelId,
        roleId: data.roleId || null,
        projectId: data.projectId || null,
        scheduleType: data.scheduleType,
        scheduleConfig: buildScheduleConfig(data)
      })
      if (updated) updateTask(editingTask.id, updated)
      setEditingTask(null)
      setSubView('grid')
    },
    [editingTask, updateTask]
  )

  const handleDelete = useCallback(
    async (id: string) => {
      await window.api.deleteScheduledTask(id)
      removeTask(id)
      setConfirmDeleteId(null)
    },
    [removeTask]
  )

  const handleToggle = useCallback(
    async (id: string) => {
      const updated = await window.api.toggleScheduledTask(id)
      if (updated) updateTask(id, updated)
    },
    [updateTask]
  )

  const handleExecute = useCallback(
    async (id: string) => {
      await window.api.executeScheduledTask(id)
      // The task:executed event will trigger a refresh
    },
    []
  )

  const cycleSortMode = () => {
    setSortMode((m) => (m === 'activity' ? 'name' : m === 'name' ? 'created' : 'activity'))
  }

  const sortLabel = sortMode === 'activity' ? 'Activite' : sortMode === 'name' ? 'Nom' : 'Creation'

  // Sub-view: Form
  if (subView === 'create') {
    return <TaskForm onSave={handleCreate} onCancel={() => setSubView('grid')} />
  }

  if (subView === 'edit' && editingTask) {
    return (
      <TaskForm
        task={editingTask}
        onSave={handleEdit}
        onCancel={() => {
          setEditingTask(null)
          setSubView('grid')
        }}
      />
    )
  }

  // Sub-view: Grid
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Taches planifiees</h1>
            <Button
              onClick={() => {
                setEditingTask(null)
                setSubView('create')
              }}
              className="gap-2"
            >
              <Plus className="size-4" />
              Nouvelle tache
            </Button>
          </div>

          {/* Search + Sort */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des taches..."
                className="pl-10"
              />
            </div>

            <button
              onClick={cycleSortMode}
              className="flex shrink-0 items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
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
          {filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Clock className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search
                  ? 'Aucune tache ne correspond a votre recherche.'
                  : 'Aucune tache planifiee pour le moment.'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={() => {
                    setEditingTask(null)
                    setSubView('create')
                  }}
                >
                  <Plus className="size-4" />
                  Creer votre premiere tache
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isDeleting={confirmDeleteId === task.id}
                  onEdit={() => {
                    setEditingTask(task)
                    setSubView('edit')
                  }}
                  onDelete={() => setConfirmDeleteId(task.id)}
                  onConfirmDelete={() => handleDelete(task.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onToggle={() => handleToggle(task.id)}
                  onExecute={() => handleExecute(task.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper to build the discriminated union config for the IPC
function buildScheduleConfig(data: TaskFormData): { type: string; value?: number; unit?: string; time?: string; days?: number[] } {
  switch (data.scheduleType) {
    case 'manual':
      return { type: 'manual' }
    case 'interval':
      return { type: 'interval', value: data.intervalValue, unit: data.intervalUnit }
    case 'daily':
      return { type: 'daily', time: data.dailyTime }
    case 'weekly':
      return { type: 'weekly', days: data.weeklyDays, time: data.weeklyTime }
  }
}
