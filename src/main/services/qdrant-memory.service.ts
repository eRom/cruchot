/**
 * QdrantMemoryService — Singleton memoire semantique.
 * Gere le lifecycle Qdrant + embeddings + ingestion/recall.
 */
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { startQdrant, waitForQdrantReady, stopQdrant, isQdrantAvailable, QDRANT_PORT_NUMBER } from './qdrant-process'
import { initEmbedding, embed, embedBatch, isEmbeddingReady, EMBEDDING_DIM } from './embedding.service'
import { serviceRegistry } from './registry'
import {
  setSyncStatus, getSyncStatus, getPendingSyncCount,
  getIndexedConversationCount, deleteSyncByMessageId,
  deleteSyncByConversationId, deleteAllSync
} from '../db/queries/vector-sync'

const COLLECTION_NAME = 'conversations_memory'
const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 200
const MIN_MESSAGE_LENGTH = 20
const SCORE_THRESHOLD = 0.35
const MAX_SEMANTIC_MEMORY_CHARS = 3000
const SYNC_INTERVAL_MS = 2000
const MAX_BATCH_SIZE = 50
const MAX_RESTART_RETRIES = 3

interface SyncJob {
  messageId: string
  conversationId: string
  projectId: string | null
  role: 'user' | 'assistant'
  content: string
  modelId: string | null
  createdAt: number
}

export interface MemoryRecallResult {
  id: string
  score: number
  content: string
  contentPreview: string
  conversationId: string
  projectId: string | null
  role: string
  modelId: string | null
  createdAt: number
}

export interface MemoryStats {
  totalPoints: number
  indexedConversations: number
  collectionSizeMB: string
  pendingSync: number
  status: string
}

type ServiceStatus = 'stopped' | 'starting' | 'ready' | 'error'

class QdrantMemoryService extends EventEmitter {
  private qdrantProcess: ChildProcess | null = null
  private status: ServiceStatus = 'stopped'
  private syncQueue: SyncJob[] = []
  private syncInterval: NodeJS.Timeout | null = null
  private restartCount = 0
  private lastRecallCount = 0

  // ── Lifecycle ──────────────────────────────────

  async init(): Promise<void> {
    if (this.status === 'ready' || this.status === 'starting') return

    this.status = 'starting'
    this.emit('status', this.status)

    try {
      // Check if Qdrant binary exists
      if (!isQdrantAvailable()) {
        console.warn('[QdrantMemory] Qdrant binary not found — skipping init')
        this.status = 'error'
        this.emit('status', this.status)
        return
      }

      // 1. Start Qdrant binary
      this.qdrantProcess = startQdrant()
      this.qdrantProcess.on('exit', (code) => {
        console.warn('[QdrantMemory] Qdrant process exited with code', code)
        if (this.status === 'ready' && this.restartCount < MAX_RESTART_RETRIES) {
          this.restartCount++
          console.log(`[QdrantMemory] Attempting restart ${this.restartCount}/${MAX_RESTART_RETRIES}...`)
          this.status = 'stopped'
          this.init().catch(err => console.error('[QdrantMemory] Restart failed:', err))
        }
      })

      // 2. Wait for healthcheck
      await waitForQdrantReady()
      console.log('[QdrantMemory] Qdrant is ready')

      // 3. Ensure collection exists
      await this.ensureCollection()

      // 4. Init embedding model
      if (!isEmbeddingReady()) {
        await initEmbedding()
      }

      // 5. Start sync loop
      this.startSyncLoop()

      this.status = 'ready'
      this.restartCount = 0
      this.emit('status', this.status)
      console.log('[QdrantMemory] Service ready')
      serviceRegistry.register('qdrant', this)
    } catch (err) {
      console.error('[QdrantMemory] Init failed:', err)
      this.status = 'error'
      this.emit('status', this.status)
    }
  }

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

  getStatus(): ServiceStatus {
    return this.status
  }

  getLastRecallCount(): number {
    return this.lastRecallCount
  }

  // ── Qdrant Client helpers ──────────────────────

