import { app, BrowserWindow, net, protocol, session } from 'electron'
import * as fs from 'fs'
import { createMainWindow } from './window'
import { registerAllIpcHandlers } from './ipc'
import { initDatabase, closeDatabase } from './db'
import { runMigrations } from './db/migrate'
import { getDbPath } from './utils/paths'
import { initAutoUpdater, stopAutoUpdater } from './services/updater.service'
import { schedulerService } from './services/scheduler.service'
import { seedBuiltinCommands } from './db/queries/slash-commands'
import { BUILTIN_COMMANDS } from './commands/builtin'
import { ensureInstanceToken } from './services/instance-token.service'
import { skillService } from './services/skill.service'
import { serviceRegistry } from './services/registry'
import { vcrHtmlExporterService } from './services/vcr-html-exporter.service'
import { listSkills, createSkill, deleteSkill } from './db/queries/skills'

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[UncaughtException]', error)
})

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// Register custom protocol for serving local images (no bypassCSP — use img-src in CSP instead)
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-image', privileges: { supportFetchAPI: true, stream: true, secure: true } }
])

async function lazyInitServices(mainWindow: BrowserWindow): Promise<void> {
  // MCP — only if servers are configured
  try {
    const { getEnabledMcpServers } = await import('./db/queries/mcp-servers')
    const enabledServers = getEnabledMcpServers()
    if (enabledServers.length > 0) {
      const { mcpManagerService } = await import('./services/mcp-manager.service')
      await mcpManagerService.init(mainWindow)
    }
  } catch (err) {
    console.error('[MCP] Lazy init failed:', err)
  }

  // Telegram — only if active session exists
  try {
    const { getActiveSession } = await import('./db/queries/remote-sessions')
    const session = getActiveSession()
    if (session) {
      const { telegramBotService } = await import('./services/telegram-bot.service')
      await telegramBotService.init(mainWindow)
    }
  } catch (err) {
    console.error('[Telegram] Lazy init failed:', err)
  }

  // Remote WebSocket — only if was enabled
  try {
    const { getServerConfig } = await import('./db/queries/remote-server')
    const config = getServerConfig()
    if (config['ws_enabled'] === 'true') {
      const { remoteServerService } = await import('./services/remote-server.service')
      await remoteServerService.init(mainWindow)
    }
  } catch (err) {
    console.error('[RemoteServer] Lazy init failed:', err)
  }

  // Qdrant semantic memory — only if enabled (default: true)
  try {
    const db = (await import('./db')).getDatabase()
    const { settings } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const row = db.select().from(settings).where(eq(settings.key, 'multi-llm:semantic-memory-enabled')).get()
    const isEnabled = !row || row.value !== 'false' // default true
    if (isEnabled) {
      const { qdrantMemoryService } = await import('./services/qdrant-memory.service')
      await qdrantMemoryService.init()
    }
  } catch (err) {
    console.error('[QdrantMemory] Lazy init failed:', err)
  }
}

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

  // ── VCR template ──────────────────────────────────────────
  try {
    vcrHtmlExporterService.ensureTemplate()
  } catch (err) {
    console.error('[VCR] Template init failed:', err)
  }

  // ── Skills ────────────────────────────────────────────
  skillService.ensureSkillsDir()

  // Sync filesystem skills with DB
  try {
    const discoveredSkills = skillService.discoverSkills()
    const dbSkills = listSkills()
    const dbSkillNames = new Set(dbSkills.map(s => s.name))
    const fsSkillNames = new Set(discoveredSkills.map(s => s.parsed.frontmatter.name))

    // Add skills found on filesystem but not in DB
    for (const { parsed } of discoveredSkills) {
      if (!dbSkillNames.has(parsed.frontmatter.name)) {
        createSkill({
          name: parsed.frontmatter.name,
          description: parsed.frontmatter.description,
          allowedTools: parsed.frontmatter.allowedTools,
          shell: parsed.frontmatter.shell,
          effort: parsed.frontmatter.effort,
          argumentHint: parsed.frontmatter.argumentHint,
          userInvocable: parsed.frontmatter.userInvocable,
          source: 'local'
        })
      }
    }

    // Remove DB entries for skills deleted from filesystem (except barda-managed)
    for (const dbSkill of dbSkills) {
      if (!fsSkillNames.has(dbSkill.name) && dbSkill.source !== 'barda') {
        deleteSkill(dbSkill.id)
      }
    }
  } catch (err) {
    console.warn('[Skills] Startup sync failed:', err)
  }

  // Defer non-critical init to after window creation (improves cold start)
  ensureInstanceToken()
  seedBuiltinCommands(BUILTIN_COMMANDS)

  // Scheduler — always active (lightweight)
  schedulerService.init(mainWindow)

  // Lazy-load non-critical services
  lazyInitServices(mainWindow).catch((err) => {
    console.error('[LazyInit] Unexpected error:', err)
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

app.on('before-quit', async (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true

  console.log('[App] Graceful shutdown starting...')

  try {
    // Stop all registered services in LIFO order
    await serviceRegistry.stopAll()

    // Synchronous stops (not in registry)
    stopAutoUpdater()

    // DB last — everything must be stopped
    closeDatabase()
  } catch (err) {
    console.error('[App] Cleanup error:', err)
  }

  console.log('[App] Graceful shutdown complete')
  app.quit()
})

export { mainWindow }
