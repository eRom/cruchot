import { app, BrowserWindow, Menu, net, protocol, session } from 'electron'
import * as fs from 'fs'
import { createMainWindow } from './window'
import { buildAppMenu } from './menu'
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
import { TEST_MODE, TEST_USERDATA } from './test-mode'

import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

// E2E test isolation: when TEST_MODE is set, redirect userData to a temp dir
// so the test run gets its own SQLite DB, Qdrant storage, settings, etc.
// Must run BEFORE protocol.registerSchemesAsPrivileged() and any code that
// reads app.getPath('userData').
// app.setPath() is one of the few Electron APIs callable before app.whenReady().
// Do NOT move this block inside whenReady() — the DB path is resolved before that.
if (TEST_MODE) {
  if (!TEST_USERDATA) {
    throw new Error('[TEST_MODE] CRUCHOT_TEST_USERDATA is required when TEST_MODE=1')
  }
  app.setPath('userData', TEST_USERDATA)
  console.log(`[TEST_MODE] userData redirected → ${TEST_USERDATA}`)
}

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

  // Episodic memory trigger
  try {
    const { episodeTriggerService } = await import('./services/episode-trigger.service')
    episodeTriggerService.init()
  } catch (err) {
    console.error('[EpisodeTrigger] Lazy init failed:', err)
  }

  // Oneiric consolidation — cleanup orphan runs then start trigger
  try {
    const { cleanupOrphanRuns } = await import('./db/queries/oneiric')
    const cleaned = cleanupOrphanRuns()
    if (cleaned > 0) console.log(`[Oneiric] Cleaned ${cleaned} orphan run(s)`)

    const { oneiricTriggerService } = await import('./services/oneiric-trigger.service')
    oneiricTriggerService.init()
  } catch (err) {
    console.error('[OneiricTrigger] Lazy init failed:', err)
  }

}

