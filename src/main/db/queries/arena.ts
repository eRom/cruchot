import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { arenaMatches } from '../schema'

export interface CreateArenaMatchParams {
  conversationId: string
  userMessageId: string
  leftProviderId: string
  leftModelId: string
  rightProviderId: string
  rightModelId: string
}

export function createArenaMatch(params: CreateArenaMatchParams) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(arenaMatches)
    .values({
      id,
      conversationId: params.conversationId,
      userMessageId: params.userMessageId,
      leftProviderId: params.leftProviderId,
      leftModelId: params.leftModelId,
      rightProviderId: params.rightProviderId,
      rightModelId: params.rightModelId,
      createdAt: now
    })
    .run()

  return db.select().from(arenaMatches).where(eq(arenaMatches.id, id)).get()!
}

export function updateArenaMatchMessageId(id: string, side: 'left' | 'right', messageId: string) {
  const db = getDatabase()
  if (side === 'left') {
    db.update(arenaMatches)
      .set({ leftMessageId: messageId })
      .where(eq(arenaMatches.id, id))
      .run()
  } else {
    db.update(arenaMatches)
      .set({ rightMessageId: messageId })
      .where(eq(arenaMatches.id, id))
      .run()
  }
}

export function updateArenaVote(id: string, vote: 'left' | 'right' | 'tie') {
  const db = getDatabase()
  db.update(arenaMatches)
    .set({ vote, votedAt: new Date() })
    .where(eq(arenaMatches.id, id))
    .run()
}

export function getArenaMatchesForConversation(conversationId: string) {
  const db = getDatabase()
  return db
    .select()
    .from(arenaMatches)
    .where(eq(arenaMatches.conversationId, conversationId))
    .all()
}

export function getArenaStats() {
  const db = getDatabase()
  const rows = db.all(sql`
    SELECT
      left_model_id AS modelId,
      left_provider_id AS providerId,
      SUM(CASE WHEN vote = 'left' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN vote = 'right' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN vote = 'tie' THEN 1 ELSE 0 END) AS ties,
      COUNT(*) AS totalMatches
    FROM arena_matches
    WHERE vote IS NOT NULL
    GROUP BY left_model_id, left_provider_id

    UNION ALL

    SELECT
      right_model_id AS modelId,
      right_provider_id AS providerId,
      SUM(CASE WHEN vote = 'right' THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN vote = 'left' THEN 1 ELSE 0 END) AS losses,
      SUM(CASE WHEN vote = 'tie' THEN 1 ELSE 0 END) AS ties,
      COUNT(*) AS totalMatches
    FROM arena_matches
    WHERE vote IS NOT NULL
    GROUP BY right_model_id, right_provider_id
  `)

  // Merge both sides into a single model stat
  const merged = new Map<string, { modelId: string; providerId: string; wins: number; losses: number; ties: number; totalMatches: number }>()
  for (const row of rows as Array<{ modelId: string; providerId: string; wins: number; losses: number; ties: number; totalMatches: number }>) {
    const key = `${row.providerId}::${row.modelId}`
    const existing = merged.get(key)
    if (existing) {
      existing.wins += Number(row.wins)
      existing.losses += Number(row.losses)
      existing.ties += Number(row.ties)
      existing.totalMatches += Number(row.totalMatches)
    } else {
      merged.set(key, {
        modelId: row.modelId,
        providerId: row.providerId,
        wins: Number(row.wins),
        losses: Number(row.losses),
        ties: Number(row.ties),
        totalMatches: Number(row.totalMatches)
      })
    }
  }

  return Array.from(merged.values())
}
