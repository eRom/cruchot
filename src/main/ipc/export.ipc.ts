import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import { exportConversation, ExportFormat } from '../services/export.service'

const exportSchema = z.object({
  conversationId: z.string().min(1),
  format: z.enum(['md', 'json', 'txt', 'html'])
})

export function registerExportIpc(): void {
  ipcMain.handle('export:conversation', async (_event, data: unknown) => {
    const parsed = exportSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid export data')

    const { conversationId, format } = parsed.data
    const result = exportConversation(conversationId, format as ExportFormat)

    const win = BrowserWindow.getFocusedWindow()
    if (!win) throw new Error('No active window')

    const filters: { name: string; extensions: string[] }[] = []
    switch (format) {
      case 'md':
        filters.push({ name: 'Markdown', extensions: ['md'] })
        break
      case 'json':
        filters.push({ name: 'JSON', extensions: ['json'] })
        break
      case 'txt':
        filters.push({ name: 'Texte', extensions: ['txt'] })
        break
      case 'html':
        filters.push({ name: 'HTML', extensions: ['html'] })
        break
    }

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Exporter la conversation',
      defaultPath: result.filename,
      filters
    })

    if (canceled || !filePath) return { exported: false }

    writeFileSync(filePath, result.content, 'utf-8')
    return { exported: true, filePath }
  })

  console.log('[IPC] Export handlers registered')
}
