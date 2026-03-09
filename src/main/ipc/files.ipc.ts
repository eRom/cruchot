import { ipcMain } from 'electron'
import { saveAttachment, readAttachment } from '../services/file.service'

/**
 * Registers IPC handlers for file operations (attachments).
 * NOTE: This file is NOT registered in index.ts — Agent B will do that.
 */
export function registerFilesIpc(): void {
  ipcMain.handle(
    'files:save',
    async (_event, data: { buffer: ArrayBuffer; filename: string }) => {
      if (!data?.buffer || !data?.filename) {
        throw new Error('Buffer and filename are required')
      }
      if (typeof data.filename !== 'string' || data.filename.length === 0) {
        throw new Error('Invalid filename')
      }
      if (data.filename.length > 255) {
        throw new Error('Filename too long')
      }

      const buf = Buffer.from(data.buffer)
      return saveAttachment(buf, data.filename)
    }
  )

  ipcMain.handle('files:read', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required')
    }

    const buffer = readAttachment(filePath)
    if (!buffer) {
      throw new Error('File not found')
    }

    // Return as ArrayBuffer for IPC transfer
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  })

  console.log('[IPC] Files handlers registered')
}
