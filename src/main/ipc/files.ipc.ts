import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { saveAttachment, readAttachment } from '../services/file.service'

// Allowed extensions for the file picker
const ALLOWED_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'pdf', 'docx', 'txt', 'md', 'csv',
  'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h',
  'html', 'css', 'json', 'yaml', 'yml', 'toml', 'xml', 'sql', 'sh', 'rb',
  'php', 'swift', 'kt'
]

export interface PickedFile {
  path: string
  name: string
  size: number
  type: 'image' | 'document' | 'code'
  mimeType: string
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
const DOC_EXTS = new Set(['.pdf', '.docx', '.txt', '.md', '.csv'])

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv'
}

function classifyFile(filePath: string): PickedFile | null {
  const name = path.basename(filePath)
  if (name.startsWith('.')) return null

  const ext = path.extname(name).toLowerCase()
  if (!fs.existsSync(filePath)) return null

  const stats = fs.statSync(filePath)
  if (stats.size > 10 * 1024 * 1024) return null // 10 MB limit

  const type: 'image' | 'document' | 'code' = IMAGE_EXTS.has(ext)
    ? 'image'
    : DOC_EXTS.has(ext)
      ? 'document'
      : 'code'

  return {
    path: filePath,
    name,
    size: stats.size,
    type,
    mimeType: EXT_TO_MIME[ext] ?? 'application/octet-stream'
  }
}

export function registerFilesIpc(): void {
  // ── Pick files via native dialog ──────────────────────
  ipcMain.handle('files:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')

    const result = await dialog.showOpenDialog(win, {
      title: 'Joindre des fichiers',
      buttonLabel: 'Joindre',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Fichiers supportes', extensions: ALLOWED_EXTENSIONS }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return []
    }

    const files: PickedFile[] = []
    for (const fp of result.filePaths) {
      const classified = classifyFile(fp)
      if (classified) files.push(classified)
    }

    return files
  })

  // ── Save dropped/pasted file (buffer → disk) ─────────
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

  // ── Read file from disk ────────────────────────────────
  ipcMain.handle('files:read', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required')
    }

    const buffer = readAttachment(filePath)
    if (!buffer) {
      throw new Error('File not found')
    }

    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  })

  console.log('[IPC] Files handlers registered')
}
