# Mémoire Épisodique — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auto-extracted behavioral memory ("episodes") that distills user preferences, habits, skills and style from conversations via LLM analysis.

**Architecture:** SQLite-pure storage (no Qdrant). Episodes are extracted by a configurable LLM when the user switches conversations, idles 5min, or quits the app. All active episodes are injected as `<user-profile>` in the system prompt. UI: MemoryView refactored into 3 tabs (Notes · Souvenirs · Profil).

**Tech Stack:** Drizzle ORM, Zod, AI SDK v6 `generateText()`, Zustand, React, shadcn/ui Tabs, Sonner toasts

**Spec:** `docs/superpowers/specs/2026-04-03-episodic-memory-design.md`

---

## File Structure

### Files to create

| File | Responsibility |
|------|---------------|
| `src/main/db/queries/episodes.ts` | CRUD episodes (SQLite) |
| `src/main/llm/episode-prompt.ts` | Build `<user-profile>` XML block |
| `src/main/services/episode-extractor.service.ts` | LLM extraction logic |
| `src/main/services/episode-trigger.service.ts` | When to extract (switch/idle/quit) |
| `src/main/ipc/episode.ipc.ts` | 7 IPC handlers (Zod) |
| `src/renderer/src/stores/episode.store.ts` | Zustand store |
| `src/renderer/src/components/memory/ProfileTab.tsx` | Profil tab UI |
| `src/renderer/src/components/memory/NotesTab.tsx` | Notes tab (extracted from MemoryView) |

### Files to modify

| File | Change |
|------|--------|
| `src/main/db/schema.ts:265` | Add `episodes` table after `memoryFragments` |
| `src/main/db/migrate.ts:648` | CREATE TABLE + ALTER TABLE + index |
| `src/main/db/queries/cleanup.ts` | Add `episodes` to both cleanup functions |
| `src/main/ipc/index.ts:152` | Register `registerEpisodeIpc()` |
| `src/main/ipc/index.ts:189` | Add `multi-llm:episode-model-id` to ALLOWED_SETTING_KEYS |
| `src/main/ipc/chat.ipc.ts:27` | Import `buildEpisodeProfileBlock` |
| `src/main/ipc/chat.ipc.ts:434` | Inject `<user-profile>` block after semantic memory |
| `src/main/ipc/chat.ipc.ts` | Notify trigger service on message sent |
| `src/main/index.ts:89` | Init trigger service in `lazyInitServices` |
| `src/main/index.ts:208` | Call trigger on `before-quit` |
| `src/preload/index.ts:327` | Add 7 `episode*` methods |
| `src/preload/types.ts:412` | Add `Episode` + `EpisodeCategory` types |
| `src/preload/types.ts:798` | Add episode methods to `ElectronAPI` |
| `src/renderer/src/stores/ui.store.ts:7` | No change needed — `memory` tab stays, tabs are internal to MemoryView |
| `src/renderer/src/components/memory/MemoryView.tsx` | Refactor to 3 tabs |
| `src/renderer/src/components/memory/SemanticMemorySection.tsx` | Move into Souvenirs tab |

---

### Task 1: Schema + Migration

**Files:**
- Modify: `src/main/db/schema.ts:265`
- Modify: `src/main/db/migrate.ts:648`

- [ ] **Step 1: Add `episodes` table to schema.ts**

After line 265 (after `memoryFragments` closing `}`), add:

```typescript
// ---------------------------------------------------------------------------
// Episodes (episodic memory — auto-extracted behavioral facts)
// ---------------------------------------------------------------------------
export const episodes = sqliteTable('episodes', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category', { enum: ['preference', 'behavior', 'context', 'skill', 'style'] }).notNull(),
  confidence: real('confidence').notNull().default(0.5),
  occurrences: integer('occurrences').notNull().default(1),
  projectId: text('project_id'),
  sourceConversationId: text('source_conversation_id').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
```

- [ ] **Step 2: Add migration in migrate.ts**

At the end of `runMigrations()` (after line 647, before closing `}`), add:

```typescript
  // --- Episodic memory (S55) ---
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('preference', 'behavior', 'context', 'skill', 'style')),
      confidence REAL NOT NULL DEFAULT 0.5,
      occurrences INTEGER NOT NULL DEFAULT 1,
      project_id TEXT,
      source_conversation_id TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_episodes_active_project ON episodes(is_active, project_id);
  `)

  // Add last_episode_message_id to conversations
  try {
    sqlite.exec('ALTER TABLE conversations ADD COLUMN last_episode_message_id TEXT')
  } catch {
    // Column already exists — ignore
  }
```

- [ ] **Step 3: Add `lastEpisodeMessageId` to conversations in schema.ts**

In the `conversations` table definition (around line 79, before `createdAt`), add:

```typescript
  lastEpisodeMessageId: text('last_episode_message_id'),
```

- [ ] **Step 4: Verify — run the app to ensure migration applies cleanly**

Run: `bun run dev`
Expected: App starts without SQLite errors, `episodes` table created.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.ts src/main/db/migrate.ts
git commit -m "feat(episode): add episodes table + lastEpisodeMessageId column"
```

---

### Task 2: CRUD Queries

**Files:**
- Create: `src/main/db/queries/episodes.ts`

- [ ] **Step 1: Create episodes.ts queries**

