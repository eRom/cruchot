# Fix Cleanup + ServiceRegistry + Lazy Services — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the zone orange cleanup that incorrectly deletes bardas/skills/MCP/libraries, add a ServiceRegistry for centralized shutdown, and lazy-load non-critical services via dynamic imports.

**Architecture:** A minimal `Stoppable` interface + `ServiceRegistry` singleton manages all service lifecycles. Services register themselves during `.init()`. The main process lazy-loads non-critical services behind DB/settings condition checks. Shutdown iterates the registry in LIFO order.

**Tech Stack:** TypeScript, Electron, Drizzle ORM, better-sqlite3

---

### Task 1: Fix deleteConversationsProjectsImages

**Files:**
- Modify: `src/main/db/queries/cleanup.ts`
- Modify: `src/main/ipc/data.ipc.ts`

- [ ] **Step 1: Fix cleanup.ts — remove non-conversational deletes from zone orange**

In `deleteConversationsProjectsImages()`, remove the DELETE statements for tables that are personnalisation assets. Keep only conversation-related tables.

Current function deletes (lines 40-55):
```typescript
db.delete(attachments).run()
db.delete(images).run()
db.delete(arenaMatches).run()
db.delete(remoteSessions).run()
db.delete(vectorSyncState).run()
db.delete(messages).run()
db.delete(bardas).run()          // REMOVE
db.delete(skills).run()          // REMOVE
db.delete(scheduledTasks).run()
db.delete(mcpServers).run()      // REMOVE
db.delete(slashCommands).run()   // REMOVE
db.delete(libraryChunks).run()   // REMOVE
db.delete(librarySources).run()  // REMOVE
db.delete(libraries).run()       // REMOVE
db.delete(conversations).run()
db.delete(projects).run()
```

New function body:
```typescript
export function deleteConversationsProjectsImages(): { imagePaths: string[] } {
  const db = getDatabase()

  // Recuperer les paths des images avant suppression
  const imageRows = db.select({ path: images.path }).from(images).all()
  const imagePaths = imageRows.map((r) => r.path)

  // Ordre FK : enfants d'abord — UNIQUEMENT donnees conversationnelles
  db.delete(attachments).run()
  db.delete(images).run()
  db.delete(arenaMatches).run()
  db.delete(remoteSessions).run()
  db.delete(vectorSyncState).run()
  db.delete(messages).run()
  db.delete(scheduledTasks).run()
  db.delete(conversations).run()
  db.delete(projects).run()

  return { imagePaths }
}
```

Also remove unused imports from the import block: `mcpServers`, `slashCommands`, `libraryChunks`, `librarySources`, `libraries`, `bardas`, `skills`.

- [ ] **Step 2: Add permissionRules to factoryResetDatabase**

In `factoryResetDatabase()`, add the missing `permissionRules` delete. Add after the `settings` delete (last standalone table). Also add the import.

Add to imports:
```typescript
import {
  // ... existing imports ...
  permissionRules
} from '../schema'
```

Add before `return { imagePaths }`:
```typescript
  db.delete(permissionRules).run()
```

- [ ] **Step 3: Update dialog text in data.ipc.ts**

In `data.ipc.ts`, update the zone orange dialog detail text (line 33) to reflect what is now conserved:

```typescript
detail: 'Les roles, prompts, memoire, parametres, cles API, bardas, skills, serveurs MCP, commandes et referentiels seront conserves.'
```

- [ ] **Step 4: Verify the app starts and both cleanups work**

Run: `npm run dev`

1. Open Settings > Zone orange > Verify the dialog shows the updated text
2. Verify the app functions normally after zone orange cleanup (bardas/skills/MCP/libraries still present)

- [ ] **Step 5: Commit**

```bash
git add src/main/db/queries/cleanup.ts src/main/ipc/data.ipc.ts
git commit -m "fix: zone orange cleanup no longer deletes bardas/skills/MCP/libraries

Conservation stricte : seules les donnees conversationnelles sont supprimees.
Ajoute permissionRules au factory reset."
```

---

### Task 2: Create ServiceRegistry

**Files:**
- Create: `src/main/services/registry.ts`

- [ ] **Step 1: Create the registry file**

