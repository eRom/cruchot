import { ipcMain } from 'electron'
import { checkForUpdates, downloadUpdate, installUpdate } from '../services/updater.service'

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:check', async () => {
    checkForUpdates()
  })

  ipcMain.handle('updater:download', async () => {
    downloadUpdate()
  })

  ipcMain.handle('updater:install', async () => {
    installUpdate()
  })

  console.log('[IPC] Updater handlers registered')
}
