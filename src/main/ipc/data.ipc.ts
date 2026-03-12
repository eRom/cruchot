import { ipcMain, app, dialog, BrowserWindow } from 'electron'
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
  ipcMain.handle('data:cleanup', async (event) => {
    // Native confirmation dialog — do not rely on renderer alone
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Annuler', 'Nettoyer'],
        defaultId: 0,
        cancelId: 0,
        title: 'Nettoyage des donnees',
        message: 'Conversations, projets et images seront supprimes.',
        detail: 'Les roles, prompts, memoire, parametres et cles API seront conserves.'
      })
      if (response !== 1) return { success: false, cancelled: true }
    }

    const { imagePaths } = deleteConversationsProjectsImages()

    // Trash les fichiers images
    await trashPaths(imagePaths)

    return { success: true }
  })

  // ── Zone rouge : factory reset ──────────────────────────────
  ipcMain.handle('data:factory-reset', async (event) => {
    // Double confirmation native — ne pas se fier au renderer seul
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Annuler', 'Reinitialiser'],
        defaultId: 0,
        cancelId: 0,
        title: 'Factory Reset',
        message: 'Toutes les donnees seront supprimees de facon irreversible.',
        detail: 'Conversations, projets, roles, prompts, memoire, parametres, cles API — tout sera efface.'
      })
      if (response !== 1) return { success: false, cancelled: true }
    }
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