// Live plugins must be registered BEFORE the renderer probes liveIsAvailable.
// The renderer's App.tsx useEffect runs at T=0 and T=3000ms only — if plugins
// are not registered by then, isAvailable() returns false and stays false until
// a manual reload. Previously this lived inside lazyInitServices() AFTER Qdrant
// init (~3-8s on slower machines), causing a race where the Notch never appeared
// on cold start. The register itself is purely synchronous (Map.set), so we run
// it eagerly here. liveEngineService.init() just stores the BrowserWindow ref.
async function initLiveEngineEarly(mainWindow: BrowserWindow): Promise<void> {
  try {
    const { liveEngineService } = await import('./live/live-engine.service')
    const { livePluginRegistry } = await import('./live/live-plugin-registry')
    const { geminiLivePlugin } = await import('./live/plugins/gemini/gemini-live.plugin')
    livePluginRegistry.register(geminiLivePlugin)
    const { openaiLivePlugin } = await import('./live/plugins/openai/openai-live.plugin')
    livePluginRegistry.register(openaiLivePlugin)
    liveEngineService.init(mainWindow)
  } catch (err) {
    console.error('[LiveEngine] Early init failed:', err)
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
  // Deny all permission requests except microphone (needed for Gemini Live voice)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)
      return
    }
    callback(false)
  })

  // Initialize database before anything else
  initDatabase(getDbPath())
  runMigrations()

  // Ensure the instance token exists BEFORE registering IPC handlers,
  // so handlers like export:bulk and import:bulk that read the token
  // never see an empty `settings` table. Synchronous, ~1ms, no impact
  // on cold start. Was previously deferred (~line 250) and caused a race
  // observed in CI E2E flow run 24067368479 where the renderer sent
  // export:bulk before the deferred init had executed.
  ensureInstanceToken()

  registerAllIpcHandlers()

  // E2E test helpers — registered ONLY when CRUCHOT_TEST_MODE=1.
  // Dynamic import so the module is tree-shaken out of production builds.
  // Fire-and-forget: the registration is fast, no need to block startup.
  // See src/main/ipc/test-helpers.ipc.ts for the security model.
  if (TEST_MODE) {
    import('./ipc/test-helpers.ipc')
      .then(({ registerTestHelpers }) => {
        registerTestHelpers()
        console.log('[TEST_MODE] test-helpers IPC registered')
      })
      .catch((err) => {
        console.error('[TEST_MODE] Failed to register test-helpers IPC:', err)
      })
  }

  // Override the app name BEFORE building the menu — otherwise the menu
  // labels (À propos de X / Masquer X / Quitter X) and the macOS About
  // panel display "Electron" in dev mode (the binary's intrinsic name).
  // In packaged builds Electron uses productName from electron-builder.yml,
  // but in `npm run dev` we run the upstream Electron binary so we must
  // force-name ourselves.
  app.setName('Cruchot')

  // Customise the macOS native About panel (shown when user clicks
  // "À propos de Cruchot" in the app menu). In dev we also point to the
  // PNG icon since the .app bundle icon doesn't exist yet; in packaged
  // builds macOS picks up the .icns from the .app bundle automatically.
  const aboutOptions: Electron.AboutPanelOptionsOptions = {
    applicationName: 'Cruchot',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 Romain Carnot',
    version: '' // suppress the secondary build-version line
  }
  if (!app.isPackaged) {
    aboutOptions.iconPath = path.join(app.getAppPath(), 'resources/icon-1024.png')
  }
  app.setAboutPanelOptions(aboutOptions)

  // Install the application menu BEFORE creating the window so the menu
  // bar is in place from the very first paint. Menu items send actions
  // via webContents.send('menu:action', ...) — handled in renderer App.tsx.
  Menu.setApplicationMenu(buildAppMenu())

  mainWindow = createMainWindow()

  // Set mainWindow ref for oneiric progress events
  import('./services/oneiric.service').then(({ oneiricService }) => {
    oneiricService.setMainWindow(mainWindow!)
  }).catch(() => {})

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

  // Defer non-critical init to after window creation (improves cold start).
  // Note: ensureInstanceToken() was moved above (before registerAllIpcHandlers)
  // to fix a race with export:bulk / import:bulk handlers — see the comment
  // there for context.
  seedBuiltinCommands(BUILTIN_COMMANDS)

  // Scheduler — always active (lightweight)
  schedulerService.init(mainWindow)

  // Live plugins — eager init (must beat the renderer's first probe at T=0)
  initLiveEngineEarly(mainWindow).catch((err) => {
    console.error('[LiveEngine] Early init unexpected error:', err)
  })

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

  // Hide window immediately — user sees instant quit
  BrowserWindow.getAllWindows().forEach((w) => w.hide())

  console.log('[App] Graceful shutdown starting...')

  const SHUTDOWN_TIMEOUT_MS = 20_000

  const cleanup = async (): Promise<void> => {
    // Flush episodic + oneiric in parallel (independent tasks)
    await Promise.allSettled([
      (async () => {
        const { episodeTriggerService } = await import('./services/episode-trigger.service')
        await episodeTriggerService.onAppQuitting()
        episodeTriggerService.dispose()
        console.log('[App] Episode flush done')
      })(),
      (async () => {
        const { oneiricTriggerService } = await import('./services/oneiric-trigger.service')
        await oneiricTriggerService.onAppQuitting()
        oneiricTriggerService.stop()
        console.log('[App] Oneiric flush done')
      })()
    ])

    // Stop all registered services in LIFO order
    await serviceRegistry.stopAll()

    // Synchronous stops (not in registry)
    stopAutoUpdater()
  }

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Shutdown timeout')), SHUTDOWN_TIMEOUT_MS)
    )
    await Promise.race([cleanup(), timeout])
    console.log('[App] Graceful shutdown complete')
  } catch (err) {
    console.error('[App] Shutdown forced after timeout:', err)
  }

  // DB last — always close, even after timeout
  closeDatabase()
  app.quit()
})

export { mainWindow }