```typescript
import { eq, and, desc, sql, isNull, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { episodes, conversations } from '../schema'

export type EpisodeCategory = 'preference' | 'behavior' | 'context' | 'skill' | 'style'

export interface EpisodeRow {
  id: string
  content: string
  category: EpisodeCategory
  confidence: number
  occurrences: number
  projectId: string | null
  sourceConversationId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export function getAllEpisodes(): EpisodeRow[] {
  const db = getDatabase()
  return db.select().from(episodes).orderBy(desc(episodes.confidence)).all()
}

export function getActiveEpisodes(projectId?: string | null): EpisodeRow[] {
  const db = getDatabase()
  const conditions = [eq(episodes.isActive, true)]

  // Global episodes (projectId IS NULL) + project-scoped if provided
  if (projectId) {
    conditions.push(or(isNull(episodes.projectId), eq(episodes.projectId, projectId))!)
  } else {
    conditions.push(isNull(episodes.projectId))
  }

  return db
    .select()
    .from(episodes)
    .where(and(...conditions))
    .orderBy(desc(episodes.confidence))
    .all()
}

export function getActiveEpisodesForInjection(projectId?: string | null): EpisodeRow[] {
  const all = getActiveEpisodes(projectId)
  // Filter confidence >= 0.3, cap at 100
  return all.filter(e => e.confidence >= 0.3).slice(0, 100)
}

export function createEpisode(data: {
  content: string
  category: EpisodeCategory
  confidence: number
  projectId?: string | null
  sourceConversationId: string
}): EpisodeRow {
  const db = getDatabase()
  const now = new Date()
  const id = nanoid()

  db.insert(episodes)
    .values({
      id,
      content: data.content,
      category: data.category,
      confidence: data.confidence,
      occurrences: 1,
      projectId: data.projectId ?? null,
      sourceConversationId: data.sourceConversationId,
      isActive: true,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return db.select().from(episodes).where(eq(episodes.id, id)).get()!
}

export function reinforceEpisode(id: string, newConfidence: number): EpisodeRow | undefined {
  const db = getDatabase()
  const now = new Date()

  db.run(sql`UPDATE episodes SET occurrences = occurrences + 1, confidence = ${newConfidence}, updated_at = ${Math.floor(now.getTime() / 1000)} WHERE id = ${id}`)

  return db.select().from(episodes).where(eq(episodes.id, id)).get()
}

export function updateEpisode(id: string, updates: { content?: string; confidence?: number }): EpisodeRow | undefined {
  const db = getDatabase()
  const now = new Date()

  db.update(episodes)
    .set({ ...updates, updatedAt: now })
    .where(eq(episodes.id, id))
    .run()

  return db.select().from(episodes).where(eq(episodes.id, id)).get()
}

export function toggleEpisode(id: string): EpisodeRow | undefined {
  const db = getDatabase()
  const now = new Date()

  db.run(sql`UPDATE episodes SET is_active = NOT is_active, updated_at = ${Math.floor(now.getTime() / 1000)} WHERE id = ${id}`)

  return db.select().from(episodes).where(eq(episodes.id, id)).get()
}

export function deleteEpisode(id: string): void {
  const db = getDatabase()
  db.delete(episodes).where(eq(episodes.id, id)).run()
}

export function deleteAllEpisodes(): void {
  const db = getDatabase()
  db.delete(episodes).run()
}

export function getEpisodeStats(): { total: number; active: number; categories: Record<string, number> } {
  const db = getDatabase()
  const total = db.select({ count: sql<number>`COUNT(*)` }).from(episodes).get()!.count
  const active = db.select({ count: sql<number>`COUNT(*)` }).from(episodes).where(eq(episodes.isActive, true)).get()!.count
  const catRows = db
    .select({ category: episodes.category, count: sql<number>`COUNT(*)` })
    .from(episodes)
    .where(eq(episodes.isActive, true))
    .groupBy(episodes.category)
    .all()
  const categories: Record<string, number> = {}
  for (const row of catRows) {
    categories[row.category] = row.count
  }
  return { total, active, categories }
}

export function updateLastEpisodeMessageId(conversationId: string, messageId: string): void {
  const db = getDatabase()
  const now = new Date()
  db.update(conversations)
    .set({ lastEpisodeMessageId: messageId, updatedAt: now })
    .where(eq(conversations.id, conversationId))
    .run()
}

export function getLastEpisodeMessageId(conversationId: string): string | null {
  const db = getDatabase()
  const row = db.select({ lastEpisodeMessageId: conversations.lastEpisodeMessageId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get()
  return row?.lastEpisodeMessageId ?? null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/db/queries/episodes.ts
git commit -m "feat(episode): add CRUD queries for episodes table"
```

---

### Task 3: Episode Prompt Builder

**Files:**
- Create: `src/main/llm/episode-prompt.ts`

- [ ] **Step 1: Create episode-prompt.ts**

```typescript
/**
 * Build the <user-profile> block injected into the system prompt.
 * Contains auto-extracted behavioral episodes about the user.
 */
import { getActiveEpisodesForInjection, type EpisodeRow } from '../db/queries/episodes'

const MAX_CHARS = 2500

export function buildEpisodeProfileBlock(projectId?: string | null): string | null {
  const episodes = getActiveEpisodesForInjection(projectId)
  if (episodes.length === 0) return null

  // Sort by confidence * log(occurrences + 1) desc
  const sorted = [...episodes].sort((a, b) => {
    const scoreA = a.confidence * Math.log(a.occurrences + 1)
    const scoreB = b.confidence * Math.log(b.occurrences + 1)
    return scoreB - scoreA
  })

  let block = '<user-profile>\nProfil comportemental de l\'utilisateur :\n\n'
  let currentLength = block.length

  for (const ep of sorted) {
    const pct = Math.round(ep.confidence * 100)
    const occ = ep.occurrences > 1 ? `, vu ${ep.occurrences}x` : ''

    // Sanitize content to prevent XML injection
    const content = ep.content
      .replace(/<\/user-profile>/gi, '&lt;/user-profile&gt;')
      .slice(0, 200)

    const entry = `[${ep.category}] (confiance: ${pct}%${occ}) ${content}\n`

    if (currentLength + entry.length > MAX_CHARS) break

    block += entry
    currentLength += entry.length
  }

  block += '</user-profile>'
  return block
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/episode-prompt.ts
git commit -m "feat(episode): add episode profile block builder for system prompt"
```