```typescript
/**
 * ServiceRegistry — Registre centralise des services stoppables.
 * Les services s'enregistrent dans init(), le shutdown itere en LIFO.
 */

export interface Stoppable {
  stop(): Promise<void>
}

class ServiceRegistry {
  private services: Map<string, Stoppable> = new Map()
  private order: string[] = []

  register(name: string, service: Stoppable): void {
    if (this.services.has(name)) {
      console.warn(`[Registry] Service "${name}" already registered, replacing`)
    } else {
      this.order.push(name)
    }
    this.services.set(name, service)
    console.log(`[Registry] Registered: ${name}`)
  }

  unregister(name: string): void {
    this.services.delete(name)
    this.order = this.order.filter((n) => n !== name)
    console.log(`[Registry] Unregistered: ${name}`)
  }

  has(name: string): boolean {
    return this.services.has(name)
  }

  /**
   * Stop all services in LIFO order (last registered = first stopped).
   * Errors are logged but don't prevent other services from stopping.
   */
  async stopAll(): Promise<void> {
    const reversed = [...this.order].reverse()
    for (const name of reversed) {
      const service = this.services.get(name)
      if (!service) continue
      try {
        await service.stop()
        console.log(`[Registry] Stopped: ${name}`)
      } catch (err) {
        console.error(`[Registry] Error stopping ${name}:`, err)
      }
    }
    this.services.clear()
    this.order = []
  }

  get size(): number {
    return this.services.size
  }
}

export const serviceRegistry = new ServiceRegistry()
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/registry.ts
git commit -m "feat: add ServiceRegistry for centralized service lifecycle"
```

---

### Task 3: Adapt services to register with the registry

**Files:**
- Modify: `src/main/services/scheduler.service.ts`
- Modify: `src/main/services/telegram-bot.service.ts`
- Modify: `src/main/services/remote-server.service.ts`
- Modify: `src/main/services/mcp-manager.service.ts`
- Modify: `src/main/services/qdrant-memory.service.ts`

Each service needs:
1. Import `serviceRegistry` and `Stoppable`
2. A `stop(): Promise<void>` method (some already have it, some use `destroy()` or `stopAll()`)
3. Call `serviceRegistry.register(name, this)` at the end of its `.init()`

- [ ] **Step 1: SchedulerService — add stop() wrapper + register**

`schedulerService` has `stopAll(): void` (synchronous). Add a `stop()` async wrapper and register.

Add import at top of `scheduler.service.ts`:
```typescript
import { serviceRegistry } from './registry'
```

Add method to SchedulerService class (after `stopAll()`):
```typescript
  async stop(): Promise<void> {
    this.stopAll()
  }
```

At end of `init()` method (after `console.log('[Scheduler] Initialized')`):
```typescript
    serviceRegistry.register('scheduler', this)
```

- [ ] **Step 2: TelegramBotService — register**

`telegramBotService` already has `async destroy(): Promise<void>` which calls `this.stop()`. Use `destroy` as the stop method.

Add import at top of `telegram-bot.service.ts`:
```typescript
import { serviceRegistry } from './registry'
```

Find the `init()` method's success path. At the end of the `init()` method, after successful initialization, add:
```typescript
    serviceRegistry.register('telegram', { stop: () => this.destroy() })
```

- [ ] **Step 3: RemoteServerService — register**

`remoteServerService` already has `async destroy(): Promise<void>` which calls `this.stop()`.

Add import at top of `remote-server.service.ts`:
```typescript
import { serviceRegistry } from './registry'
```

At the end of the `init()` method's success path, add:
```typescript
    serviceRegistry.register('remote-server', { stop: () => this.destroy() })
```

- [ ] **Step 4: McpManagerService — register**

`mcpManagerService` has `async stopAll(): Promise<void>`.

Add import at top of `mcp-manager.service.ts`:
```typescript
import { serviceRegistry } from './registry'
```

At the end of the `init()` method, add:
```typescript
    serviceRegistry.register('mcp', { stop: () => this.stopAll() })
```

- [ ] **Step 5: QdrantMemoryService — add stopEmbedding to stop() + register**

`qdrantMemoryService` already has `async stop(): Promise<void>` but it does NOT stop the embedding worker. The current `before-quit` calls `stopEmbedding()` separately. Move it into `qdrantMemoryService.stop()` since Qdrant is the embedding consumer.

Add import at top of `qdrant-memory.service.ts`:
```typescript
import { serviceRegistry } from './registry'
```

In the `stop()` method, add `stopEmbedding()` call **before** stopping Qdrant:
```typescript
  async stop(): Promise<void> {
    // Stop sync loop
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }

    // Flush remaining queue
    if (this.syncQueue.length > 0) {
      try {
        await this.processSyncBatch()
      } catch {
        // Best effort
      }
    }

    // Stop embedding worker first (it may still write to Qdrant)
    try {
      const { stopEmbedding } = await import('./embedding.service')
      await stopEmbedding()
    } catch {
      // Best effort
    }

    // Stop Qdrant
    if (this.qdrantProcess) {
      await stopQdrant(this.qdrantProcess)
      this.qdrantProcess = null
    }

    this.status = 'stopped'
    this.emit('status', this.status)
  }
```

