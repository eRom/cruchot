import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { registerProvidersIpc } from './providers.ipc'
import { registerChatIpc } from './chat.ipc'
import { registerConversationsIpc } from './conversations.ipc'

/**
 * Registre central des IPC handlers.
 * Appele depuis main/index.ts au demarrage de l'app.
 */
export function registerAllIpcHandlers(): void {
  // ── Providers (credentials, models) ─────────────────
  registerProvidersIpc()

  // ── Chat (streaming) ───────────────────────────────
  registerChatIpc()

  // ── Conversations (CRUD) ───────────────────────────
  registerConversationsIpc()

  // ── Settings ────────────────────────────────────────
  ipcMain.handle('settings:get', async (_event, key: string) => {
    if (!key) return null
    const db = getDatabase()
    const result = db.select().from(settings).where(eq(settings.key, key)).get()
    return result?.value ?? null
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    if (!key) throw new Error('Key is required')
    const db = getDatabase()
    db.insert(settings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() }
      })
      .run()
  })

  console.log('[IPC] All handlers registered')
}
