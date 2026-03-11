import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { z } from 'zod'
import { importConversation, ImportFormat } from '../services/import.service'

const importSchema = z.object({
  format: z.enum(['json', 'chatgpt', 'claude'])
})

export function registerImportIpc(): void {
  ipcMain.handle('import:conversation', async (event, data: unknown) => {
    const parsed = importSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid import data')

    const { format } = parsed.data

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No active window')

    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Importer une conversation',
      filters: [
        { name: 'Fichiers supportés', extensions: ['json', 'txt'] }
      ],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) {
      return { imported: false }
    }

    const filePath = filePaths[0]
    const stats = (await import('fs')).statSync(filePath)
    if (stats.size > 50 * 1024 * 1024) {
      throw new Error('Fichier trop volumineux (max 50 MB)')
    }
    const fileContent = readFileSync(filePath, 'utf-8')

    const result = importConversation(fileContent, format as ImportFormat)

    return {
      imported: true,
      conversationId: result.conversationId,
      messagesCount: result.messagesCount
    }
  })

  console.log('[IPC] Import handlers registered')
}
