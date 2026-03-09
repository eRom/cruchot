import { ipcMain } from 'electron'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { registerProvidersIpc } from './providers.ipc'
import { registerChatIpc } from './chat.ipc'
import { registerConversationsIpc } from './conversations.ipc'
import { registerProjectsIpc } from './projects.ipc'
import { registerPromptsIpc } from './prompts.ipc'
import { registerRolesIpc } from './roles.ipc'
import { registerSearchIpc } from './search.ipc'
import { registerExportIpc } from './export.ipc'
import { registerImportIpc } from './import.ipc'
import { registerStatisticsIpc } from './statistics.ipc'
import { registerNotificationIpc } from './notification.ipc'
import { registerBackupIpc } from './backup.ipc'
import { registerNetworkIpc } from './network.ipc'
import { registerFilesIpc } from './files.ipc'
import { registerImagesIpc } from './images.ipc'
import { registerUpdaterIpc } from './updater.ipc'

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

  // ── Projects (CRUD) ────────────────────────────────
  registerProjectsIpc()

  // ── Prompts (CRUD) ─────────────────────────────────
  registerPromptsIpc()

  // ── Roles (CRUD + seed) ────────────────────────────
  registerRolesIpc()

  // ── Search (FTS5) ──────────────────────────────────
  registerSearchIpc()

  // ── Export (conversations) ─────────────────────────
  registerExportIpc()

  // ── Import (conversations) ─────────────────────────
  registerImportIpc()

  // ── Statistics ─────────────────────────────────────
  registerStatisticsIpc()

  // ── Notifications ─────────────────────────────────
  registerNotificationIpc()

  // ── Backup ───────────────────────────────────────
  registerBackupIpc()

  // ── Network ──────────────────────────────────────
  registerNetworkIpc()

  // ── Files (attachments) ──────────────────────────
  registerFilesIpc()

  // ── Images (generation) ──────────────────────────
  registerImagesIpc()

  // ── Updater (auto-update) ──────────────────────
  registerUpdaterIpc()

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
