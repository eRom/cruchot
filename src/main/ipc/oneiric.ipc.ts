import { ipcMain } from 'electron'
import { z } from 'zod'
import { oneiricService } from '../services/oneiric.service'
import { oneiricTriggerService } from '../services/oneiric-trigger.service'
import { getAllOneiricRuns, getOneiricRun, getLastCompletedOneiricRun } from '../db/queries/oneiric'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

const setModelSchema = z.object({
  modelId: z.string().max(200)
})

const setScheduleSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['daily', 'interval']),
  time: z.string().optional(),
  intervalHours: z.number().optional()
})

export function registerOneiricIpc(): void {
  ipcMain.handle('oneiric:consolidate-now', async () => {
    const runId = await oneiricService.consolidate('manual')
    return { runId }
  })

  ipcMain.handle('oneiric:cancel', async () => {
    oneiricService.cancel()
  })

  ipcMain.handle('oneiric:status', async () => {
    const lastRun = getLastCompletedOneiricRun()
    return {
      isRunning: oneiricService.isConsolidating(),
      lastRun: lastRun ?? null
    }
  })

  ipcMain.handle('oneiric:list-runs', async () => {
    return getAllOneiricRuns()
  })

  ipcMain.handle('oneiric:get-run', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Run ID required')
    return getOneiricRun(id) ?? null
  })

  ipcMain.handle('oneiric:set-model', async (_event, data: unknown) => {
    const parsed = setModelSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid model data')

    const db = getDatabase()
    const value = parsed.data.modelId || ''

    if (value) {
      db.insert(settings)
        .values({ key: 'multi-llm:oneiric-model-id', value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() }
        })
        .run()
    } else {
      db.delete(settings).where(eq(settings.key, 'multi-llm:oneiric-model-id')).run()
    }

    oneiricTriggerService.refresh()
  })

  ipcMain.handle('oneiric:set-schedule', async (_event, data: unknown) => {
    const parsed = setScheduleSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid schedule data')

    const db = getDatabase()
    const value = JSON.stringify(parsed.data)

    db.insert(settings)
      .values({ key: 'multi-llm:oneiric-schedule', value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() }
      })
      .run()

    oneiricTriggerService.refresh()
  })

  console.log('[IPC] Oneiric handlers registered')
}
