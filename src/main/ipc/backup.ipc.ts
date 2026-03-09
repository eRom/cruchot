import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  createBackup,
  restoreBackup,
  listBackups,
  deleteBackup,
  cleanOldBackups
} from '../services/backup.service'

const restoreSchema = z.object({
  backupPath: z.string().min(1)
})

const deleteSchema = z.object({
  backupPath: z.string().min(1)
})

const cleanSchema = z.object({
  keep: z.number().int().min(1).optional()
})

export function registerBackupIpc(): void {
  ipcMain.handle('backup:create', async () => {
    const entry = createBackup()
    return {
      path: entry.path,
      filename: entry.filename,
      date: entry.date.toISOString(),
      size: entry.size
    }
  })

  ipcMain.handle('backup:restore', async (_event, data: unknown) => {
    const parsed = restoreSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid restore data')
    restoreBackup(parsed.data.backupPath)
    return { restored: true }
  })

  ipcMain.handle('backup:list', async () => {
    const backups = listBackups()
    return backups.map((b) => ({
      path: b.path,
      filename: b.filename,
      date: b.date.toISOString(),
      size: b.size
    }))
  })

  ipcMain.handle('backup:delete', async (_event, data: unknown) => {
    const parsed = deleteSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid delete data')
    deleteBackup(parsed.data.backupPath)
    return { deleted: true }
  })

  ipcMain.handle('backup:clean', async (_event, data: unknown) => {
    const parsed = cleanSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid clean data')
    const removed = cleanOldBackups(parsed.data.keep ?? 7)
    return { removed }
  })

  console.log('[IPC] Backup handlers registered')
}
