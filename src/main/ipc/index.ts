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
import { registerWorkspaceIpc } from './workspace.ipc'
import { registerTtsIpc } from './tts.ipc'
import { registerScheduledTasksIpc } from './scheduled-tasks.ipc'
import { registerMcpIpc } from './mcp.ipc'
import { registerMemoryFragmentsIpc } from './memory-fragments.ipc'

import { registerRemoteIpc } from './remote.ipc'
import { registerRemoteServerIpc } from './remote-server.ipc'
import { registerSummaryIpc } from './summary.ipc'
import { registerDataIpc } from './data.ipc'
import { registerSlashCommandsIpc } from './slash-commands.ipc'
import { registerQdrantMemoryIpc } from './qdrant-memory.ipc'
import { registerCustomModelsIpc } from './custom-models.ipc'
import { registerLibraryIpc } from './library.ipc'
import { registerPromptOptimizerIpc } from './prompt-optimizer.ipc'
import { registerArenaIpc } from './arena.ipc'
import { registerBardaHandlers } from './barda.ipc'
import { registerSkillsIpc } from './skills.ipc'
import { registerPermissionsIpc } from './permissions.ipc'
import { registerVcrIpc } from './vcr.ipc'
import { registerEpisodeIpc } from './episode.ipc'
import { registerOneiricIpc } from './oneiric.ipc'
import { registerGeminiLiveIpc } from './gemini-live.ipc'
import { registerApplicationsIpc } from './applications.ipc'
import { registerCompactIpc } from './compact.ipc'


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

  // ── Workspace (file system) ────────────────────
  registerWorkspaceIpc()

  // ── TTS (text-to-speech) ─────────────────────
  registerTtsIpc()

  // ── Scheduled Tasks ─────────────────────────
  registerScheduledTasksIpc()

  // ── MCP Servers ────────────────────────────
  registerMcpIpc()

  // ── Memory Fragments ─────────────────────
  registerMemoryFragmentsIpc()


  // ── Remote (Telegram) ────────────────────────
  registerRemoteIpc()

  // ── Remote Server (WebSocket) ───────────────
  registerRemoteServerIpc()

  // ── Summary ─────────────────────────────────
  registerSummaryIpc()

  // ── Data (cleanup / factory reset) ────────────────
  registerDataIpc()

  // ── Slash Commands ────────────────────────────
  registerSlashCommandsIpc()

  // ── Qdrant Memory (semantic) ──────────────────
  registerQdrantMemoryIpc()

  // ── Custom Models (OpenRouter, etc.) ───────────
  registerCustomModelsIpc()

  // ── Libraries (RAG referentiels) ───────────────
  registerLibraryIpc()

  // ── Prompt Optimizer ──────────────────────────
  registerPromptOptimizerIpc()

  // ── Arena (LLM vs LLM) ──────────────────────────
  registerArenaIpc()

  // ── Barda (Brigade Packs) ──────────────────────
  registerBardaHandlers()

  // ── Skills (Packs autonomes SKILL.md) ───────────────
  registerSkillsIpc()

  // ── Permissions (tool access control) ──────────────
  registerPermissionsIpc()

  // ── VCR Recording ──────────────────────────────────────────
  registerVcrIpc()

  // ── Episodes (episodic memory) ────────────────────────────
  registerEpisodeIpc()

  // ── Oneiric (consolidation onirique) ────────────────────
  registerOneiricIpc()

  // ── Gemini Live (voice agent) ─────────────────────────────
  registerGeminiLiveIpc()

  // ── Applications (allowed apps) ─────────────────────────────
  registerApplicationsIpc()

  // ── Compact (context compression) ────────────────────
  registerCompactIpc()

  // ── Settings ────────────────────────────────────────
  const ALLOWED_SETTING_KEYS = new Set([
    // User profile
    'multi-llm:user-name',
    'multi-llm:user-avatar-path',
    // App state
    'multi-llm:onboarding_completed',
    'multi-llm:default-model-id',
    // Appearance
    'multi-llm:theme',
    'multi-llm:language',
    'multi-llm:sidebar-collapsed',
    'multi-llm:font-size',
    'multi-llm:font-size-px',
    'multi-llm:density',
    'multi-llm:message-width',
    // Model params
    'multi-llm:temperature',
    'multi-llm:max-tokens',
    'multi-llm:top-p',
    'multi-llm:thinking-effort',
    // Features
    'multi-llm:search-enabled',
    'multi-llm:tts-provider',
    'multi-llm:favorite-model-ids',
    // Summary
    'multi-llm:summary-model-id',
    'multi-llm:summary-prompt',
    // Remote (non-sensitive — tokens are managed via dedicated encrypted handlers)
    'multi-llm:remote:allowed-user-id',
    'multi-llm:remote:cf-hostname',
    // Local providers
    'lmstudio:baseUrl',
    'ollama:baseUrl',
    // Semantic memory
    'multi-llm:semantic-memory-enabled',
    // Episodic memory
    'multi-llm:episode-model-id',
    // Oneiric consolidation
    'multi-llm:oneiric-model-id',
    'multi-llm:oneiric-schedule',
    // Live audio
    'multi-llm:live-model-id',
    'multi-llm:live-identity-prompt',
  ])

  function isSettingKeyAllowed(key: string): boolean {
    if (key.startsWith('multi-llm:apikey:')) return false
    return ALLOWED_SETTING_KEYS.has(key)
  }

  ipcMain.handle('settings:get', async (_event, key: string) => {
    if (!key || typeof key !== 'string') return null
    if (!isSettingKeyAllowed(key)) {
      throw new Error('Access denied: unknown setting key')
    }
    const db = getDatabase()
    const result = db.select().from(settings).where(eq(settings.key, key)).get()
    return result?.value ?? null
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    if (!key || typeof key !== 'string') throw new Error('Key is required')
    if (typeof value !== 'string' || value.length > 10_000) throw new Error('Invalid value')
    if (!isSettingKeyAllowed(key)) {
      throw new Error('Access denied: unknown setting key')
    }
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
