import { ipcMain, dialog, shell, BrowserWindow, app, nativeImage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { saveAttachment, readAttachment } from '../services/file.service'
import { getActiveWorkspaceRoot } from './workspace.ipc'

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

// ── Security: path validation ─────────────────────────────
const DANGEROUS_EXTENSIONS = new Set([
  '.app', '.command', '.sh', '.bat', '.cmd', '.exe', '.msi',
  '.scpt', '.applescript', '.workflow', '.action'
])

function getAllowedDirs(): string[] {
  const dirs = [
    path.join(app.getPath('userData'), 'images') + path.sep,
    path.join(app.getPath('userData'), 'attachments') + path.sep
  ]
  const workspaceRoot = getActiveWorkspaceRoot()
  if (workspaceRoot) {
    dirs.push(path.resolve(workspaceRoot) + path.sep)
  }
  return dirs
}

function isPathAllowed(filePath: string): boolean {
  const resolved = path.resolve(filePath)
  return getAllowedDirs().some((dir) => resolved.startsWith(dir) || resolved === dir.slice(0, -1))
}

function hasDangerousExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return DANGEROUS_EXTENSIONS.has(ext)
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
  const MAX_SAVE_BUFFER_SIZE = 10 * 1024 * 1024 // 10 MB

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
      if (buf.byteLength > MAX_SAVE_BUFFER_SIZE) {
        throw new Error(`Fichier trop volumineux (${(buf.byteLength / 1024 / 1024).toFixed(1)} MB > 10 MB)`)
      }

      // Validate extension
      const ext = path.extname(data.filename).toLowerCase()
      if (DANGEROUS_EXTENSIONS.has(ext)) {
        throw new Error('Extension de fichier non autorisee')
      }

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

  // ── Open file with default OS app ───────────────────
  ipcMain.handle('files:openInOS', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path outside allowed directories')
    }
    if (hasDangerousExtension(filePath)) {
      throw new Error('Access denied: file type not allowed')
    }
    return shell.openPath(filePath)
  })

  // ── Reveal file in Finder / Explorer ───────────────
  ipcMain.handle('files:showInFolder', async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('File path is required')
    }
    if (!isPathAllowed(filePath)) {
      throw new Error('Access denied: path outside allowed directories')
    }
    shell.showItemInFolder(filePath)
  })

  // ── Profile avatar ────────────────────────────────────
  ipcMain.handle('profile:select-avatar', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')

    const result = await dialog.showOpenDialog(win, {
      title: 'Choisir un avatar',
      buttonLabel: 'Choisir',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const sourcePath = result.filePaths[0]
    const imagesDir = path.join(app.getPath('userData'), 'images')
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    const destPath = path.join(imagesDir, 'avatar.png')

    // Resize if needed (max 800px) and convert to PNG
    let img = nativeImage.createFromPath(sourcePath)
    const size = img.getSize()
    if (size.width > 800 || size.height > 800) {
      const scale = 800 / Math.max(size.width, size.height)
      img = img.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale)
      })
    }

    fs.writeFileSync(destPath, img.toPNG())
    return destPath
  })

  ipcMain.handle('profile:remove-avatar', async () => {
    const avatarPath = path.join(app.getPath('userData'), 'images', 'avatar.png')
    if (fs.existsSync(avatarPath)) {
      const { default: trash } = await import('trash')
      await trash(avatarPath)
    }
    return true
  })

  console.log('[IPC] Files handlers registered')
}