---

### Task 4: Episode Extractor Service

**Files:**
- Create: `src/main/services/episode-extractor.service.ts`

- [ ] **Step 1: Create episode-extractor.service.ts**

```typescript
import { generateText } from 'ai'
import { getModel } from '../llm/router'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getMessagesForConversation } from '../db/queries/messages'
import { getConversation } from '../db/queries/conversations'
import {
  getAllEpisodes,
  createEpisode,
  reinforceEpisode,
  updateEpisode,
  updateLastEpisodeMessageId,
  getLastEpisodeMessageId,
  type EpisodeCategory
} from '../db/queries/episodes'

const EXTRACTION_PROMPT = `Tu es un analyseur comportemental. A partir de cet echange, extrais les faits notables sur l'utilisateur (preferences, habitudes, competences, style, contexte).

Regles :
- Chaque fait doit etre une phrase courte et affirmative
- category : "preference" | "behavior" | "context" | "skill" | "style"
- confidence : 0.0 a 1.0 (1.0 = certain)
- Si un fait existant est re-observe, utilise "reinforce" avec son id
- Si un fait existant a evolue, utilise "update" avec son id et le nouveau contenu
- Retourne [] si rien de notable

Retourne UNIQUEMENT un JSON array valide. Pas de texte avant ou apres.`

interface ExtractionAction {
  action: 'create' | 'reinforce' | 'update'
  content?: string
  category?: EpisodeCategory
  confidence: number
  episodeId?: string
}

class EpisodeExtractorService {
  async extract(conversationId: string): Promise<number> {
    // 1. Get model config
    const { providerId, modelId } = this.getConfiguredModel()
    if (!providerId || !modelId) {
      console.log('[Episode] No model configured, skipping extraction')
      return 0
    }

    // 2. Get delta messages
    const lastMsgId = getLastEpisodeMessageId(conversationId)
    const allMessages = getMessagesForConversation(conversationId)

    let deltaMessages = allMessages
    if (lastMsgId) {
      const lastIdx = allMessages.findIndex(m => m.id === lastMsgId)
      if (lastIdx >= 0) {
        deltaMessages = allMessages.slice(lastIdx + 1)
      }
    }

    // Guard: skip if less than 4 messages in delta
    if (deltaMessages.length < 4) {
      console.log(`[Episode] Delta too small (${deltaMessages.length} msgs), skipping`)
      return 0
    }

    // 3. Build prompt with existing episodes
    const existingEpisodes = getAllEpisodes()
    const conv = getConversation(conversationId)
    const projectId = conv?.projectId ?? null

    const existingBlock = existingEpisodes.length > 0
      ? existingEpisodes.map(e =>
        `[id: "${e.id}"] (x${e.occurrences}, ${e.confidence.toFixed(2)}) ${e.category}: "${e.content}"`
      ).join('\n')
      : '(aucun episode existant)'

    const deltaBlock = deltaMessages.map(m => {
      const role = m.role === 'user' ? 'Utilisateur' : 'Assistant'
      // Truncate long messages for the extraction prompt
      const content = m.content.slice(0, 500)
      return `[${role}] : ${content}`
    }).join('\n')

    const userPrompt = `Episodes deja connus :\n<existing-episodes>\n${existingBlock}\n</existing-episodes>\n\nConversation a analyser :\n<conversation-delta>\n${deltaBlock}\n</conversation-delta>`

    // 4. Call LLM
    try {
      const model = getModel(providerId, modelId)
      const result = await generateText({
        model,
        system: EXTRACTION_PROMPT,
        prompt: userPrompt,
        temperature: 0.3,
        maxTokens: 2000
      })

      const text = await result.text

      // 5. Parse JSON
      const actions = this.parseActions(text)
      if (actions.length === 0) {
        console.log('[Episode] No episodes extracted')
      }

      // 6. Apply actions
      let count = 0
      for (const action of actions) {
        try {
          if (action.action === 'create' && action.content && action.category) {
            createEpisode({
              content: action.content,
              category: action.category,
              confidence: Math.max(0, Math.min(1, action.confidence)),
              projectId,
              sourceConversationId: conversationId
            })
            count++
          } else if (action.action === 'reinforce' && action.episodeId) {
            reinforceEpisode(action.episodeId, Math.max(0, Math.min(1, action.confidence)))
            count++
          } else if (action.action === 'update' && action.episodeId && action.content) {
            updateEpisode(action.episodeId, {
              content: action.content,
              confidence: Math.max(0, Math.min(1, action.confidence))
            })
            count++
          }
        } catch (err) {
          console.error('[Episode] Failed to apply action:', action, err)
        }
      }

      // 7. Update last extracted message ID
      if (allMessages.length > 0) {
        updateLastEpisodeMessageId(conversationId, allMessages[allMessages.length - 1].id)
      }

      console.log(`[Episode] Extracted ${count} episodes from conversation ${conversationId}`)
      return count
    } catch (err) {
      console.error('[Episode] Extraction failed:', err)
      return 0
    }
  }

  private parseActions(text: string): ExtractionAction[] {
    try {
      // Try to extract JSON from the response (LLM may wrap in markdown)
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed)) return []

      return parsed.filter((a: unknown) => {
        if (typeof a !== 'object' || a === null) return false
        const obj = a as Record<string, unknown>
        return typeof obj.action === 'string' && typeof obj.confidence === 'number'
      })
    } catch {
      console.error('[Episode] Failed to parse extraction JSON')
      return []
    }
  }

  private getConfiguredModel(): { providerId: string | null; modelId: string | null } {
    try {
      const db = getDatabase()
      const row = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
      if (!row?.value) return { providerId: null, modelId: null }

      const parts = row.value.split('::')
      if (parts.length !== 2) return { providerId: null, modelId: null }

      return { providerId: parts[0], modelId: parts[1] }
    } catch {
      return { providerId: null, modelId: null }
    }
  }
}

export const episodeExtractorService = new EpisodeExtractorService()
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/episode-extractor.service.ts
git commit -m "feat(episode): add LLM-based episode extractor service"
```

