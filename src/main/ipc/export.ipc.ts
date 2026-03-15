import { ipcMain, dialog, BrowserWindow, clipboard } from 'electron'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import { exportConversation, ExportFormat } from '../services/export.service'
import { buildExportPayload, encryptPayload } from '../services/bulk-export.service'
import { getInstanceToken, getInstanceTokenHex } from '../services/instance-token.service'

const exportSchema = z.object({
  conversationId: z.string().min(1),
  format: z.enum(['md', 'json', 'txt', 'html'])
})

export function registerExportIpc(): void {
  ipcMain.handle('export:conversation', async (event, data: unknown) => {
    const parsed = exportSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid export data')

    const { conversationId, format } = parsed.data
    const result = exportConversation(conversationId, format as ExportFormat)

    const win = BrowserWindow.fromWebContents(event.sender)
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

  // ── Bulk export (encrypted .mlx) ─────────────────────
  ipcMain.handle('export:bulk', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No active window')

    const payload = buildExportPayload()
    const token = getInstanceToken()
    const encrypted = encryptPayload(payload, token)

    const defaultName = `multi-llm-export-${new Date().toISOString().slice(0, 10)}.mlx`

    const { filePath, canceled } = await dialog.showSaveDialog(win, {
      title: 'Exporter toutes les donnees (chiffre)',
      defaultPath: defaultName,
      filters: [{ name: 'Cruchot Export', extensions: ['mlx'] }]
    })

    if (canceled || !filePath) return { exported: false }

    writeFileSync(filePath, encrypted)
    console.log(`[Export] Bulk export saved to ${filePath} (${encrypted.length} bytes)`)
    return { exported: true, filePath }
  })

  // ── Instance token ───────────────────────────────────
  ipcMain.handle('instance-token:get-masked', async () => {
    return '••••••••••••••••'
  })

  ipcMain.handle('instance-token:copy', async () => {
    const hex = getInstanceTokenHex()
    clipboard.writeText(hex)
    return hex
  })

  console.log('[IPC] Export handlers registered')
}
