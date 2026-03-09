import { ipcMain } from 'electron'
import { searchMessages } from '../db/queries/search'

export function registerSearchIpc(): void {
  ipcMain.handle('search:messages', async (_event, query: string) => {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query required')
    }
    return searchMessages(query.trim())
  })

  console.log('[IPC] Search handlers registered')
}
