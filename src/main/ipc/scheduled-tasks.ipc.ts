import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllScheduledTasks,
  getScheduledTask,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask
} from '../db/queries/scheduled-tasks'
import { schedulerService } from '../services/scheduler.service'

const scheduleConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('interval'), value: z.number().min(1), unit: z.enum(['seconds', 'minutes', 'hours']) }),
  z.object({ type: z.literal('daily'), time: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({ type: z.literal('weekly'), days: z.array(z.number().min(0).max(6)).min(1), time: z.string().regex(/^\d{2}:\d{2}$/) })
])

const createTaskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  prompt: z.string().min(1).max(50000),
  modelId: z.string().min(1),
  roleId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  scheduleType: z.enum(['manual', 'interval', 'daily', 'weekly']),
  scheduleConfig: scheduleConfigSchema,
  useMemory: z.boolean().optional().default(true)
})

const updateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  prompt: z.string().min(1).max(50000).optional(),
  modelId: z.string().min(1).optional(),
  roleId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  scheduleType: z.enum(['manual', 'interval', 'daily', 'weekly']).optional(),
  scheduleConfig: scheduleConfigSchema.optional(),
  isEnabled: z.boolean().optional(),
  useMemory: z.boolean().optional()
})

export function registerScheduledTasksIpc(): void {
  // List all tasks
  ipcMain.handle('tasks:list', async () => {
    return getAllScheduledTasks()
  })

  // Get single task
  ipcMain.handle('tasks:get', async (_event, id: string) => {
    if (!id) throw new Error('Task ID required')
    return getScheduledTask(id)
  })

  // Create task
  ipcMain.handle('tasks:create', async (_event, payload) => {
    const parsed = createTaskSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { scheduleConfig, useMemory, ...rest } = parsed.data

    // Convert discriminated union to flat config
    const flatConfig = scheduleConfig.type === 'manual'
      ? null
      : scheduleConfig.type === 'interval'
        ? { value: scheduleConfig.value, unit: scheduleConfig.unit }
        : scheduleConfig.type === 'daily'
          ? { time: scheduleConfig.time }
          : { days: scheduleConfig.days, time: scheduleConfig.time }

    const task = createScheduledTask({
      ...rest,
      scheduleConfig: flatConfig,
      useMemory
    })

    // Schedule if enabled
    if (task.isEnabled && task.scheduleType !== 'manual') {
      schedulerService.scheduleTask(task.id)
    }

    return task
  })

  // Update task
  ipcMain.handle('tasks:update', async (_event, id: string, payload) => {
    if (!id) throw new Error('Task ID required')

    const parsed = updateTaskSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { scheduleConfig, ...rest } = parsed.data

    // Convert discriminated union to flat config if provided
    let flatConfig: { value?: number; unit?: 'seconds' | 'minutes' | 'hours'; time?: string; days?: number[] } | null | undefined
    if (scheduleConfig !== undefined) {
      flatConfig = scheduleConfig.type === 'manual'
        ? null
        : scheduleConfig.type === 'interval'
          ? { value: scheduleConfig.value, unit: scheduleConfig.unit }
          : scheduleConfig.type === 'daily'
            ? { time: scheduleConfig.time }
            : { days: scheduleConfig.days, time: scheduleConfig.time }
    }

    const task = updateScheduledTask(id, {
      ...rest,
      ...(flatConfig !== undefined ? { scheduleConfig: flatConfig } : {})
    })

    // Reschedule
    if (task) {
      schedulerService.rescheduleTask(id)
    }

    return task
  })

  // Delete task
  ipcMain.handle('tasks:delete', async (_event, id: string) => {
    if (!id) throw new Error('Task ID required')
    schedulerService.unscheduleTask(id)
    deleteScheduledTask(id)
  })

  // Execute task manually
  ipcMain.handle('tasks:execute', async (_event, id: string) => {
    if (!id) throw new Error('Task ID required')
    return schedulerService.executeTask(id)
  })

  // Toggle enabled/disabled
  ipcMain.handle('tasks:toggle', async (_event, id: string) => {
    if (!id) throw new Error('Task ID required')
    const task = getScheduledTask(id)
    if (!task) throw new Error('Task not found')

    const newEnabled = !task.isEnabled
    const updated = updateScheduledTask(id, { isEnabled: newEnabled })

    if (newEnabled) {
      schedulerService.scheduleTask(id)
    } else {
      schedulerService.unscheduleTask(id)
    }

    return updated
  })

  console.log('[IPC] Scheduled tasks handlers registered')
}