---

### Task 5: Episode Trigger Service

**Files:**
- Create: `src/main/services/episode-trigger.service.ts`

- [ ] **Step 1: Create episode-trigger.service.ts**

```typescript
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { episodeExtractorService } from './episode-extractor.service'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

class EpisodeTriggerService {
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private extractingSet = new Set<string>()
  private activeConversationId: string | null = null
  private enabled = false

  init(): void {
    this.enabled = this.isEpisodeMemoryEnabled()
    if (this.enabled) {
      console.log('[EpisodeTrigger] Initialized')
    }
  }

  /**
   * Called when the user switches to a different conversation.
   * Triggers extraction on the conversation being left.
   */
  onConversationChanged(newConversationId: string): void {
    if (!this.enabled) return

    const previousId = this.activeConversationId
    this.activeConversationId = newConversationId

    // Clear idle timer for previous conversation
    if (previousId) {
      this.clearIdleTimer(previousId)
      this.triggerExtraction(previousId)
    }

    // Start idle timer for new conversation
    this.resetIdleTimer(newConversationId)
  }

  /**
   * Called after each message is sent/received.
   * Resets the idle timer for the active conversation.
   */
  onMessageSent(conversationId: string): void {
    if (!this.enabled) return
    this.activeConversationId = conversationId
    this.resetIdleTimer(conversationId)
  }

  /**
   * Called on app before-quit.
   * Extracts from all conversations with pending deltas.
   */
  async onAppQuitting(): Promise<void> {
    if (!this.enabled) return

    // Clear all idle timers
    for (const [, timer] of this.idleTimers) {
      clearTimeout(timer)
    }
    this.idleTimers.clear()

    // Extract from active conversation if any
    if (this.activeConversationId && !this.extractingSet.has(this.activeConversationId)) {
      try {
        await episodeExtractorService.extract(this.activeConversationId)
      } catch (err) {
        console.error('[EpisodeTrigger] Quit extraction failed:', err)
      }
    }
  }

  /**
   * Refresh enabled state (called when setting changes).
   */
  refresh(): void {
    this.enabled = this.isEpisodeMemoryEnabled()
    if (!this.enabled) {
      // Clear all timers
      for (const [, timer] of this.idleTimers) {
        clearTimeout(timer)
      }
      this.idleTimers.clear()
    }
  }

  dispose(): void {
    for (const [, timer] of this.idleTimers) {
      clearTimeout(timer)
    }
    this.idleTimers.clear()
    this.extractingSet.clear()
  }

  // ── Private ──────────────────────────────────────────

  private triggerExtraction(conversationId: string): void {
    if (this.extractingSet.has(conversationId)) return

    this.extractingSet.add(conversationId)

    // Fire-and-forget
    episodeExtractorService.extract(conversationId)
      .catch(err => console.error('[EpisodeTrigger] Extraction error:', err))
      .finally(() => this.extractingSet.delete(conversationId))
  }

  private resetIdleTimer(conversationId: string): void {
    this.clearIdleTimer(conversationId)

    const timer = setTimeout(() => {
      this.idleTimers.delete(conversationId)
      this.triggerExtraction(conversationId)
    }, IDLE_TIMEOUT_MS)

    this.idleTimers.set(conversationId, timer)
  }

  private clearIdleTimer(conversationId: string): void {
    const existing = this.idleTimers.get(conversationId)
    if (existing) {
      clearTimeout(existing)
      this.idleTimers.delete(conversationId)
    }
  }

  private isEpisodeMemoryEnabled(): boolean {
    try {
      const db = getDatabase()
      const modelRow = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
      // Enabled if a model is configured
      return !!modelRow?.value
    } catch {
      return false
    }
  }
}

export const episodeTriggerService = new EpisodeTriggerService()
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/episode-trigger.service.ts
git commit -m "feat(episode): add trigger service (switch/idle/quit)"
```

---

### Task 6: IPC Handlers

**Files:**
- Create: `src/main/ipc/episode.ipc.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Create episode.ipc.ts**

```typescript
import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllEpisodes,
  toggleEpisode,
  deleteEpisode,
  deleteAllEpisodes,
  getEpisodeStats
} from '../db/queries/episodes'
import { episodeExtractorService } from '../services/episode-extractor.service'
import { episodeTriggerService } from '../services/episode-trigger.service'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

const setModelSchema = z.object({
  modelId: z.string().min(1).max(200)
})

