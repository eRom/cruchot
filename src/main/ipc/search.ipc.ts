import { ipcMain } from 'electron'
import { z } from 'zod'
import { searchMessages } from '../db/queries/search'

const searchSchema = z.string().min(1).max(500)

export function registerSearchIpc(): void {
  ipcMain.handle('search:messages', async (_event, query: unknown) => {
    const parsed = searchSchema.safeParse(query)
    if (!parsed.success) throw new Error('Invalid search query')
    return searchMessages(parsed.data.trim())
  })

  console.log('[IPC] Search handlers registered')
}
