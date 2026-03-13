import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, statSync } from 'fs'
import { z } from 'zod'
import { importConversation, ImportFormat } from '../services/import.service'
import { tryDecryptWithLocalToken, decryptPayload, importPayload } from '../services/bulk-import.service'

const importSchema = z.object({
  format: z.enum(['json', 'chatgpt', 'claude'])
})

const bulkWithTokenSchema = z.object({
  filePath: z.string().min(1),
  tokenHex: z.string().length(64).regex(/^[0-9a-f]+$/i)
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
    const stats = statSync(filePath)
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

  // ── Bulk import (encrypted .mlx) ─────────────────────
  ipcMain.handle('import:bulk', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No active window')

    const { filePaths, canceled } = await dialog.showOpenDialog(win, {
      title: 'Importer un fichier .mlx',
      filters: [{ name: 'Multi-LLM Export', extensions: ['mlx'] }],
      properties: ['openFile']
    })

    if (canceled || filePaths.length === 0) {
      return { imported: false }
    }

    const filePath = filePaths[0]
    const stats = statSync(filePath)
    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('Fichier trop volumineux (max 200 MB)')
    }

    // Try with local token first
    const attempt = tryDecryptWithLocalToken(filePath)
    if (attempt.success && attempt.payload) {
      const result = importPayload(attempt.payload)
      return {
        imported: true,
        ...result
      }
    }

    // Local token failed → ask user for external token
    return { imported: false, needsToken: true, filePath }
  })

  // ── Bulk import with external token ──────────────────
  ipcMain.handle('import:bulk-with-token', async (_event, data: unknown) => {
    const parsed = bulkWithTokenSchema.safeParse(data)
    if (!parsed.success) throw new Error('Donnees invalides : token hex 64 caracteres requis')

    const { filePath, tokenHex } = parsed.data
    const stats = statSync(filePath)
    if (stats.size > 200 * 1024 * 1024) {
      throw new Error('Fichier trop volumineux (max 200 MB)')
    }

    const encrypted = readFileSync(filePath)
    const token = Buffer.from(tokenHex, 'hex')
    const payload = decryptPayload(encrypted, token)
    const result = importPayload(payload)

    return {
      imported: true,
      ...result
    }
  })

  console.log('[IPC] Import handlers registered')
}
