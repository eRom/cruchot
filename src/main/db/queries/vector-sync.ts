/**
 * CRUD pour la table vector_sync_state.
 * Track la synchronisation SQLite → Qdrant.
 */
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { vectorSyncState } from '../schema'

export function setSyncStatus(params: {
  messageId: string
  conversationId: string
  status: 'pending' | 'indexed' | 'failed'
  pointId?: string | null
  errorMessage?: string | null
}): void {
  const db = getDatabase()
  const now = new Date()

  db.insert(vectorSyncState)
    .values({
      id: nanoid(),
      messageId: params.messageId,
      conversationId: params.conversationId,
      status: params.status,
      pointId: params.pointId ?? null,
      errorMessage: params.errorMessage ?? null,
      createdAt: now,
      indexedAt: params.status === 'indexed' ? now : null
    })
    .onConflictDoUpdate({
      target: vectorSyncState.messageId,
      set: {
        status: params.status,
        pointId: params.pointId ?? sql`point_id`,
        errorMessage: params.errorMessage ?? null,
        indexedAt: params.status === 'indexed' ? now : sql`indexed_at`
      }
    })
    .run()
}

export function getSyncStatus(messageId: string): { status: string; pointId: string | null } | null {
  const db = getDatabase()
  const row = db.select()
    .from(vectorSyncState)
    .where(eq(vectorSyncState.messageId, messageId))
    .get()

  if (!row) return null
  return { status: row.status, pointId: row.pointId }
}

export function getPendingSyncCount(): number {
  const db = getDatabase()
  const result = db.select({ count: sql<number>`count(*)` })
    .from(vectorSyncState)
    .where(eq(vectorSyncState.status, 'pending'))
    .get()
  return result?.count ?? 0
}

export function getIndexedConversationCount(): number {
  const db = getDatabase()
  const result = db.select({ count: sql<number>`count(distinct ${vectorSyncState.conversationId})` })
    .from(vectorSyncState)
    .where(eq(vectorSyncState.status, 'indexed'))
    .get()
  return result?.count ?? 0
}

export function deleteSyncByMessageId(messageId: string): void {
  const db = getDatabase()
  db.delete(vectorSyncState)
    .where(eq(vectorSyncState.messageId, messageId))
    .run()
}

export function deleteSyncByConversationId(conversationId: string): void {
  const db = getDatabase()
  db.delete(vectorSyncState)
    .where(eq(vectorSyncState.conversationId, conversationId))
    .run()
}

export function deleteAllSync(): void {
  const db = getDatabase()
  db.delete(vectorSyncState).run()
}
