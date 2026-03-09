import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { nanoid } from 'nanoid'

const ATTACHMENTS_DIR = path.join(app.getPath('userData'), 'attachments')

/**
 * Ensures the attachments directory exists.
 */
function ensureAttachmentsDir(): void {
  if (!fs.existsSync(ATTACHMENTS_DIR)) {
    fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true })
  }
}

/**
 * Saves an attachment buffer to the local filesystem.
 * Returns the saved file path and size.
 */
export function saveAttachment(
  buffer: Buffer,
  filename: string
): { path: string; size: number } {
  ensureAttachmentsDir()

  // Sanitize filename — keep only the base name
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_')
  const uniqueName = `${nanoid()}-${safeName}`
  const filePath = path.join(ATTACHMENTS_DIR, uniqueName)

  fs.writeFileSync(filePath, buffer)
  const stats = fs.statSync(filePath)

  return { path: filePath, size: stats.size }
}

/**
 * Reads an attachment from the local filesystem.
 * Returns the file buffer or null if not found.
 */
export function readAttachment(filePath: string): Buffer | null {
  // Security: only allow reading from the attachments directory
  const resolved = path.resolve(filePath)
  if (!resolved.startsWith(ATTACHMENTS_DIR)) {
    throw new Error('Access denied: file outside attachments directory')
  }

  if (!fs.existsSync(resolved)) {
    return null
  }

  return fs.readFileSync(resolved)
}

/**
 * Returns the attachments directory path.
 */
export function getAttachmentsDir(): string {
  ensureAttachmentsDir()
  return ATTACHMENTS_DIR
}
