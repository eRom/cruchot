import { BrowserWindow } from 'electron'
import {
  getEnabledScheduledTasks,
  getScheduledTask,
  updateTaskNextRunAt,
  computeNextRunAt,
  type ScheduleConfig,
  type ScheduleType
} from '../db/queries/scheduled-tasks'
import { executeScheduledTask } from './task-executor'
import { serviceRegistry } from './registry'

/**
 * Singleton scheduler service.
 * Manages Node.js timers for all enabled scheduled tasks.
 * Must be initialized after database is ready.
 */
class SchedulerService {
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private mainWindow: BrowserWindow | null = null

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    this.scheduleAllEnabled()
    console.log('[Scheduler] Initialized')
    serviceRegistry.register('scheduler', this)
  }

  /**
   * Schedule a single task based on its type/config.
   */
  scheduleTask(taskId: string): void {
    const task = getScheduledTask(taskId)
    if (!task || !task.isEnabled) return

    // Clear any existing timer
    this.unscheduleTask(taskId)

    const scheduleType = task.scheduleType as ScheduleType
    if (scheduleType === 'manual') return // No timer for manual tasks

    const config = task.scheduleConfig as ScheduleConfig | null
    const delayMs = this.getDelayMs(scheduleType, config)

    if (delayMs === null || delayMs < 0) return

    if (scheduleType === 'interval') {
      // For interval: use setInterval
      const unitMs = this.unitToMs(config?.unit ?? 'minutes')
      const intervalMs = (config?.value ?? 1) * unitMs

      // First execution after delay, then repeat
      const timer = setTimeout(() => {
        this.runAndRescheduleInterval(taskId, intervalMs)
      }, delayMs)

      this.timers.set(taskId, timer)
    } else {
      // For daily/weekly: use setTimeout, then reschedule after execution
      const timer = setTimeout(() => {
        this.runAndReschedule(taskId)
      }, delayMs)

      this.timers.set(taskId, timer)
    }

    // Update nextRunAt in DB
    const nextRunAt = computeNextRunAt(scheduleType, config)
    if (nextRunAt) {
      updateTaskNextRunAt(taskId, nextRunAt)
    }

    console.log(`[Scheduler] Task ${taskId} scheduled (${scheduleType}, delay: ${Math.round(delayMs / 1000)}s)`)
  }

  /**
   * Remove timer for a task.
   */
  unscheduleTask(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      clearInterval(timer)
      this.timers.delete(taskId)
    }
  }

  /**
   * Reschedule a task (unschedule then schedule).
   */
  rescheduleTask(taskId: string): void {
    this.unscheduleTask(taskId)
    this.scheduleTask(taskId)
  }

  /**
   * Execute a task immediately (manual trigger or timer fire).
   */
  async executeTask(taskId: string): Promise<void> {
    await executeScheduledTask(taskId, this.mainWindow)
  }

  /**
   * Schedule all enabled tasks. Called at startup.
   */
  scheduleAllEnabled(): void {
    const tasks = getEnabledScheduledTasks()
    for (const task of tasks) {
      this.scheduleTask(task.id)
    }
    console.log(`[Scheduler] ${tasks.length} task(s) scheduled`)
  }

  /**
   * Stop all timers. Called at shutdown.
   */
  stopAll(): void {
    for (const [taskId, timer] of this.timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers.clear()
    console.log('[Scheduler] All tasks stopped')
  }

  async stop(): Promise<void> {
    this.stopAll()
  }

  // ── Private helpers ─────────────────────────────────────

  private async runAndReschedule(taskId: string): Promise<void> {
    await this.executeTask(taskId)

    // After execution, compute next run and reschedule
    const task = getScheduledTask(taskId)
    if (!task || !task.isEnabled) return

    const scheduleType = task.scheduleType as ScheduleType
    const config = task.scheduleConfig as ScheduleConfig | null
    const nextRunAt = computeNextRunAt(scheduleType, config)

    if (nextRunAt) {
      updateTaskNextRunAt(taskId, nextRunAt)
      const delayMs = nextRunAt.getTime() - Date.now()
      if (delayMs > 0) {
        const timer = setTimeout(() => {
          this.runAndReschedule(taskId)
        }, delayMs)
        this.timers.set(taskId, timer)
      }
    }
  }

  private async runAndRescheduleInterval(taskId: string, intervalMs: number): Promise<void> {
    await this.executeTask(taskId)

    // Schedule next interval execution
    const task = getScheduledTask(taskId)
    if (!task || !task.isEnabled) return

    const nextRunAt = new Date(Date.now() + intervalMs)
    updateTaskNextRunAt(taskId, nextRunAt)

    const timer = setTimeout(() => {
      this.runAndRescheduleInterval(taskId, intervalMs)
    }, intervalMs)
    this.timers.set(taskId, timer)
  }

  private getDelayMs(
    scheduleType: ScheduleType,
    config: ScheduleConfig | null
  ): number | null {
    const now = Date.now()

    switch (scheduleType) {
      case 'manual':
        return null

      case 'interval': {
        if (!config?.value || !config?.unit) return null
        const ms = config.value * this.unitToMs(config.unit)
        return ms // First execution after one interval
      }

      case 'daily':
      case 'weekly': {
        const nextRunAt = computeNextRunAt(scheduleType, config)
        if (!nextRunAt) return null
        return nextRunAt.getTime() - now
      }

      default:
        return null
    }
  }

  private unitToMs(unit: 'seconds' | 'minutes' | 'hours'): number {
    switch (unit) {
      case 'seconds': return 1000
      case 'minutes': return 60_000
      case 'hours': return 3_600_000
    }
  }
}

// Singleton export
export const schedulerService = new SchedulerService()
