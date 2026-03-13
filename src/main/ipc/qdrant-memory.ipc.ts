/**
 * IPC handlers for semantic memory (Qdrant).
 * 8 handlers with Zod validation.
 */
import { ipcMain } from 'electron'
import { z } from 'zod'
import { qdrantMemoryService } from '../services/qdrant-memory.service'

const searchSchema = z.object({
  query: z.string().min(1).max(10_000),
  topK: z.number().int().min(1).max(50).optional().default(10),
  projectId: z.string().optional()
})

const forgetSchema = z.object({
  pointIds: z.array(z.string().min(1)).min(1).max(100)
})

const forgetConversationSchema = z.object({
  conversationId: z.string().min(1)
})

const toggleSchema = z.object({
  enabled: z.boolean()
})

export function registerQdrantMemoryIpc(): void {
  // Status
  ipcMain.handle('memory:semantic-status', async () => {
    const stats = await qdrantMemoryService.getStats()
    return {
      status: stats.status,
      totalPoints: stats.totalPoints,
      collectionSize: stats.collectionSizeMB
    }
  })

  // Search
  ipcMain.handle('memory:semantic-search', async (_event, payload) => {
    const parsed = searchSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    return qdrantMemoryService.search(parsed.data.query, {
      topK: parsed.data.topK,
      projectId: parsed.data.projectId
    })
  })

  // Forget specific points
  ipcMain.handle('memory:semantic-forget', async (_event, payload) => {
    const parsed = forgetSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    await qdrantMemoryService.forget(parsed.data.pointIds)
  })

  // Forget entire conversation
  ipcMain.handle('memory:semantic-forget-conversation', async (_event, payload) => {
    const parsed = forgetConversationSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    await qdrantMemoryService.forgetConversation(parsed.data.conversationId)
  })

  // Forget all
  ipcMain.handle('memory:semantic-forget-all', async () => {
    await qdrantMemoryService.forgetAll()
  })

  // Reindex — requires fetching all messages from DB
  ipcMain.handle('memory:semantic-reindex', async () => {
    const { getDatabase } = await import('../db/index')
    const { messages } = await import('../db/schema')
    const { conversations } = await import('../db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDatabase()

    // Get all user+assistant messages with their conversation's projectId
    const allMsgs = db.select({
      id: messages.id,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      modelId: messages.modelId,
      createdAt: messages.createdAt
    })
      .from(messages)
      .all()
      .filter(m => m.role === 'user' || m.role === 'assistant')

    // Get conversation → projectId mapping
    const convs = db.select({ id: conversations.id, projectId: conversations.projectId })
      .from(conversations)
      .all()
    const convMap = new Map(convs.map(c => [c.id, c.projectId]))

    const formattedMsgs = allMsgs.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      projectId: convMap.get(m.conversationId) ?? null,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      modelId: m.modelId,
      createdAt: m.createdAt
    }))

    await qdrantMemoryService.reindex(formattedMsgs)
  })

  // Toggle
  ipcMain.handle('memory:semantic-toggle', async (_event, payload) => {
    const parsed = toggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    // Persist toggle via settings IPC (reuse existing mechanism)
    const { getDatabase } = await import('../db/index')
    const { settings } = await import('../db/schema')
    const db = getDatabase()
    db.insert(settings)
      .values({
        key: 'multi-llm:semantic-memory-enabled',
        value: String(parsed.data.enabled),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: String(parsed.data.enabled), updatedAt: new Date() }
      })
      .run()

    // Start or stop service based on toggle
    if (parsed.data.enabled && qdrantMemoryService.getStatus() === 'stopped') {
      qdrantMemoryService.init().catch(err => console.error('[QdrantMemory] Start failed:', err))
    } else if (!parsed.data.enabled && qdrantMemoryService.getStatus() === 'ready') {
      await qdrantMemoryService.stop()
    }
  })

  // Detailed stats
  ipcMain.handle('memory:semantic-stats', async () => {
    return qdrantMemoryService.getStats()
  })

  console.log('[IPC] Qdrant Memory handlers registered')
}