At the end of the `init()` method's success path, add:
```typescript
    serviceRegistry.register('qdrant', this)
```

- [ ] **Step 6: Commit**

```bash
git add src/main/services/scheduler.service.ts src/main/services/telegram-bot.service.ts src/main/services/remote-server.service.ts src/main/services/mcp-manager.service.ts src/main/services/qdrant-memory.service.ts
git commit -m "feat: register all services with ServiceRegistry on init"
```

---

### Task 4: Refactor index.ts — lazy loading + registry shutdown

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Remove static imports for lazy-loaded services**

Remove these static imports from the top of `index.ts`:
```typescript
import { mcpManagerService } from './services/mcp-manager.service'
import { telegramBotService } from './services/telegram-bot.service'
import { remoteServerService } from './services/remote-server.service'
import { qdrantMemoryService } from './services/qdrant-memory.service'
import { stopEmbedding } from './services/embedding.service'
```

Add the registry import:
```typescript
import { serviceRegistry } from './services/registry'
```

Keep these static imports (lightweight, always needed):
```typescript
import { schedulerService } from './services/scheduler.service'
import { initAutoUpdater, stopAutoUpdater } from './services/updater.service'
import { skillService } from './services/skill.service'
```

- [ ] **Step 2: Create lazyInitServices function**

Add this function before `app.whenReady()`:

```typescript
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
```

- [ ] **Step 3: Update app.whenReady() to use lazyInitServices**

Replace the individual service init blocks (lines 126-146) with:

```typescript
  // Scheduler — always active (lightweight)
  schedulerService.init(mainWindow)

  // Lazy-load non-critical services
  lazyInitServices(mainWindow).catch((err) => {
    console.error('[LazyInit] Unexpected error:', err)
  })
```

- [ ] **Step 4: Simplify before-quit with registry**

Replace the entire `before-quit` handler with:

```typescript
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
```

Note: `stopEmbedding()` is no longer called directly here — it's now called inside `qdrantMemoryService.stop()` (added in Task 3 Step 5).

- [ ] **Step 5: Verify the app starts and shuts down cleanly**

Run: `npm run dev`

1. Check console for `[Registry] Registered: scheduler` and other services
2. Check that lazy services only load when needed (disable Telegram in settings, verify no `[Registry] Registered: telegram`)
3. Quit the app, check console for LIFO `[Registry] Stopped: ...` messages
4. Verify clean shutdown (no dangling processes, no WAL errors)

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: lazy-load services + registry-based shutdown

Services non-critiques (MCP, Telegram, Remote, Qdrant) charges via
dynamic import conditionnel. Shutdown LIFO via serviceRegistry.stopAll()."
```

---

### Task 5: Update data.ipc.ts factory reset to use registry

**Files:**
- Modify: `src/main/ipc/data.ipc.ts`

- [ ] **Step 1: Simplify factory reset service stops**

The factory reset in `data.ipc.ts` (lines 62-85) manually imports and stops each service. Replace with registry.

Add import:
```typescript
import { serviceRegistry } from '../services/registry'
```

Replace the 5 try/catch blocks (lines 62-85) with:
```typescript
    // 1. Stop all registered services
    await serviceRegistry.stopAll()
```

Keep the Qdrant `forgetAll()` call separate since it's a data operation, not just a stop. Add it before the registry stop:
```typescript
    // 1. Wipe Qdrant data (if loaded)
    try {
      const { qdrantMemoryService } = await import('../services/qdrant-memory.service')
      await qdrantMemoryService.forgetAll()
    } catch { /* service not loaded */ }

    // 2. Stop all registered services
    await serviceRegistry.stopAll()
```

- [ ] **Step 2: Verify factory reset works**

Run: `npm run dev`

1. Open Settings > Zone rouge > Factory Reset
2. Verify all data is wiped
3. Verify the app restarts cleanly

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/data.ipc.ts
git commit -m "refactor: factory reset uses serviceRegistry.stopAll()"
```

---

### Task 6: Update progress.md

**Files:**
- Modify: `_internal/improvement/progress.md`

- [ ] **Step 1: Mark items as done in progress.md**

Mark the `deleteConversationsProjectsImages supprime bardas/skills` item as done with commit hash.
Mark B5 `Code splitting main process (lazy services)` as done with commit hash.

- [ ] **Step 2: Commit**

```bash
git add _internal/improvement/progress.md
git commit -m "docs: mark cleanup fix + lazy services as done in progress.md"
```