  private async qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `http://127.0.0.1:${QDRANT_PORT_NUMBER}${path}`
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    })
  }

  private async ensureCollection(): Promise<void> {
    // Check if collection exists
    const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}`)
    if (res.ok) return

    // Create collection
    await this.qdrantFetch('/collections/' + COLLECTION_NAME, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          size: EMBEDDING_DIM,
          distance: 'Cosine'
        }
      })
    })
    console.log('[QdrantMemory] Collection created:', COLLECTION_NAME)
  }

  // ── Ingestion ──────────────────────────────────

  async ingest(message: {
    id: string
    conversationId: string
    projectId: string | null
    role: 'user' | 'assistant'
    content: string
    modelId: string | null
    createdAt: Date
  }): Promise<void> {
    // Filter out short/irrelevant messages
    if (message.content.length < MIN_MESSAGE_LENGTH) return
    if (message.role !== 'user' && message.role !== 'assistant') return

    this.syncQueue.push({
      messageId: message.id,
      conversationId: message.conversationId,
      projectId: message.projectId,
      role: message.role,
      content: message.content,
      modelId: message.modelId,
      createdAt: Math.floor(message.createdAt.getTime() / 1000)
    })
  }

  private startSyncLoop(): void {
    if (this.syncInterval) return

    this.syncInterval = setInterval(async () => {
      if (this.syncQueue.length === 0) return
      try {
        await this.processSyncBatch()
      } catch (err) {
        console.error('[QdrantMemory] Sync batch error:', err)
      }
    }, SYNC_INTERVAL_MS)
  }

  private async processSyncBatch(): Promise<void> {
    const batch = this.syncQueue.splice(0, MAX_BATCH_SIZE)
    if (batch.length === 0) return

    // Chunk long messages and prepare texts
    const points: Array<{
      id: string
      vector: number[]
      payload: Record<string, unknown>
    }> = []

    const textsToEmbed: string[] = []
    const pointMeta: Array<{
      id: string
      payload: Record<string, unknown>
    }> = []

    for (const job of batch) {
      const chunks = this.chunkText(job.content)

      for (let i = 0; i < chunks.length; i++) {
        const pointId = randomUUID()
        textsToEmbed.push(chunks[i])
        pointMeta.push({
          id: pointId,
          payload: {
            messageId: job.messageId,
            conversationId: job.conversationId,
            projectId: job.projectId,
            role: job.role,
            content: chunks[i],
            contentPreview: chunks[i].slice(0, 200),
            modelId: job.modelId,
            createdAt: job.createdAt,
            chunkIndex: i
          }
        })
      }
    }

    // Batch embed
    const vectors = await embedBatch(textsToEmbed)

    // Build Qdrant points
    for (let i = 0; i < vectors.length; i++) {
      points.push({
        id: pointMeta[i].id,
        vector: vectors[i],
        payload: pointMeta[i].payload
      })
    }

    // Upsert to Qdrant
    if (points.length > 0) {
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
        method: 'PUT',
        body: JSON.stringify({ points })
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Qdrant upsert failed: ${res.status} ${body}`)
      }
    }

    // Update sync state in SQLite
    for (const job of batch) {
      setSyncStatus({
        messageId: job.messageId,
        conversationId: job.conversationId,
        status: 'indexed',
        pointId: points.find(p =>
          (p.payload as Record<string, unknown>).messageId === job.messageId
        )?.id ?? null
      })
    }
  }

  private chunkText(text: string): string[] {
    if (text.length <= CHUNK_SIZE) return [text]

    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length)

      // Try to cut at paragraph or sentence boundary
      if (end < text.length) {
        const slice = text.slice(start, end)
        const lastParagraph = slice.lastIndexOf('\n\n')
        const lastSentence = slice.lastIndexOf('. ')
        const lastNewline = slice.lastIndexOf('\n')

        if (lastParagraph > CHUNK_SIZE * 0.5) {
          end = start + lastParagraph + 2
        } else if (lastSentence > CHUNK_SIZE * 0.5) {
          end = start + lastSentence + 2
        } else if (lastNewline > CHUNK_SIZE * 0.5) {
          end = start + lastNewline + 1
        }
      }

      chunks.push(text.slice(start, end))

      // If we reached the end, stop
      if (end >= text.length) break

      // Advance with overlap, but always guarantee forward progress
      const nextStart = end - CHUNK_OVERLAP
      start = Math.max(nextStart, start + 1)
    }

    return chunks
  }

  // ── Retrieval ──────────────────────────────────

  async recall(query: string, options?: {
    topK?: number
    scoreThreshold?: number
    projectId?: string | null
    conversationId?: string // exclude current conversation
    maxAge?: number // days
  }): Promise<MemoryRecallResult[]> {
    if (this.status !== 'ready') {
      this.lastRecallCount = 0
      return []
    }

    const topK = options?.topK ?? 5
    const threshold = options?.scoreThreshold ?? SCORE_THRESHOLD

    // Embed query
    const queryVector = await embed(query)

    // Build Qdrant filter (Qdrant REST API v1.17 format)
    const filter: Record<string, unknown[]> = {}

    // Filter by project: match project OR null projectId (global memories)
    if (options?.projectId) {
      filter.should = [
        { is_null: { key: 'projectId' } },
        { key: 'projectId', match: { value: options.projectId } }
      ]
    }

    // Exclude current conversation
    if (options?.conversationId) {
      filter.must_not = [
        { key: 'conversationId', match: { value: options.conversationId } }
      ]
    }

    // Filter by age
    if (options?.maxAge) {
      const cutoff = Math.floor(Date.now() / 1000) - options.maxAge * 86400
      if (!filter.must) filter.must = []
      filter.must.push({ key: 'createdAt', range: { gte: cutoff } })
    }

    // Search Qdrant
    const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: queryVector,
        limit: topK,
        score_threshold: threshold,
        with_payload: true,
        ...(Object.keys(filter).length > 0 ? { filter } : {})
      })
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error('[QdrantMemory] Search failed:', res.status, errBody)
      this.lastRecallCount = 0
      return []
    }

    const data = await res.json() as {
      result: Array<{
        id: string
        score: number
        payload: Record<string, unknown>
      }>
    }

    const results: MemoryRecallResult[] = (data.result || []).map(point => ({
      id: point.id,
      score: point.score,
      content: String(point.payload.content ?? ''),
      contentPreview: String(point.payload.contentPreview ?? ''),
      conversationId: String(point.payload.conversationId ?? ''),
      projectId: point.payload.projectId as string | null,
      role: String(point.payload.role ?? ''),
      modelId: point.payload.modelId as string | null,
      createdAt: Number(point.payload.createdAt ?? 0)
    }))

    this.lastRecallCount = results.length
    return results
  }

  async search(query: string, options?: {
    topK?: number
    projectId?: string | null
  }): Promise<MemoryRecallResult[]> {
    return this.recall(query, {
      topK: options?.topK ?? 10,
      projectId: options?.projectId,
      scoreThreshold: 0.25 // More permissive for manual search
    })
  }

  // ── Management ─────────────────────────────────

  async forget(pointIds: string[]): Promise<void> {
    if (this.status !== 'ready' || pointIds.length === 0) return

    await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: pointIds })
    })
  }

  async forgetConversation(conversationId: string): Promise<void> {
    if (this.status !== 'ready') return

    // Delete by filter in Qdrant
    await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          must: [{ match: { key: 'conversationId', value: conversationId } }]
        }
      })
    })

    // Clean up sync state
    deleteSyncByConversationId(conversationId)
  }

  async forgetAll(): Promise<void> {
    if (this.status !== 'ready') return

    // Delete and recreate collection
    await this.qdrantFetch(`/collections/${COLLECTION_NAME}`, { method: 'DELETE' })
    await this.ensureCollection()

    // Clean up all sync state
    deleteAllSync()
  }

  async getStats(): Promise<MemoryStats> {
    if (this.status !== 'ready') {
      return {
        totalPoints: 0,
        indexedConversations: 0,
        collectionSizeMB: '0',
        pendingSync: this.syncQueue.length,
        status: this.status
      }
    }

    try {
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}`)
      const data = await res.json() as {
        result: {
          points_count: number
          segments_count: number
          disk_data_size: number
          ram_data_size: number
        }
      }

      const totalBytes = (data.result?.disk_data_size ?? 0) + (data.result?.ram_data_size ?? 0)
      const sizeMB = (totalBytes / (1024 * 1024)).toFixed(1)

      return {
        totalPoints: data.result?.points_count ?? 0,
        indexedConversations: getIndexedConversationCount(),
        collectionSizeMB: sizeMB,
        pendingSync: this.syncQueue.length + getPendingSyncCount(),
        status: this.status
      }
    } catch {
      return {
        totalPoints: 0,
        indexedConversations: 0,
        collectionSizeMB: '0',
        pendingSync: this.syncQueue.length,
        status: this.status
      }
    }
  }

  async reindex(allMessages: Array<{
    id: string
    conversationId: string
    projectId: string | null
    role: 'user' | 'assistant'
    content: string
    modelId: string | null
    createdAt: Date
  }>): Promise<void> {
    // Wipe and rebuild
    await this.forgetAll()

    // Queue all messages
    for (const msg of allMessages) {
      await this.ingest(msg)
    }
  }
}

export const qdrantMemoryService = new QdrantMemoryService()