export function registerEpisodeIpc(): void {
  ipcMain.handle('episode:list', async () => {
    return getAllEpisodes()
  })

  ipcMain.handle('episode:toggle', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Episode ID required')
    return toggleEpisode(id)
  })

  ipcMain.handle('episode:delete', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Episode ID required')
    deleteEpisode(id)
  })

  ipcMain.handle('episode:delete-all', async () => {
    deleteAllEpisodes()
  })

  ipcMain.handle('episode:stats', async () => {
    const stats = getEpisodeStats()
    const db = getDatabase()
    const modelRow = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
    return {
      ...stats,
      modelId: modelRow?.value ?? null
    }
  })

  ipcMain.handle('episode:set-model', async (_event, data: unknown) => {
    const parsed = setModelSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid model data')

    const db = getDatabase()
    db.insert(settings)
      .values({ key: 'multi-llm:episode-model-id', value: parsed.data.modelId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: parsed.data.modelId, updatedAt: new Date() }
      })
      .run()

    // Refresh trigger service
    episodeTriggerService.refresh()
  })

  ipcMain.handle('episode:extract-now', async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') throw new Error('Conversation ID required')
    const count = await episodeExtractorService.extract(conversationId)
    return { extracted: count }
  })

  console.log('[IPC] Episode handlers registered')
}
```

- [ ] **Step 2: Register in index.ts**

In `src/main/ipc/index.ts`, add import after line 40:

```typescript
import { registerEpisodeIpc } from './episode.ipc'
```

Add registration after VCR (line 152):

```typescript
  // ── Episodes (episodic memory) ────────────────────────────
  registerEpisodeIpc()
```

Add to ALLOWED_SETTING_KEYS (after line 189):

```typescript
    'multi-llm:episode-model-id',
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/episode.ipc.ts src/main/ipc/index.ts
git commit -m "feat(episode): add 7 IPC handlers with Zod validation"
```

---

### Task 7: Cleanup Integration

**Files:**
- Modify: `src/main/db/queries/cleanup.ts`

- [ ] **Step 1: Import episodes in cleanup.ts**

Add `episodes` to the import from `../schema` (line 3):

```typescript
import {
  attachments,
  images,
  messages,
  remoteSessions,
  conversations,
  scheduledTasks,
  mcpServers,
  slashCommands,
  projects,
  roles,
  prompts,
  memoryFragments,
  statistics,
  ttsUsage,
  settings,
  vectorSyncState,
  libraryChunks,
  librarySources,
  libraries,
  arenaMatches,
  bardas,
  skills,
  permissionRules,
  episodes
} from '../schema'
```

- [ ] **Step 2: Add episodes to zone orange cleanup**

In `deleteConversationsProjectsImages()`, add before `db.delete(messages).run()` (line 46):

```typescript
  db.delete(episodes).run()
```

- [ ] **Step 3: Add episodes to zone rouge factory reset**

In `factoryResetDatabase()`, add before `db.delete(memoryFragments).run()` (line 85):

```typescript
  db.delete(episodes).run()
```

- [ ] **Step 4: Commit**

```bash
git add src/main/db/queries/cleanup.ts
git commit -m "feat(episode): add episodes to cleanup and factory reset"
```

---

### Task 8: System Prompt Injection + Trigger Wiring

**Files:**
- Modify: `src/main/ipc/chat.ipc.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Import episode prompt builder in chat.ipc.ts**

After line 24 (`import { buildSemanticMemoryBlock }`), add:

```typescript
import { buildEpisodeProfileBlock } from '../llm/episode-prompt'
import { episodeTriggerService } from '../services/episode-trigger.service'
```

- [ ] **Step 2: Inject `<user-profile>` block**

In `prepareChat()`, after the semantic memory injection (line 434), add:

```typescript
  const episodeProfileBlock = buildEpisodeProfileBlock(conv?.projectId)
  if (episodeProfileBlock) {
    if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
    combinedSystemPrompt += episodeProfileBlock
  }
```

- [ ] **Step 3: Notify trigger on message sent**

Find the location where the user message is saved to DB (after `createMessage` call in the chat:send handler). Add after the message creation:

```typescript
  episodeTriggerService.onMessageSent(conversationId)
```

- [ ] **Step 4: Init trigger service in index.ts**

In `lazyInitServices()` (after Qdrant init block, around line 88), add:

```typescript
  // Episodic memory trigger
  try {
    const { episodeTriggerService } = await import('./services/episode-trigger.service')
    episodeTriggerService.init()
  } catch (err) {
    console.error('[EpisodeTrigger] Lazy init failed:', err)
  }
```

- [ ] **Step 5: Add trigger to before-quit handler**

In `app.on('before-quit', ...)` (line 208), before `await serviceRegistry.stopAll()`, add:

```typescript
    // Flush episodic memory extraction
    try {
      const { episodeTriggerService } = await import('./services/episode-trigger.service')
      await episodeTriggerService.onAppQuitting()
      episodeTriggerService.dispose()
    } catch (err) {
      console.error('[EpisodeTrigger] Quit flush failed:', err)
    }
```

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/chat.ipc.ts src/main/index.ts
git commit -m "feat(episode): inject <user-profile> in system prompt + wire trigger service"
```

---

### Task 9: Preload Bridge

**Files:**
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add types in types.ts**

After `MemoryFragment` interface (line 412), add:

```typescript
// ── Episodes (episodic memory) ──────────────────────────────
export type EpisodeCategory = 'preference' | 'behavior' | 'context' | 'skill' | 'style'

