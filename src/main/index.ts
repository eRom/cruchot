import { app, BrowserWindow, net, protocol } from 'electron'
import { createMainWindow } from './window'
import { registerAllIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { runMigrations } from './db/migrate'
import { getDbPath } from './utils/paths'
import { initAutoUpdater, stopAutoUpdater } from './services/updater.service'
import { pathToFileURL } from 'node:url'

let mainWindow: BrowserWindow | null = null

// Register custom protocol for serving local images
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(() => {
  // Handle local-image:// protocol — serves files from filesystem
  protocol.handle('local-image', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-image://', ''))
    return net.fetch(pathToFileURL(filePath).href)
  })
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
