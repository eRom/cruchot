import { copyFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { join, resolve, sep } from 'path'
import { getDbPath, getAppDataPath } from '../utils/paths'
import { closeDatabase, initDatabase } from '../db'

/**
 * Validates that a path is within the backups directory.
 * Prevents path traversal attacks.
 */
function assertPathInBackupsDir(filePath: string): void {
  const backupsDir = getBackupsDir()
  const resolved = resolve(filePath)
  if (!resolved.startsWith(backupsDir + sep) && resolved !== backupsDir) {
    throw new Error('Access denied: path outside backups directory')
  }
}

export interface BackupEntry {
  path: string
  filename: string
  date: Date
  size: number
}

/**
 * Returns the backups directory path, creating it if needed.
 */
function getBackupsDir(): string {
  const dir = join(getAppDataPath(), 'backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Generates a timestamped backup filename.
 */
function generateBackupFilename(): string {
  const now = new Date()
  const ts = now.toISOString().replace(/[-:T]/g, '').replace(/\.\d+Z$/, '')
  // Format: YYYY-MM-DD-HHmmss
  const formatted = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}-${ts.slice(8, 14)}`
  return `${formatted}.db`
}

/**
 * Creates a backup of the main database.
 * Copies the SQLite file to the backups directory with a timestamped name.
 */
export function createBackup(): BackupEntry {
  const dbPath = getDbPath()
  const backupsDir = getBackupsDir()
  const filename = generateBackupFilename()
  const backupPath = join(backupsDir, filename)

  copyFileSync(dbPath, backupPath)

  const stat = statSync(backupPath)
  return {
    path: backupPath,
    filename,
    date: stat.mtime,
    size: stat.size
  }
}

/**
 * Restores the database from a backup file.
 * Closes the current DB connection, replaces main.db, then re-opens.
 */
export function restoreBackup(backupPath: string): void {
  assertPathInBackupsDir(backupPath)

  const dbPath = getDbPath()

  // Validate the backup file exists
  statSync(backupPath) // throws if not found

  // Close current connection
  closeDatabase()

  // Replace the main DB
  copyFileSync(backupPath, dbPath)

  // Re-open the DB
  initDatabase(dbPath)
}

/**
 * Lists all available backups, sorted by date descending (newest first).
 */
export function listBackups(): BackupEntry[] {
  const backupsDir = getBackupsDir()

  const files = readdirSync(backupsDir).filter((f) => f.endsWith('.db'))

  return files
    .map((filename) => {
      const fullPath = join(backupsDir, filename)
      const stat = statSync(fullPath)
      return {
        path: fullPath,
        filename,
        date: stat.mtime,
        size: stat.size
      }
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

/**
 * Deletes a specific backup file.
 */
export async function deleteBackup(backupPath: string): Promise<void> {
  assertPathInBackupsDir(backupPath)
  statSync(backupPath) // throws if not found
  const { default: trash } = await import('trash')
  await trash(backupPath)
}

/**
 * Cleans old backups, keeping only the N most recent.
 */
export async function cleanOldBackups(keep: number = 7): Promise<number> {
  const backups = listBackups()
  if (backups.length <= keep) return 0

  const { default: trash } = await import('trash')
  const toDelete = backups.slice(keep)
  for (const backup of toDelete) {
    assertPathInBackupsDir(backup.path)
    await trash(backup.path)
  }
  return toDelete.length
}