export interface Episode {
  id: string
  content: string
  category: EpisodeCategory
  confidence: number
  occurrences: number
  projectId: string | null
  sourceConversationId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface EpisodeStats {
  total: number
  active: number
  categories: Record<string, number>
  modelId: string | null
}
```

- [ ] **Step 2: Add episode methods to ElectronAPI interface**

In the `ElectronAPI` interface (around line 798+), add after memory fragment methods:

```typescript
  // Episodes (episodic memory)
  listEpisodes: () => Promise<Episode[]>
  toggleEpisode: (id: string) => Promise<Episode | undefined>
  deleteEpisode: (id: string) => Promise<void>
  deleteAllEpisodes: () => Promise<void>
  episodeStats: () => Promise<EpisodeStats>
  setEpisodeModel: (data: { modelId: string }) => Promise<void>
  extractEpisodesNow: (conversationId: string) => Promise<{ extracted: number }>
```

- [ ] **Step 3: Add methods in preload/index.ts**

After memory fragment methods (after line 327), add:

```typescript
  // ── Episodes (episodic memory) ─────────────────────────
  listEpisodes: () => ipcRenderer.invoke('episode:list'),
  toggleEpisode: (id) => ipcRenderer.invoke('episode:toggle', id),
  deleteEpisode: (id) => ipcRenderer.invoke('episode:delete', id),
  deleteAllEpisodes: () => ipcRenderer.invoke('episode:delete-all'),
  episodeStats: () => ipcRenderer.invoke('episode:stats'),
  setEpisodeModel: (data) => ipcRenderer.invoke('episode:set-model', data),
  extractEpisodesNow: (conversationId) => ipcRenderer.invoke('episode:extract-now', conversationId),
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/types.ts src/preload/index.ts
git commit -m "feat(episode): add 7 preload bridge methods + Episode types"
```

---

### Task 10: Zustand Store

**Files:**
- Create: `src/renderer/src/stores/episode.store.ts`

- [ ] **Step 1: Create episode.store.ts**

```typescript
import { create } from 'zustand'
import type { Episode, EpisodeStats } from '../../../preload/types'

interface EpisodeState {
  episodes: Episode[]
  stats: EpisodeStats | null
  isLoaded: boolean

