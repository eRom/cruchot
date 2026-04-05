/**
 * LiveMemoryService — Memoire semantique pour les sessions vocales Live.
 *
 * Accumule les transcripts pendant une session Gemini Live,
 * extrait les faits cles en fin de session, et permet le recall/search
 * dans la collection Qdrant `live_memories`.
 */
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { embed, isEmbeddingReady } from './embedding.service'
import { QDRANT_PORT_NUMBER } from './qdrant-process'
import { getDatabase } from '../db'
import { settings } from '../db/schema'

// ── Interfaces ────────────────────────────────────────

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

export interface LiveMemory {
  id: string
  content: string
  timestamp: number
  sessionId: string
  provider: string
}

// ── Constants ─────────────────────────────────────────

const COLLECTION_NAME = 'live_memories'
const EMBEDDING_DIM = 384
const MIN_USER_EXCHANGES = 3
const SEARCH_TOP_K = 5
const SEARCH_THRESHOLD = 0.4
const RECALL_DEFAULT_DAYS = 7

const EXTRACTION_SYSTEM_PROMPT = `Tu es un extracteur de faits. A partir d'une conversation vocale, extrais les faits cles : sujets abordes, decisions, demandes, informations partagees par l'utilisateur.

Regles :
- Chaque fait = une phrase courte et affirmative
- Inclus le contexte temporel si mentionne ("travail sur X", "reunion prevue", etc.)
- Ignore les banalites et formules de politesse
- Retourne UNIQUEMENT un JSON array de strings. Pas de texte avant ou apres.
- Retourne [] si rien de notable.`

// ── Service ───────────────────────────────────────────

class LiveMemoryService {
  private collectionReady = false
  private sessionId: string | null = null
  private sessionProvider: string | null = null
  private transcripts: TranscriptEntry[] = []

  // ── Qdrant helpers ──────────────────────────────────

