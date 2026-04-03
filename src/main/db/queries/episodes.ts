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
