import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerAllIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { runMigrations } from './db/migrate'
import { getDbPath } from './utils/paths'
import { initAutoUpdater, stopAutoUpdater } from './services/updater.service'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  // Initialize database before anything else
  initDatabase(getDbPath())
  runMigrations()

  registerAllIpcHandlers()
  mainWindow = createMainWindow()

  // Auto-updater — only in packaged builds
  if (app.isPackaged) {
    initAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  stopAutoUpdater()
  closeDatabase()
})

export { mainWindow }
