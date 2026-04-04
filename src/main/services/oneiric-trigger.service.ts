import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { oneiricService } from './oneiric.service'
import { getLastCompletedOneiricRun } from '../db/queries/oneiric'

const MIN_HOURS_BETWEEN_QUIT_RUNS = 1
const QUIT_TIMEOUT_MS = 30_000

interface OneiricSchedule {
  enabled: boolean
  type: 'daily' | 'interval'
  time?: string
  intervalHours?: number
}

class OneiricTriggerService {
  private scheduleTimer: ReturnType<typeof setTimeout> | null = null
  private enabled = false

  init(): void {
    this.enabled = this.isOneiricEnabled()
    if (!this.enabled) return

    const schedule = this.getSchedule()
    if (!schedule?.enabled) return

    this.scheduleNext(schedule)
    console.log('[OneiricTrigger] Initialized')
  }

  refresh(): void {
    this.stop()
    this.enabled = this.isOneiricEnabled()
    if (!this.enabled) return

    const schedule = this.getSchedule()
    if (!schedule?.enabled) return

    this.scheduleNext(schedule)
  }

  async onAppQuitting(): Promise<void> {
    if (!this.enabled) return
    this.stop()

    // Skip if last run was recent
    const lastRun = getLastCompletedOneiricRun()
    if (lastRun?.completedAt) {
      const hoursSinceLastRun =
        (Date.now() - new Date(lastRun.completedAt).getTime()) / (1000 * 60 * 60)
      if (hoursSinceLastRun < MIN_HOURS_BETWEEN_QUIT_RUNS) {
        console.log(
          `[OneiricTrigger] Last run was ${hoursSinceLastRun.toFixed(1)}h ago, skipping quit consolidation`
        )
        return
      }
    }

    // Run with timeout
    try {
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Quit timeout')), QUIT_TIMEOUT_MS)
      )
      await Promise.race([oneiricService.consolidate('quit'), timeoutPromise])
    } catch (err) {
      console.error('[OneiricTrigger] Quit consolidation failed or timed out:', err)
    }
  }

  stop(): void {
    if (this.scheduleTimer) {
      clearTimeout(this.scheduleTimer)
      this.scheduleTimer = null
    }
  }

  private scheduleNext(schedule: OneiricSchedule): void {
    const delayMs = this.calculateDelay(schedule)
    if (delayMs <= 0) return

    console.log(`[OneiricTrigger] Next run in ${Math.round(delayMs / 1000 / 60)}min`)

    this.scheduleTimer = setTimeout(async () => {
      await oneiricService.consolidate('scheduled')
      // Reschedule after completion
      const updatedSchedule = this.getSchedule()
      if (updatedSchedule?.enabled) {
        this.scheduleNext(updatedSchedule)
      }
    }, delayMs)
  }

  private calculateDelay(schedule: OneiricSchedule): number {
    const now = new Date()

    if (schedule.type === 'interval' && schedule.intervalHours) {
      const lastRun = getLastCompletedOneiricRun()
      if (lastRun?.completedAt) {
        const nextRun =
          new Date(lastRun.completedAt).getTime() + schedule.intervalHours * 60 * 60 * 1000
        const delay = nextRun - now.getTime()
        return delay > 0 ? delay : 0
      }
      // No prior run — wait one full interval before first run
      return schedule.intervalHours * 60 * 60 * 1000
    }

    if (schedule.type === 'daily' && schedule.time) {
      const [hours, minutes] = schedule.time.split(':').map(Number)
      const target = new Date(now)
      target.setHours(hours, minutes, 0, 0)

      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1)
      }

      return target.getTime() - now.getTime()
    }

    return 0
  }

  private isOneiricEnabled(): boolean {
    try {
      const db = getDatabase()
      const row = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'multi-llm:oneiric-model-id'))
        .get()
      return !!row?.value
    } catch {
      return false
    }
  }

  private getSchedule(): OneiricSchedule | null {
    try {
      const db = getDatabase()
      const row = db
        .select()
        .from(settings)
        .where(eq(settings.key, 'multi-llm:oneiric-schedule'))
        .get()
      if (!row?.value) return null
      return JSON.parse(row.value) as OneiricSchedule
    } catch {
      return null
    }
  }
}

export const oneiricTriggerService = new OneiricTriggerService()
