/**
 * OneiricService — Consolidation onirique en 3 phases.
 * Phase 1 (Semantique) : fusionne/supprime les chunks Qdrant redondants.
 * Phase 2 (Episodique) : nettoie les episodes obsoletes/doublons.
 * Phase 3 (Croisee)    : croise chunks recents + episodes pour enrichir le profil.
 */
import { BrowserWindow } from 'electron'
import { generateText } from 'ai'
import { eq } from 'drizzle-orm'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import type { OneiricAction } from '../db/schema'
import {
  createOneiricRun,
  updateOneiricRun,
  getConversationsToConsolidate,
  markConversationConsolidated
} from '../db/queries/oneiric'
import {
  getAllEpisodes,
  createEpisode,
  reinforceEpisode,
  updateEpisode,
  deleteEpisode,
  type EpisodeCategory
} from '../db/queries/episodes'
import { embed } from './embedding.service'
import { QDRANT_PORT_NUMBER } from './qdrant-process'
import {
  SEMANTIC_CONSOLIDATION_PROMPT,
  EPISODIC_CONSOLIDATION_PROMPT,
  CROSS_CONSOLIDATION_PROMPT,
  parseJsonActions,
  type SemanticAction,
  type EpisodicAction,
  type CrossAction
} from './oneiric-prompts'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CONVERSATIONS_PER_RUN = 30
const MIN_CHUNKS_TO_CONSOLIDATE = 3
const MAX_CHUNKS_PER_CONVERSATION = 100
const CROSS_SAMPLE_LIMIT = 50
const CROSS_SAMPLE_DAYS = 7
const MAX_NEW_EPISODES_PER_RUN = 10
const QDRANT_PORT = QDRANT_PORT_NUMBER
const COLLECTION_NAME = 'conversations_memory'

// ── Qdrant point shape ───────────────────────────────────────────────────────

interface QdrantPoint {
  id: string
  payload: Record<string, unknown>
  vector?: number[]
}

// ── Phase stats ──────────────────────────────────────────────────────────────

interface PhaseStats {
  tokensIn: number
  tokensOut: number
  cost: number
  chunksAnalyzed: number
  chunksMerged: number
  chunksDeleted: number
  episodesAnalyzed: number
  episodesReinforced: number
  episodesStaled: number
  episodesDeleted: number
  episodesCreated: number
  episodesUpdated: number
  actions: OneiricAction[]
}

function emptyStats(): PhaseStats {
  return {
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    chunksAnalyzed: 0,
    chunksMerged: 0,
    chunksDeleted: 0,
    episodesAnalyzed: 0,
    episodesReinforced: 0,
    episodesStaled: 0,
    episodesDeleted: 0,
    episodesCreated: 0,
    episodesUpdated: 0,
    actions: []
  }
}

function mergeStats(a: PhaseStats, b: PhaseStats): PhaseStats {
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    cost: a.cost + b.cost,
    chunksAnalyzed: a.chunksAnalyzed + b.chunksAnalyzed,
    chunksMerged: a.chunksMerged + b.chunksMerged,
    chunksDeleted: a.chunksDeleted + b.chunksDeleted,
    episodesAnalyzed: a.episodesAnalyzed + b.episodesAnalyzed,
    episodesReinforced: a.episodesReinforced + b.episodesReinforced,
    episodesStaled: a.episodesStaled + b.episodesStaled,
    episodesDeleted: a.episodesDeleted + b.episodesDeleted,
    episodesCreated: a.episodesCreated + b.episodesCreated,
    episodesUpdated: a.episodesUpdated + b.episodesUpdated,
    actions: [...a.actions, ...b.actions]
  }
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// ── Service ──────────────────────────────────────────────────────────────────

class OneiricService {
  private isRunning = false
  private currentAbortController: AbortController | null = null
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  isConsolidating(): boolean {
    return this.isRunning
  }

