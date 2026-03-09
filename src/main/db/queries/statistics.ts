import { sql } from 'drizzle-orm'
import { getDatabase } from '../index'
import { messages } from '../schema'

export interface DailyStat {
  date: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export interface ProviderStat {
  providerId: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export interface ModelStat {
  modelId: string
  providerId: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export function getDailyStats(days: number = 30): DailyStat[] {
  const db = getDatabase()

  const results = db
    .select({
      date: sql<string>`date(${messages.createdAt} / 1000, 'unixepoch')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)
    .where(
      sql`${messages.createdAt} >= ${new Date(Date.now() - days * 24 * 60 * 60 * 1000)}`
    )
    .groupBy(sql`date(${messages.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${messages.createdAt} / 1000, 'unixepoch') DESC`)
    .all()

  return results
}

export function getProviderStats(): ProviderStat[] {
  const db = getDatabase()

  const results = db
    .select({
      providerId: sql<string>`coalesce(${messages.providerId}, 'unknown')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)
    .where(sql`${messages.role} = 'assistant'`)
    .groupBy(messages.providerId)
    .all()

  return results
}

export function getModelStats(): ModelStat[] {
  const db = getDatabase()

  const results = db
    .select({
      modelId: sql<string>`coalesce(${messages.modelId}, 'unknown')`,
      providerId: sql<string>`coalesce(${messages.providerId}, 'unknown')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)
    .where(sql`${messages.role} = 'assistant'`)
    .groupBy(messages.modelId, messages.providerId)
    .all()

  return results
}

export function getTotalCost(): { totalCost: number; totalMessages: number; totalTokensIn: number; totalTokensOut: number } {
  const db = getDatabase()

  const result = db
    .select({
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`,
      totalMessages: sql<number>`count(*)`,
      totalTokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      totalTokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`
    })
    .from(messages)
    .get()

  return result ?? { totalCost: 0, totalMessages: 0, totalTokensIn: 0, totalTokensOut: 0 }
}
