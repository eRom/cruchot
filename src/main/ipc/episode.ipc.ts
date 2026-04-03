import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllEpisodes,
  toggleEpisode,
  deleteEpisode,
  deleteAllEpisodes,
  getEpisodeStats
} from '../db/queries/episodes'
import { episodeExtractorService } from '../services/episode-extractor.service'
import { episodeTriggerService } from '../services/episode-trigger.service'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

const setModelSchema = z.object({
  modelId: z.string().min(1).max(200)
})

export function registerEpisodeIpc(): void {
  ipcMain.handle('episode:list', async () => {
    return getAllEpisodes()
  })

  ipcMain.handle('episode:toggle', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Episode ID required')
    return toggleEpisode(id)
  })

  ipcMain.handle('episode:delete', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Episode ID required')
    deleteEpisode(id)
  })

  ipcMain.handle('episode:delete-all', async () => {
    deleteAllEpisodes()
  })

  ipcMain.handle('episode:stats', async () => {
    const stats = getEpisodeStats()
    const db = getDatabase()
    const modelRow = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
    return {
      ...stats,
      modelId: modelRow?.value ?? null
    }
  })

  ipcMain.handle('episode:set-model', async (_event, data: unknown) => {
    const parsed = setModelSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid model data')

    const db = getDatabase()
    db.insert(settings)
      .values({ key: 'multi-llm:episode-model-id', value: parsed.data.modelId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: parsed.data.modelId, updatedAt: new Date() }
      })
      .run()

    episodeTriggerService.refresh()
  })

  ipcMain.handle('episode:extract-now', async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') throw new Error('Conversation ID required')
    const count = await episodeExtractorService.extract(conversationId)
    return { extracted: count }
  })

  console.log('[IPC] Episode handlers registered')
}