  private async qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `http://127.0.0.1:${QDRANT_PORT_NUMBER}${path}`
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    })
  }

  private async ensureCollection(): Promise<void> {
    if (this.collectionReady) return

    try {
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}`)
      if (res.ok) {
        this.collectionReady = true
        return
      }

      // Create collection
      const createRes = await this.qdrantFetch(`/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        body: JSON.stringify({
          vectors: {
            size: EMBEDDING_DIM,
            distance: 'Cosine'
          }
        })
      })

      if (!createRes.ok) {
        const body = await createRes.text()
        throw new Error(`Failed to create collection: ${createRes.status} ${body}`)
      }

      this.collectionReady = true
      console.log('[LiveMemory] Collection created:', COLLECTION_NAME)
    } catch (err) {
      console.error('[LiveMemory] ensureCollection failed:', err)
      throw err
    }
  }

  // ── Transcript accumulation ─────────────────────────

  startSession(provider: string): void {
    this.sessionId = randomUUID()
    this.sessionProvider = provider
    this.transcripts = []
    console.log(`[LiveMemory] Session started: ${this.sessionId} (${provider})`)
  }

  addTranscript(role: 'user' | 'assistant', text: string): void {
    if (!this.sessionId) return
    if (!text || text.trim().length === 0) return

    this.transcripts.push({
      role,
      text: text.trim(),
      timestamp: Date.now()
    })
  }

  getTranscriptCount(): number {
    return this.transcripts.length
  }

  // ── Extraction + Upsert ─────────────────────────────

  async extractAndStore(): Promise<number> {
    if (!this.sessionId || !this.sessionProvider) {
      console.log('[LiveMemory] No active session, skipping extraction')
      return 0
    }

    const userExchanges = this.transcripts.filter(t => t.role === 'user').length
    if (userExchanges < MIN_USER_EXCHANGES) {
      console.log(`[LiveMemory] Only ${userExchanges} user exchanges (min: ${MIN_USER_EXCHANGES}), skipping`)
      return 0
    }

    // Get default model from settings
    const { providerId, modelId } = this.getDefaultModel()
    if (!providerId || !modelId) {
      console.log('[LiveMemory] No default model configured, skipping extraction')
      return 0
    }

    // Build transcript text
    const transcriptText = this.transcripts
      .map(t => `[${t.role === 'user' ? 'Utilisateur' : 'Assistant'}] : ${t.text}`)
      .join('\n')

    try {
      // Dynamic imports to avoid circular deps
      const { generateText } = await import('ai')
      const { getModel } = await import('../llm/router')

      const model = getModel(providerId, modelId)
      const result = await generateText({
        model,
        system: EXTRACTION_SYSTEM_PROMPT,
        prompt: transcriptText,
        temperature: 0.3,
        maxTokens: 2000
      })

      const text = await result.text
      const facts = this.parseFacts(text)

      if (facts.length === 0) {
        console.log('[LiveMemory] No facts extracted')
        return 0
      }

      // Check embedding readiness
      if (!isEmbeddingReady()) {
        console.warn('[LiveMemory] Embedding not ready, skipping upsert')
        return 0
      }

      // Ensure collection exists
      await this.ensureCollection()

      // Embed and upsert each fact
      const sessionId = this.sessionId
      const provider = this.sessionProvider
      const now = Date.now()

      const points: Array<{
        id: string
        vector: number[]
        payload: Record<string, unknown>
      }> = []

      for (const fact of facts) {
        try {
          const vector = await embed(fact)
          points.push({
            id: randomUUID(),
            vector,
            payload: {
              content: fact,
              timestamp: now,
              sessionId,
              provider
            }
          })
        } catch (err) {
          console.error('[LiveMemory] Failed to embed fact:', fact, err)
        }
      }

      if (points.length > 0) {
        const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
          method: 'PUT',
          body: JSON.stringify({ points })
        })

        if (!res.ok) {
          const body = await res.text()
          console.error('[LiveMemory] Upsert failed:', res.status, body)
          return 0
        }
      }

      console.log(`[LiveMemory] Stored ${points.length} facts from session ${sessionId}`)
      return points.length
    } catch (err) {
      console.error('[LiveMemory] Extraction failed:', err)
      return 0
    } finally {
      this.transcripts = []
      this.sessionId = null
      this.sessionProvider = null
    }
  }

  private parseFacts(text: string): string[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed)) return []

      return parsed.filter((item: unknown): item is string =>
        typeof item === 'string' && item.trim().length > 0
      )
    } catch {
      console.error('[LiveMemory] Failed to parse extraction JSON')
      return []
    }
  }

  private getDefaultModel(): { providerId: string | null; modelId: string | null } {
    try {
      const db = getDatabase()
      const row = db.select().from(settings).where(eq(settings.key, 'multi-llm:default-model-id')).get()
      if (!row?.value) return { providerId: null, modelId: null }

      const parts = row.value.split('::')
      if (parts.length !== 2) return { providerId: null, modelId: null }

      return { providerId: parts[0], modelId: parts[1] }
    } catch {
      return { providerId: null, modelId: null }
    }
  }

  // ── Recall ──────────────────────────────────────────

  async recallRecent(days: number = RECALL_DEFAULT_DAYS): Promise<LiveMemory[]> {
    try {
      await this.ensureCollection()

      const cutoffMs = Date.now() - days * 86400 * 1000

      // Scroll with timestamp filter
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify({
          filter: {
            must: [
              { key: 'timestamp', range: { gte: cutoffMs } }
            ]
          },
          limit: 100,
          with_payload: true
        })
      })

      if (!res.ok) {
        console.error('[LiveMemory] Recall scroll failed:', res.status)
        return []
      }

      const data = await res.json() as {
        result: {
          points: Array<{
            id: string
            payload: Record<string, unknown>
          }>
        }
      }

      const points = data.result?.points ?? []

      const memories: LiveMemory[] = points.map(point => ({
        id: String(point.id),
        content: String(point.payload.content ?? ''),
        timestamp: Number(point.payload.timestamp ?? 0),
        sessionId: String(point.payload.sessionId ?? ''),
        provider: String(point.payload.provider ?? '')
      }))

      // Sort by timestamp descending (most recent first)
      memories.sort((a, b) => b.timestamp - a.timestamp)

      return memories
    } catch (err) {
      console.error('[LiveMemory] recallRecent failed:', err)
      return []
    }
  }

  // ── Search ──────────────────────────────────────────

  async search(query: string): Promise<LiveMemory[]> {
    if (!isEmbeddingReady()) return []

    try {
      await this.ensureCollection()

      const queryVector = await embed(query)

      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/search`, {
        method: 'POST',
        body: JSON.stringify({
          vector: queryVector,
          limit: SEARCH_TOP_K,
          score_threshold: SEARCH_THRESHOLD,
          with_payload: true
        })
      })

      if (!res.ok) {
        console.error('[LiveMemory] Search failed:', res.status)
        return []
      }

      const data = await res.json() as {
        result: Array<{
          id: string
          score: number
          payload: Record<string, unknown>
        }>
      }

      return (data.result || []).map(point => ({
        id: String(point.id),
        content: String(point.payload.content ?? ''),
        timestamp: Number(point.payload.timestamp ?? 0),
        sessionId: String(point.payload.sessionId ?? ''),
        provider: String(point.payload.provider ?? '')
      }))
    } catch (err) {
      console.error('[LiveMemory] search failed:', err)
      return []
    }
  }
}

export const liveMemoryService = new LiveMemoryService()
