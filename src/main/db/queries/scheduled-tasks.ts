import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { scheduledTasks } from '../schema'

export type ScheduleType = 'manual' | 'interval' | 'daily' | 'weekly'

export interface ScheduleConfig {
  value?: number
  unit?: 'seconds' | 'minutes' | 'hours'
  time?: string
  days?: number[]
}

export function getAllScheduledTasks() {
  const db = getDatabase()
  return db
    .select()
    .from(scheduledTasks)
    .orderBy(desc(scheduledTasks.updatedAt))
    .all()
}

export function getScheduledTask(id: string) {
  const db = getDatabase()
  return db.select().from(scheduledTasks).where(eq(scheduledTasks.id, id)).get()
}

export function getEnabledScheduledTasks() {
  const db = getDatabase()
  return db
    .select()
    .from(scheduledTasks)
    .where(eq(scheduledTasks.isEnabled, true))
    .all()
}

export function createScheduledTask(data: {
  name: string
  description: string
  prompt: string
  modelId: string
  roleId?: string | null
  projectId?: string | null
  scheduleType: ScheduleType
  scheduleConfig: ScheduleConfig | null
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()
  const nextRunAt = computeNextRunAt(data.scheduleType, data.scheduleConfig)

  db.insert(scheduledTasks)
    .values({
      id,
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      modelId: data.modelId,
      roleId: data.roleId ?? null,
      projectId: data.projectId ?? null,
      scheduleType: data.scheduleType,
      scheduleConfig: data.scheduleConfig ?? null,
      isEnabled: true,
      nextRunAt,
      runCount: 0,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getScheduledTask(id)!
}

export function updateScheduledTask(
  id: string,
  data: {
    name?: string
    description?: string
    prompt?: string
    modelId?: string
    roleId?: string | null
    projectId?: string | null
    scheduleType?: ScheduleType
    scheduleConfig?: ScheduleConfig | null
    isEnabled?: boolean
  }
) {
  const db = getDatabase()

  // If schedule changed, recompute nextRunAt
  const existing = getScheduledTask(id)
  if (!existing) return undefined

  const scheduleType = data.scheduleType ?? existing.scheduleType
  const scheduleConfig = data.scheduleConfig !== undefined
    ? data.scheduleConfig
    : existing.scheduleConfig as ScheduleConfig | null

  const nextRunAt = (data.scheduleType !== undefined || data.scheduleConfig !== undefined)
    ? computeNextRunAt(scheduleType as ScheduleType, scheduleConfig)
    : existing.nextRunAt

  db.update(scheduledTasks)
    .set({
      ...data,
      nextRunAt,
      updatedAt: new Date()
    })
    .where(eq(scheduledTasks.id, id))
    .run()

  return getScheduledTask(id)
}

export function deleteScheduledTask(id: string) {
  const db = getDatabase()
  db.delete(scheduledTasks).where(eq(scheduledTasks.id, id)).run()
}

export function updateTaskRunStatus(
  id: string,
  status: 'success' | 'error',
  error?: string,
  conversationId?: string
) {
  const db = getDatabase()
  const now = new Date()

  db.update(scheduledTasks)
    .set({
      lastRunAt: now,
      lastRunStatus: status,
      lastRunError: error ?? null,
      lastConversationId: conversationId ?? null,
      updatedAt: now
    })
    .where(eq(scheduledTasks.id, id))
    .run()
}

export function incrementRunCount(id: string) {
  const db = getDatabase()
  const task = getScheduledTask(id)
  if (!task) return

  db.update(scheduledTasks)
    .set({ runCount: task.runCount + 1 })
    .where(eq(scheduledTasks.id, id))
    .run()
}

export function updateTaskNextRunAt(id: string, nextRunAt: Date | null) {
  const db = getDatabase()
  db.update(scheduledTasks)
    .set({ nextRunAt, updatedAt: new Date() })
    .where(eq(scheduledTasks.id, id))
    .run()
}

// ── Helpers ─────────────────────────────────────────────────

export function computeNextRunAt(
  scheduleType: ScheduleType,
  config: ScheduleConfig | null
): Date | null {
  const now = new Date()

  switch (scheduleType) {
    case 'manual':
      return null

    case 'interval': {
      if (!config?.value || !config?.unit) return null
      const ms = config.value * unitToMs(config.unit)
      return new Date(now.getTime() + ms)
    }

    case 'daily': {
      if (!config?.time) return null
      const [hours, minutes] = config.time.split(':').map(Number)
      const next = new Date(now)
      next.setHours(hours, minutes, 0, 0)
      if (next <= now) next.setDate(next.getDate() + 1)
      return next
    }

    case 'weekly': {
      if (!config?.time || !config?.days || config.days.length === 0) return null
      const [hours, minutes] = config.time.split(':').map(Number)
      const sortedDays = [...config.days].sort((a, b) => a - b)

      // Find the next valid day+time
      for (let offset = 0; offset <= 7; offset++) {
        const candidate = new Date(now)
        candidate.setDate(candidate.getDate() + offset)
        candidate.setHours(hours, minutes, 0, 0)
        const dayOfWeek = candidate.getDay()

        if (sortedDays.includes(dayOfWeek) && candidate > now) {
          return candidate
        }
      }
      // Fallback: next week first day
      const candidate = new Date(now)
      candidate.setDate(candidate.getDate() + 7)
      candidate.setHours(hours, minutes, 0, 0)
      return candidate
    }

    default:
      return null
  }
}

function unitToMs(unit: 'seconds' | 'minutes' | 'hours'): number {
  switch (unit) {
    case 'seconds': return 1000
    case 'minutes': return 60_000
    case 'hours': return 3_600_000
  }
}
