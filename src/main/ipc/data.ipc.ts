import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { deleteConversationsProjectsImages, factoryResetDatabase } from '../db/queries/cleanup'

async function trashPaths(paths: string[]): Promise<void> {
  const trash = (await import('trash')).default
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        await trash(p)
      }
    } catch {
      // Fichier deja supprime ou inaccessible — silencieux
    }
  }
}

export function registerDataIpc(): void {
  // ── Zone orange : nettoyage partiel ─────────────────────────
  ipcMain.handle('data:cleanup', async () => {
    const { imagePaths } = deleteConversationsProjectsImages()

    // Trash les fichiers images
    await trashPaths(imagePaths)

    return { success: true }
  })

  // ── Zone rouge : factory reset ──────────────────────────────
  ipcMain.handle('data:factory-reset', async () => {
    // 1. Stop services actifs
    try {
      const { schedulerService } = await import('../services/scheduler.service')
      schedulerService.stopAll()
    } catch { /* service pas demarre */ }

    try {
      const { mcpManagerService } = await import('../services/mcp-manager.service')
      mcpManagerService.stopAll()
    } catch { /* service pas demarre */ }

    try {
      const { telegramBotService } = await import('../services/telegram-bot.service')
      await telegramBotService.destroy()
    } catch { /* service pas demarre */ }

    try {
      const { remoteServerService } = await import('../services/remote-server.service')
      remoteServerService.stop()
    } catch { /* service pas demarre */ }

    // 2. Reset DB
    const { imagePaths } = factoryResetDatabase()

    // 3. Trash fichiers images
    await trashPaths(imagePaths)

    // 4. Trash contenu du dossier attachments
    const attachmentsDir = path.join(app.getPath('userData'), 'attachments')
    if (fs.existsSync(attachmentsDir)) {
      const files = fs.readdirSync(attachmentsDir)
      await trashPaths(files.map((f) => path.join(attachmentsDir, f)))
    }

    // 5. Trash avatar
    const avatarDir = path.join(app.getPath('userData'), 'avatars')
    if (fs.existsSync(avatarDir)) {
      const files = fs.readdirSync(avatarDir)
      await trashPaths(files.map((f) => path.join(avatarDir, f)))
    }

    return { success: true }
  })
}
