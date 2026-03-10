import { create } from 'zustand'
import type { ScheduledTaskInfo } from '../../../preload/types'

interface TasksState {
  tasks: ScheduledTaskInfo[]
  setTasks: (tasks: ScheduledTaskInfo[]) => void
  addTask: (task: ScheduledTaskInfo) => void
  updateTask: (id: string, updates: Partial<ScheduledTaskInfo>) => void
  removeTask: (id: string) => void
  loadTasks: () => Promise<void>
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks]
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      )
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id)
    })),

  loadTasks: async () => {
    try {
      const tasks = await window.api.getScheduledTasks()
      set({ tasks })
    } catch (err) {
      console.error('Failed to load scheduled tasks:', err)
    }
  }
}))