  loadEpisodes: () => Promise<void>
  loadStats: () => Promise<void>
  toggleEpisode: (id: string) => Promise<void>
  deleteEpisode: (id: string) => Promise<void>
  deleteAllEpisodes: () => Promise<void>
  setModel: (modelId: string) => Promise<void>
  extractNow: (conversationId: string) => Promise<number>
}

export const useEpisodeStore = create<EpisodeState>((set) => ({
  episodes: [],
  stats: null,
  isLoaded: false,

  loadEpisodes: async () => {
    const episodes = await window.api.listEpisodes()
    set({ episodes, isLoaded: true })
  },

  loadStats: async () => {
    const stats = await window.api.episodeStats()
    set({ stats })
  },

  toggleEpisode: async (id) => {
    await window.api.toggleEpisode(id)
    const episodes = await window.api.listEpisodes()
    set({ episodes })
  },

  deleteEpisode: async (id) => {
    await window.api.deleteEpisode(id)
    const episodes = await window.api.listEpisodes()
    const stats = await window.api.episodeStats()
    set({ episodes, stats })
  },

  deleteAllEpisodes: async () => {
    await window.api.deleteAllEpisodes()
    set({ episodes: [], stats: { total: 0, active: 0, categories: {}, modelId: null } })
  },

  setModel: async (modelId) => {
    await window.api.setEpisodeModel({ modelId })
    const stats = await window.api.episodeStats()
    set({ stats })
  },

  extractNow: async (conversationId) => {
    const result = await window.api.extractEpisodesNow(conversationId)
    const episodes = await window.api.listEpisodes()
    const stats = await window.api.episodeStats()
    set({ episodes, stats })
    return result.extracted
  }
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/stores/episode.store.ts
git commit -m "feat(episode): add Zustand store for episodes"
```

---

### Task 11: ProfileTab Component

**Files:**
- Create: `src/renderer/src/components/memory/ProfileTab.tsx`

- [ ] **Step 1: Create ProfileTab.tsx**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Trash2, Sparkles, Zap } from 'lucide-react'
import { useEpisodeStore } from '@/stores/episode.store'
import { useProvidersStore } from '@/stores/providers.store'
import { toast } from 'sonner'
import type { Episode, EpisodeCategory } from '../../../../preload/types'

const CATEGORY_LABELS: Record<EpisodeCategory, string> = {
  preference: 'Preference',
  behavior: 'Comportement',
  context: 'Contexte',
  skill: 'Competence',
  style: 'Style'
}

const CATEGORY_COLORS: Record<EpisodeCategory, string> = {
  preference: 'bg-blue-500/20 text-blue-400',
  behavior: 'bg-green-500/20 text-green-400',
  context: 'bg-amber-500/20 text-amber-400',
  skill: 'bg-purple-500/20 text-purple-400',
  style: 'bg-pink-500/20 text-pink-400'
}

export function ProfileTab() {
  const episodes = useEpisodeStore((s) => s.episodes)
  const stats = useEpisodeStore((s) => s.stats)
  const isLoaded = useEpisodeStore((s) => s.isLoaded)
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes)
  const loadStats = useEpisodeStore((s) => s.loadStats)
  const toggleEpisode = useEpisodeStore((s) => s.toggleEpisode)
  const deleteEpisode = useEpisodeStore((s) => s.deleteEpisode)
  const setModel = useEpisodeStore((s) => s.setModel)

  const models = useProvidersStore((s) => s.models)

  const [selectedModelId, setSelectedModelId] = useState<string>('')

  useEffect(() => {
    if (!isLoaded) loadEpisodes()
    loadStats()
  }, [isLoaded, loadEpisodes, loadStats])

  useEffect(() => {
    if (stats?.modelId) setSelectedModelId(stats.modelId)
  }, [stats?.modelId])

  const handleModelChange = useCallback(async (value: string) => {
    setSelectedModelId(value)
    try {
      await setModel(value)
      toast.success('Modele d\'extraction mis a jour')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }, [setModel])

  const handleToggle = useCallback(async (id: string) => {
    try {
      await toggleEpisode(id)
    } catch {
      toast.error('Erreur')
    }
  }, [toggleEpisode])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteEpisode(id)
      toast.success('Episode supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }, [deleteEpisode])

  // Group episodes by category
  const grouped = useMemo(() => {
    const groups: Record<string, Episode[]> = {}
    const sorted = [...episodes].sort((a, b) => b.confidence - a.confidence)
    for (const ep of sorted) {
      if (!groups[ep.category]) groups[ep.category] = []
      groups[ep.category].push(ep)
    }
    return groups
  }, [episodes])

  const activeCount = useMemo(() => episodes.filter(e => e.isActive).length, [episodes])

  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Modele d'extraction</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              LLM utilise pour analyser les conversations et extraire les episodes
            </p>
          </div>
          <select
            value={selectedModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          >
            <option value="">Non configure</option>
            {models.map((m) => (
              <option key={`${m.providerId}::${m.id}`} value={`${m.providerId}::${m.id}`}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <p className="text-xs text-muted-foreground">
          {activeCount} actif{activeCount > 1 ? 's' : ''} sur {stats.total} episodes
        </p>
      )}

      {/* Empty state */}
      {episodes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
          <Sparkles className="size-10 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Aucun episode detecte</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Cruchot apprendra a te connaitre au fil des conversations
            </p>
          </div>
        </div>
      )}

      {/* Episodes grouped by category */}
      {Object.entries(grouped).map(([category, eps]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[category as EpisodeCategory]}`}>
              {CATEGORY_LABELS[category as EpisodeCategory]}
            </span>
            <span className="text-xs text-muted-foreground">{eps.length}</span>
          </div>

          {eps.map((ep) => (
            <div
              key={ep.id}
              className={`group flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3 transition-opacity ${!ep.isActive ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{ep.content}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{Math.round(ep.confidence * 100)}%</span>
                  {ep.occurrences > 1 && <span>vu {ep.occurrences}x</span>}
                  <span>{new Date(ep.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(ep.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={ep.isActive ? 'Desactiver' : 'Activer'}
                >
                  {ep.isActive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(ep.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  title="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/memory/ProfileTab.tsx
git commit -m "feat(episode): add ProfileTab component with model selector"
```

---

### Task 12: Refactor MemoryView to Tabs

**Files:**
- Modify: `src/renderer/src/components/memory/MemoryView.tsx`

- [ ] **Step 1: Refactor MemoryView with 3 tabs**

Replace the entire content of `MemoryView.tsx`:

```tsx
import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { Brain, Plus, Check, X } from 'lucide-react'
import { useMemoryStore } from '@/stores/memory.store'
import { useBardaStore } from '@/stores/barda.store'
import { MemoryFragmentCard } from './MemoryFragmentCard'
import { MemoryPreview } from './MemoryPreview'
import { SemanticMemorySection } from './SemanticMemorySection'
import { ProfileTab } from './ProfileTab'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type MemoryTab = 'notes' | 'souvenirs' | 'profil'

const TAB_ITEMS: { id: MemoryTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'souvenirs', label: 'Souvenirs' },
  { id: 'profil', label: 'Profil' }
]

export function MemoryView() {
  const [activeTab, setActiveTab] = useState<MemoryTab>('notes')

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Memoire</h1>

          {/* Tab bar */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {TAB_ITEMS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'notes' && <NotesContent />}
          {activeTab === 'souvenirs' && <SemanticMemorySection />}
          {activeTab === 'profil' && <ProfileTab />}
        </div>
      </div>
    </div>
  )
}

// ── Notes tab (existing fragments logic) ───────────────────

function NotesContent() {
  const fragments = useMemoryStore((s) => s.fragments)
  const createFragment = useMemoryStore((s) => s.createFragment)
  const updateFragment = useMemoryStore((s) => s.updateFragment)
  const deleteFragment = useMemoryStore((s) => s.deleteFragment)
  const toggleFragment = useMemoryStore((s) => s.toggleFragment)
  const reorderFragments = useMemoryStore((s) => s.reorderFragments)

  const disabledNamespaces = useBardaStore((s) => s.disabledNamespaces)
  const filteredFragments = useMemo(
    () => fragments.filter((f) => !f.namespace || !disabledNamespaces.has(f.namespace)),
    [fragments, disabledNamespaces]
  )

  const [isAdding, setIsAdding] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemIndex = useRef<number | null>(null)

  const handleCreate = useCallback(async () => {
    const trimmed = newContent.trim()
    if (!trimmed) return
    try {
      await createFragment(trimmed)
      setNewContent('')
      setIsAdding(false)
      toast.success('Fragment ajoute')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [newContent, createFragment])

  const handleUpdate = useCallback(async (id: string, content: string) => {
    try {
      await updateFragment(id, { content })
      toast.success('Fragment modifie')
    } catch {
      toast.error('Erreur lors de la modification')
    }
  }, [updateFragment])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFragment(id)
      toast.success('Fragment supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }, [deleteFragment])

  const handleToggle = useCallback(async (id: string) => {
    try {
      await toggleFragment(id)
    } catch {
      toast.error('Erreur')
    }
  }, [toggleFragment])

  const handleDragStart = useCallback((index: number) => {
    dragItemIndex.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)
    const from = dragItemIndex.current
    if (from === null || from === dropIndex) return

    const ordered = [...fragments]
    const [moved] = ordered.splice(from, 1)
    ordered.splice(dropIndex, 0, moved)
    reorderFragments(ordered.map(f => f.id))
    dragItemIndex.current = null
  }, [fragments, reorderFragments])

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null)
    dragItemIndex.current = null
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleCreate()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewContent('')
    }
  }

  return (
    <>
      {/* Subheader */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredFragments.length === 0
            ? 'Fragments de contexte personnel injectes dans toutes les conversations'
            : `${filteredFragments.filter(f => f.isActive).length} actif${filteredFragments.filter(f => f.isActive).length > 1 ? 's' : ''} sur ${filteredFragments.length}`
          }
        </p>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-3.5" />
          Ajouter
        </button>
      </div>

      {/* Empty state */}
      {filteredFragments.length === 0 && !isAdding && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
          <Brain className="size-10 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Aucun fragment de memoire</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Ajoutez des informations personnelles (identite, preferences, contexte) qui seront injectees dans chaque conversation
            </p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            Ajouter un fragment
          </button>
        </div>
      )}

      {/* Add form */}
      {isAdding && (
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            autoFocus
            placeholder="Ex: Je suis Romain, architecte logiciel..."
            className="w-full resize-none bg-transparent p-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {newContent.length}/2000
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setIsAdding(false); setNewContent('') }}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
              >
                <X className="size-3" />
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!newContent.trim()}
                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Check className="size-3" />
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fragment list */}
      {filteredFragments.length > 0 && (
        <div className="space-y-2">
          {filteredFragments.map((fragment, index) => (
            <div
              key={fragment.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={dragOverIndex === index ? 'border-t-2 border-primary' : ''}
            >
              <MemoryFragmentCard
                fragment={fragment}
                onToggle={handleToggle}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      {filteredFragments.length > 0 && (
        <div className="border-t border-border/40 pt-6">
          <MemoryPreview fragments={fragments} />
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify the app renders the 3 tabs**

Run: `bun run dev`
Expected: Personnaliser > Memoire shows 3 tabs: Notes (with existing fragments), Souvenirs (semantic memory), Profil (empty state).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/memory/MemoryView.tsx
git commit -m "feat(episode): refactor MemoryView into 3 tabs (Notes/Souvenirs/Profil)"
```

---

### Task 13: Conversation Switch Detection

**Files:**
- Modify: `src/main/ipc/conversations.ipc.ts` (or wherever conversation selection is communicated)

- [ ] **Step 1: Find the conversation switch IPC handler**

The renderer calls something when the user clicks a different conversation in the sidebar. Look for the `loadMessages` or conversation selection handler. The trigger needs to be notified.

Add an IPC handler for conversation focus change:

In `src/main/ipc/conversations.ipc.ts`, add inside `registerConversationsIpc()`:

```typescript
  ipcMain.handle('conversations:focus', async (_event, conversationId: string) => {
    if (!conversationId || typeof conversationId !== 'string') return
    const { episodeTriggerService } = await import('../services/episode-trigger.service')
    episodeTriggerService.onConversationChanged(conversationId)
  })
```

- [ ] **Step 2: Add preload method**

In `src/preload/index.ts`, add after `createConversation`:

```typescript
  focusConversation: (id: string) => ipcRenderer.invoke('conversations:focus', id),
```

Add to `ElectronAPI` in `types.ts`:

```typescript
  focusConversation: (id: string) => Promise<void>
```

- [ ] **Step 3: Call from renderer on conversation switch**

In the conversations store or wherever `selectConversation` is called, add:

```typescript
window.api.focusConversation(conversationId)
```

This is a fire-and-forget call — it doesn't block the UI.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/conversations.ipc.ts src/preload/index.ts src/preload/types.ts src/renderer/src/stores/conversations.store.ts
git commit -m "feat(episode): wire conversation switch detection to trigger service"
```

---

### Task 14: Integration Test

**Files:**
- No new files — manual verification

- [ ] **Step 1: Verify full flow**

1. Start the app: `bun run dev`
2. Go to Personnaliser > Memoire > Profil
3. Select a small model in the model selector (e.g., Gemini Flash)
4. Start a conversation, exchange 5+ messages with distinctive preferences
5. Switch to another conversation
6. Go back to Profil tab — verify episodes appeared
7. Toggle an episode off/on, delete one
8. Start a new conversation — check that `<user-profile>` appears in the system prompt (check console logs)

- [ ] **Step 2: Verify cleanup**

1. Go to Settings > Donnees > Zone orange cleanup
2. Verify episodes are deleted
3. Re-add some episodes (by chatting), then factory reset
4. Verify everything is wiped

- [ ] **Step 3: Verify idle trigger**

1. Configure model, start a conversation with 5+ messages
2. Wait 5 minutes without interacting
3. Check console logs for `[Episode] Extracted N episodes`

- [ ] **Step 4: Final commit with any fixes**

```bash
git add -A
git commit -m "feat(episode): integration fixes and polish"
```

---

### Task 15: Documentation Update

**Files:**
- Modify: `.memory/architecture.md`
- Modify: `.memory/key-files.md`
- Modify: `.memory/patterns.md`

- [ ] **Step 1: Update .memory docs**

Add episodic memory to:
- `architecture.md`: mention `<user-profile>` injection, 3 memory layers
- `key-files.md`: add new files (episode-extractor, episode-trigger, episode-prompt, episode.ipc, ProfileTab, episode.store)
- `patterns.md`: document the trigger pattern and extraction pattern

- [ ] **Step 2: Commit**

```bash
git add .memory/
git commit -m "docs: update .memory with episodic memory architecture"
```
