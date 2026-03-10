import { sql } from 'drizzle-orm'
import { getDatabase } from '../index'
import { ttsUsage } from '../schema'

interface InsertTtsUsageParams {
  id: string
  messageId?: string
  provider: string
  model: string
  textLength: number
  cost: number
}

export function insertTtsUsage(params: InsertTtsUsageParams): void {
  const db = getDatabase()
  db.insert(ttsUsage)
    .values({
      id: params.id,
      messageId: params.messageId ?? null,
      provider: params.provider,
      model: params.model,
      textLength: params.textLength,
      cost: params.cost,
      createdAt: new Date()
    })
    .run()
}

export function getTtsCostTotal(days?: number): number {
  const db = getDatabase()

  if (days && days > 0) {
    const sinceTimestamp = Math.floor((Date.now() - days * 86400000) / 1000)
    const result = db.get<{ total: number }>(sql`
      SELECT coalesce(sum(${ttsUsage.cost}), 0) as total
      FROM ${ttsUsage}
      WHERE ${ttsUsage.createdAt} >= ${sinceTimestamp}
    `)
    return result?.total ?? 0
  }

  const result = db.get<{ total: number }>(sql`
    SELECT coalesce(sum(${ttsUsage.cost}), 0) as total
    FROM ${ttsUsage}
  `)
  return result?.total ?? 0
}
