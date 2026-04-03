import { ipcMain } from 'electron'
import { z } from 'zod'
import { searchMessages } from '../db/queries/search'

const searchPayloadSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    role: z.enum(['user', 'assistant']).optional(),
    projectId: z.string().optional(),
  }).optional(),
})

export function registerSearchIpc(): void {
  ipcMain.handle('search:messages', async (_event, payload: unknown) => {
    const parsed = searchPayloadSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid search payload')
    return searchMessages(parsed.data.query.trim(), parsed.data.filters)
  })

  console.log('[IPC] Search handlers registered')
}