  cancel(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }
  }

  // ── Main entry point ────────────────────────────────────────────────────

  async consolidate(trigger: 'scheduled' | 'manual' | 'quit'): Promise<string | null> {
    if (this.isRunning) {
      console.log('[Oneiric] Already running, skipping')
      return null
    }

    // Resolve model from settings
    const { providerId, modelId } = this.getConfiguredModel()
    if (!providerId || !modelId) {
      console.log('[Oneiric] No model configured (multi-llm:oneiric-model-id), skipping')
      return null
    }

    const fullModelId = `${providerId}::${modelId}`
    this.isRunning = true
    this.currentAbortController = new AbortController()

    const startTime = Date.now()
    const runId = createOneiricRun({ trigger, modelId: fullModelId })

    try {
      const model = getModel(providerId, modelId)

      // Phase 1 — Semantic
      this.emitProgress(1, 'Semantique')
      const semanticStats = await this.consolidateSemantic(model, modelId)

      // Phase 2 — Episodic
      this.emitProgress(2, 'Episodique')
      const episodicStats = await this.consolidateEpisodic(model, modelId)

      // Phase 3 — Cross
      this.emitProgress(3, 'Croisee')
      const crossStats = await this.consolidateCross(model, modelId)

      // Aggregate stats
      const total = mergeStats(mergeStats(semanticStats, episodicStats), crossStats)
      const durationMs = Date.now() - startTime

      updateOneiricRun(runId, {
        status: 'completed',
        chunksAnalyzed: total.chunksAnalyzed,
        chunksMerged: total.chunksMerged,
        chunksDeleted: total.chunksDeleted,
        episodesAnalyzed: total.episodesAnalyzed,
        episodesReinforced: total.episodesReinforced,
        episodesStaled: total.episodesStaled,
        episodesDeleted: total.episodesDeleted,
        episodesCreated: total.episodesCreated,
        episodesUpdated: total.episodesUpdated,
        tokensIn: total.tokensIn,
        tokensOut: total.tokensOut,
        cost: total.cost,
        durationMs,
        actions: total.actions,
        completedAt: new Date()
      })

      console.log(`[Oneiric] Consolidation completed in ${durationMs}ms — ` +
        `chunks: ${total.chunksAnalyzed} analyzed, ${total.chunksMerged} merged, ${total.chunksDeleted} deleted | ` +
        `episodes: ${total.episodesAnalyzed} analyzed, ${total.episodesCreated} created, ${total.episodesDeleted} deleted`)

      return runId
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      const status = isAbort ? 'cancelled' : 'failed'
      const errorMessage = err instanceof Error ? err.message : String(err)

      updateOneiricRun(runId, {
        status,
        errorMessage,
        durationMs: Date.now() - startTime,
        completedAt: new Date()
      })

      console.error(`[Oneiric] Consolidation ${status}:`, errorMessage)
      return runId
    } finally {
      this.isRunning = false
      this.currentAbortController = null
    }
  }

  // ── Phase 1 : Semantic ──────────────────────────────────────────────────

  private async consolidateSemantic(
    model: ReturnType<typeof getModel>,
    modelId: string
  ): Promise<PhaseStats> {
    const stats = emptyStats()

    // Check Qdrant availability
    if (!(await this.isQdrantReady())) {
      console.log('[Oneiric:Semantic] Qdrant not ready, skipping')
      return stats
    }

    const conversations = getConversationsToConsolidate(MAX_CONVERSATIONS_PER_RUN)
    if (conversations.length === 0) {
      console.log('[Oneiric:Semantic] No conversations to consolidate')
      return stats
    }

    console.log(`[Oneiric:Semantic] Processing ${conversations.length} conversations`)

    for (const conv of conversations) {
      // Check abort
      if (this.currentAbortController?.signal.aborted) break

      const points = await this.getPointsByConversation(conv.id)
      if (points.length < MIN_CHUNKS_TO_CONSOLIDATE) {
        markConversationConsolidated(conv.id)
        continue
      }

      // Cap at MAX_CHUNKS_PER_CONVERSATION
      const cappedPoints = points.slice(0, MAX_CHUNKS_PER_CONVERSATION)
      stats.chunksAnalyzed += cappedPoints.length

      // Build chunks block
      const chunksBlock = cappedPoints.map(p =>
        `[id: "${p.id}"] ${String(p.payload.content ?? '')}`
      ).join('\n\n')

      const prompt = SEMANTIC_CONSOLIDATION_PROMPT.replace('{chunks}', chunksBlock)

      try {
        const result = await generateText({
          model,
          prompt,
          temperature: 0.2,
          maxTokens: 4000,
          abortSignal: this.currentAbortController?.signal
        })

        const text = await result.text
        const usage = await result.usage
        stats.tokensIn += usage.inputTokens
        stats.tokensOut += usage.outputTokens
        stats.cost += calculateMessageCost(modelId, usage.inputTokens, usage.outputTokens)

        const actions = parseJsonActions<SemanticAction>(text, 'Semantic')

        for (const action of actions) {
          try {
            if (action.action === 'merge' && action.keepId && action.deleteIds?.length && action.mergedContent) {
              await this.mergeChunks(action.keepId, action.deleteIds, action.mergedContent)
              stats.chunksMerged++
              stats.chunksDeleted += action.deleteIds.length
              stats.actions.push({
                phase: 'semantic',
                type: 'merge_chunks',
                details: `Merged ${action.deleteIds.length + 1} chunks`,
                targetIds: [action.keepId, ...action.deleteIds]
              })
            } else if (action.action === 'delete' && action.pointId) {
              await this.deleteChunks([action.pointId])
              stats.chunksDeleted++
              stats.actions.push({
                phase: 'semantic',
                type: 'delete_chunk',
                details: action.reason ?? 'Deleted chunk',
                targetIds: [action.pointId]
              })
            }
            // 'keep' actions are no-ops
          } catch (err) {
            console.error('[Oneiric:Semantic] Failed to apply action:', action, err)
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        console.error(`[Oneiric:Semantic] Failed for conversation ${conv.id}:`, err)
      }

      markConversationConsolidated(conv.id)
    }

    return stats
  }

  // ── Phase 2 : Episodic ─────────────────────────────────────────────────

  private async consolidateEpisodic(
    model: ReturnType<typeof getModel>,
    modelId: string
  ): Promise<PhaseStats> {
    const stats = emptyStats()

    const allEpisodes = getAllEpisodes().filter(e => e.isActive)
    if (allEpisodes.length === 0) {
      console.log('[Oneiric:Episodic] No active episodes, skipping')
      return stats
    }

    stats.episodesAnalyzed = allEpisodes.length
    console.log(`[Oneiric:Episodic] Analyzing ${allEpisodes.length} episodes`)

    // Build formatted block with age/confidence/occurrences
    const now = new Date()
    const episodesBlock = allEpisodes.map(e => {
      const ageMs = now.getTime() - e.createdAt.getTime()
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
      return `[id: "${e.id}"] (x${e.occurrences}, conf: ${e.confidence.toFixed(2)}, age: ${ageDays}j) ${e.category}: "${e.content}"`
    }).join('\n')

    const prompt = EPISODIC_CONSOLIDATION_PROMPT
      .replace('{episodes}', episodesBlock)
      .replace('{date}', now.toISOString().split('T')[0])

    try {
      const result = await generateText({
        model,
        prompt,
        temperature: 0.2,
        maxTokens: 4000,
        abortSignal: this.currentAbortController?.signal
      })

      const text = await result.text
      const usage = await result.usage
      stats.tokensIn += usage.inputTokens
      stats.tokensOut += usage.outputTokens
      stats.cost += calculateMessageCost(modelId, usage.inputTokens, usage.outputTokens)

      const actions = parseJsonActions<EpisodicAction>(text, 'Episodic')

      for (const action of actions) {
        try {
          if (action.action === 'stale' && action.episodeId && action.newConfidence !== undefined) {
            const clamped = clampConfidence(action.newConfidence)
            updateEpisode(action.episodeId, { confidence: clamped })
            stats.episodesStaled++
            stats.actions.push({
              phase: 'episodic',
              type: 'stale_episode',
              details: action.reason ?? `Staled to confidence ${clamped.toFixed(2)}`,
              targetIds: [action.episodeId]
            })
          } else if (action.action === 'merge' && action.keepId && action.deleteIds?.length) {
            for (const delId of action.deleteIds) {
              deleteEpisode(delId)
              stats.episodesDeleted++
            }
            stats.actions.push({
              phase: 'episodic',
              type: 'delete_episode',
              details: action.reason ?? `Merged into ${action.keepId}`,
              targetIds: action.deleteIds
            })
          } else if (action.action === 'delete' && action.episodeId) {
            deleteEpisode(action.episodeId)
            stats.episodesDeleted++
            stats.actions.push({
              phase: 'episodic',
              type: 'delete_episode',
              details: action.reason ?? 'Deleted stale episode',
              targetIds: [action.episodeId]
            })
          }
          // 'keep' actions are no-ops
        } catch (err) {
          console.error('[Oneiric:Episodic] Failed to apply action:', action, err)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      console.error('[Oneiric:Episodic] Phase failed:', err)
    }

    return stats
  }

  // ── Phase 3 : Cross ────────────────────────────────────────────────────

  private async consolidateCross(
    model: ReturnType<typeof getModel>,
    modelId: string
  ): Promise<PhaseStats> {
    const stats = emptyStats()

    // Get active episodes
    const activeEpisodes = getAllEpisodes().filter(e => e.isActive)

    // Get recent Qdrant chunks
    let recentChunks: QdrantPoint[] = []
    if (await this.isQdrantReady()) {
      recentChunks = await this.getRecentChunks(CROSS_SAMPLE_LIMIT, CROSS_SAMPLE_DAYS)
    }

    if (activeEpisodes.length === 0 && recentChunks.length === 0) {
      console.log('[Oneiric:Cross] No episodes and no chunks, skipping')
      return stats
    }

    console.log(`[Oneiric:Cross] Crossing ${activeEpisodes.length} episodes with ${recentChunks.length} chunks`)

    // Build episodes block
    const episodesBlock = activeEpisodes.length > 0
      ? activeEpisodes.map(e =>
        `[id: "${e.id}"] (x${e.occurrences}, conf: ${e.confidence.toFixed(2)}) ${e.category}: "${e.content}"`
      ).join('\n')
      : '(aucun episode)'

    // Build chunks block
    const chunksBlock = recentChunks.length > 0
      ? recentChunks.map(p =>
        `[id: "${p.id}"] ${String(p.payload.content ?? '')}`
      ).join('\n\n')
      : '(aucun chunk recent)'

    const prompt = CROSS_CONSOLIDATION_PROMPT
      .replace('{episodes}', episodesBlock)
      .replace('{chunks}', chunksBlock)

    try {
      const result = await generateText({
        model,
        prompt,
        temperature: 0.3,
        maxTokens: 4000,
        abortSignal: this.currentAbortController?.signal
      })

      const text = await result.text
      const usage = await result.usage
      stats.tokensIn += usage.inputTokens
      stats.tokensOut += usage.outputTokens
      stats.cost += calculateMessageCost(modelId, usage.inputTokens, usage.outputTokens)

      const actions = parseJsonActions<CrossAction>(text, 'Cross')

      let createdCount = 0

      for (const action of actions) {
        try {
          if (action.action === 'create' && action.content && action.category) {
            if (createdCount >= MAX_NEW_EPISODES_PER_RUN) {
              console.log('[Oneiric:Cross] Max new episodes reached, skipping remaining creates')
              continue
            }

            const confidence = clampConfidence(action.confidence)
            if (confidence < 0.5) {
              console.log(`[Oneiric:Cross] Skipping create with low confidence (${confidence})`)
              continue
            }

            const validCategories: EpisodeCategory[] = ['preference', 'behavior', 'context', 'skill', 'style']
            const category = validCategories.includes(action.category as EpisodeCategory)
              ? (action.category as EpisodeCategory)
              : 'context'

            const ep = createEpisode({
              content: action.content,
              category,
              confidence,
              sourceConversationId: 'oneiric-consolidation'
            })
            createdCount++
            stats.episodesCreated++
            stats.actions.push({
              phase: 'cross',
              type: 'create_episode',
              details: `Created: ${action.content.slice(0, 80)}`,
              targetIds: [ep.id]
            })
          } else if (action.action === 'reinforce' && action.episodeId) {
            const confidence = clampConfidence(action.confidence)
            reinforceEpisode(action.episodeId, confidence)
            stats.episodesReinforced++
            stats.actions.push({
              phase: 'cross',
              type: 'reinforce_episode',
              details: action.reason ?? `Reinforced to ${confidence.toFixed(2)}`,
              targetIds: [action.episodeId]
            })
          } else if (action.action === 'update' && action.episodeId && action.content) {
            const confidence = clampConfidence(action.confidence)
            updateEpisode(action.episodeId, {
              content: action.content,
              confidence
            })
            stats.episodesUpdated++
            stats.actions.push({
              phase: 'cross',
              type: 'update_episode',
              details: action.reason ?? `Updated: ${action.content.slice(0, 80)}`,
              targetIds: [action.episodeId]
            })
          }
        } catch (err) {
          console.error('[Oneiric:Cross] Failed to apply action:', action, err)
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      console.error('[Oneiric:Cross] Phase failed:', err)
    }

    return stats
  }

  // ── Qdrant helpers ─────────────────────────────────────────────────────

  private async qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `http://127.0.0.1:${QDRANT_PORT}${path}`
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    })
  }

  private async isQdrantReady(): Promise<boolean> {
    try {
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}`)
      return res.ok
    } catch {
      return false
    }
  }

  private async getPointsByConversation(conversationId: string): Promise<QdrantPoint[]> {
    const allPoints: QdrantPoint[] = []
    let offset: string | number | null = null

    // Paginate with scroll API
    while (true) {
      const body: Record<string, unknown> = {
        filter: {
          must: [{ key: 'conversationId', match: { value: conversationId } }]
        },
        limit: 100,
        with_payload: true
      }
      if (offset !== null) {
        body.offset = offset
      }

      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify(body)
      })

      if (!res.ok) break

      const data = await res.json() as {
        result: {
          points: QdrantPoint[]
          next_page_offset: string | number | null
        }
      }

      const points = data.result?.points ?? []
      allPoints.push(...points)

      const nextOffset = data.result?.next_page_offset
      if (!nextOffset || points.length === 0) break
      offset = nextOffset
    }

    return allPoints
  }

  private async getRecentChunks(limit: number, maxDays: number): Promise<QdrantPoint[]> {
    const cutoff = Math.floor(Date.now() / 1000) - maxDays * 86400

    const body = {
      filter: {
        must: [{ key: 'createdAt', range: { gte: cutoff } }]
      },
      limit,
      with_payload: true
    }

    try {
      const res = await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/scroll`, {
        method: 'POST',
        body: JSON.stringify(body)
      })

      if (!res.ok) return []

      const data = await res.json() as {
        result: {
          points: QdrantPoint[]
        }
      }

      return data.result?.points ?? []
    } catch {
      return []
    }
  }

  private async mergeChunks(keepId: string, deleteIds: string[], mergedContent: string): Promise<void> {
    // Re-embed the merged content
    const vector = await embed(mergedContent)

    // Upsert the kept point with new content + vector
    await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
      method: 'PUT',
      body: JSON.stringify({
        points: [{
          id: keepId,
          vector,
          payload: {
            content: mergedContent,
            contentPreview: mergedContent.slice(0, 200),
            mergedAt: Math.floor(Date.now() / 1000)
          }
        }]
      })
    })

    // Delete old points
    await this.deleteChunks(deleteIds)
  }

  private async deleteChunks(pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) return

    await this.qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: pointIds })
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private getConfiguredModel(): { providerId: string | null; modelId: string | null } {
    try {
      const db = getDatabase()
      const row = db.select().from(settings).where(eq(settings.key, 'multi-llm:oneiric-model-id')).get()
      if (!row?.value) return { providerId: null, modelId: null }

      const parts = row.value.split('::')
      if (parts.length !== 2) return { providerId: null, modelId: null }

      return { providerId: parts[0], modelId: parts[1] }
    } catch {
      return { providerId: null, modelId: null }
    }
  }

  private emitProgress(phase: number, label: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('oneiric:progress', { phase, label })
  }
}

export const oneiricService = new OneiricService()
