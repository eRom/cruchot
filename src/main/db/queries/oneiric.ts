import { eq, desc, isNull, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { oneiricRuns, conversations } from '../schema'
import type { OneiricAction } from '../schema'

export interface OneiricRunRow {
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  trigger: 'scheduled' | 'manual' | 'quit'
  modelId: string
  chunksAnalyzed: number
  chunksMerged: number
  chunksDeleted: number
  episodesAnalyzed: number
  episodesReinforced: number
  episodesStaled: number
  episodesDeleted: number
  episodesCreated: number
  episodesUpdated: number
  tokensIn: number
  tokensOut: number
  cost: number
  durationMs: number | null
  errorMessage: string | null
  actions: OneiricAction[]
  startedAt: Date
  completedAt: Date | null
}

export function createOneiricRun(data: {
  trigger: 'scheduled' | 'manual' | 'quit'
  modelId: string
}): string {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(oneiricRuns)
    .values({
      id,
      status: 'running',
      trigger: data.trigger,
      modelId: data.modelId,
      actions: [],
      startedAt: now
    })
    .run()

  return id
}

export function updateOneiricRun(id: string, updates: {
  status?: 'running' | 'completed' | 'failed' | 'cancelled'
  chunksAnalyzed?: number
  chunksMerged?: number
  chunksDeleted?: number
  episodesAnalyzed?: number
  episodesReinforced?: number
  episodesStaled?: number
  episodesDeleted?: number
  episodesCreated?: number
  episodesUpdated?: number
  tokensIn?: number
  tokensOut?: number
  cost?: number
  durationMs?: number
  errorMessage?: string
  actions?: OneiricAction[]
  completedAt?: Date
}): void {
  const db = getDatabase()
  db.update(oneiricRuns)
    .set(updates)
    .where(eq(oneiricRuns.id, id))
    .run()
}

export function getOneiricRun(id: string): OneiricRunRow | undefined {
  const db = getDatabase()
  return db.select().from(oneiricRuns).where(eq(oneiricRuns.id, id)).get()
}

export function getAllOneiricRuns(): OneiricRunRow[] {
  const db = getDatabase()
  return db.select().from(oneiricRuns).orderBy(desc(oneiricRuns.startedAt)).all()
}

export function getLastCompletedOneiricRun(): OneiricRunRow | undefined {
  const db = getDatabase()
  return db.select()
    .from(oneiricRuns)
    .where(eq(oneiricRuns.status, 'completed'))
    .orderBy(desc(oneiricRuns.completedAt))
    .limit(1)
    .get()
}

export function getConversationsToConsolidate(limit: number): Array<{ id: string }> {
  const db = getDatabase()
  return db.select({ id: conversations.id })
    .from(conversations)
    .where(
      or(
        isNull(conversations.lastOneiricRunAt),
        sql`${conversations.updatedAt} > ${conversations.lastOneiricRunAt}`
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .all()
}

export function markConversationConsolidated(conversationId: string): void {
  const db = getDatabase()
  const now = new Date()
  db.update(conversations)
    .set({ lastOneiricRunAt: now })
    .where(eq(conversations.id, conversationId))
    .run()
}

export function deleteAllOneiricRuns(): void {
  const db = getDatabase()
  db.delete(oneiricRuns).run()
}

/**
 * Mark orphan "running" runs as "failed" — called at startup.
 * A run stuck in "running" means the app crashed mid-consolidation.
 */
export function cleanupOrphanRuns(): number {
  const db = getDatabase()
  const now = new Date()
  const result = db.update(oneiricRuns)
    .set({ status: 'failed', errorMessage: 'Interruption (redemarrage app)', completedAt: now })
    .where(eq(oneiricRuns.status, 'running'))
    .run()
  return result.changes
}
