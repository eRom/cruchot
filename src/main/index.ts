import { app, BrowserWindow, net, protocol, session } from 'electron'
import * as fs from 'fs'
import { createMainWindow } from './window'
import { registerAllIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { runMigrations } from './db/migrate'
import { getDbPath } from './utils/paths'
import { initAutoUpdater, stopAutoUpdater } from './services/updater.service'
import { schedulerService } from './services/scheduler.service'
import { mcpManagerService } from './services/mcp-manager.service'
import { telegramBotService } from './services/telegram-bot.service'
import { remoteServerService } from './services/remote-server.service'
import { seedBuiltinCommands } from './db/queries/slash-commands'
import { BUILTIN_COMMANDS } from './commands/builtin'
import { qdrantMemoryService } from './services/qdrant-memory.service'
import { ensureInstanceToken } from './services/instance-token.service'

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

let mainWindow: BrowserWindow | null = null

// Register custom protocol for serving local images (no bypassCSP — use img-src in CSP instead)
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { supportFetchAPI: true, stream: true, secure: true } }
])

app.whenReady().then(() => {
  // Allowed directories for local-image:// protocol
  const allowedDirs = [
    path.join(app.getPath('userData'), 'images') + path.sep,
    path.join(app.getPath('userData'), 'attachments') + path.sep
  ]

  // Handle local-image:// protocol — serves files only from allowed directories
  protocol.handle('local-image', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-image://', ''))

    // Resolve symlinks to prevent escaping allowed dirs via symlink chains
    let resolved: string
    try {
      resolved = fs.realpathSync(filePath)
    } catch {
      return new Response('Not Found', { status: 404 })
    }

    if (!allowedDirs.some((dir) => resolved.startsWith(dir))) {
      console.warn('[Protocol] Blocked access to file outside allowed dirs:', resolved)
      return new Response('Forbidden', { status: 403 })
    }

    return net.fetch(pathToFileURL(resolved).href)
  })
  // Deny all permission requests from the renderer (camera, mic, geolocation, etc.)
  // This app is a local desktop tool — no web permissions are needed
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  // Initialize database before anything else
  initDatabase(getDbPath())
  runMigrations()

  registerAllIpcHandlers()

  mainWindow = createMainWindow()

  // Ensure default sandbox directory exists
  const sandboxDir = path.join(os.homedir(), '.cruchot', 'sandbox')
  fs.mkdirSync(sandboxDir, { recursive: true })

  // Defer non-critical init to after window creation (improves cold start)
  ensureInstanceToken()
  seedBuiltinCommands(BUILTIN_COMMANDS)

  // Scheduler — start timers for enabled scheduled tasks
  schedulerService.init(mainWindow)

  // MCP — start enabled MCP servers
  mcpManagerService.init(mainWindow).catch((err) => {
    console.error('[MCP] Init failed:', err)
  })

  // Telegram Remote — restore active session if any
  telegramBotService.init(mainWindow).catch((err) => {
    console.error('[Telegram] Init failed:', err)
  })

  // WebSocket Remote Server — auto-start if was enabled
  remoteServerService.init(mainWindow).catch((err) => {
    console.error('[RemoteServer] Init failed:', err)
  })

  // Qdrant semantic memory — start if enabled (default: true)
  qdrantMemoryService.init().catch((err) => {
    console.error('[QdrantMemory] Init failed:', err)
  })

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
  qdrantMemoryService.stop().catch(() => {})
  telegramBotService.destroy().catch(() => {})
  remoteServerService.destroy().catch(() => {})
  mcpManagerService.stopAll().catch(() => {})
  schedulerService.stopAll()
  stopAutoUpdater()
  closeDatabase()
})

export { mainWindow }
