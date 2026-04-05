import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { llmCosts } from '../schema'

export type LlmCostType = 'compact' | 'episode' | 'summary' | 'optimizer' | 'image' | 'skills' | 'live_memory' | 'oneiric'

export interface CreateLlmCostParams {
  type: LlmCostType
  conversationId?: string
  modelId: string
  providerId: string
  tokensIn: number
  tokensOut: number
  cost: number
  metadata?: Record<string, unknown>
}

export function createLlmCost(params: CreateLlmCostParams): string {
  const db = getDatabase()
  const id = nanoid()
  const createdAt = new Date()

  db.insert(llmCosts)
    .values({
      id,
      type: params.type,
      conversationId: params.conversationId ?? null,
      modelId: params.modelId,
      providerId: params.providerId,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      cost: params.cost,
      metadata: params.metadata ?? null,
      createdAt
    })
    .run()

  return id
}

export function getTotalLlmCosts(days?: number): { totalCost: number; totalTokensIn: number; totalTokensOut: number } {
  const db = getDatabase()
  const sinceTimestamp = days && days > 0
    ? Math.floor((Date.now() - days * 86400000) / 1000)
    : null

  const timeFilter = sinceTimestamp
    ? sql`WHERE ${llmCosts.createdAt} >= ${sinceTimestamp}`
    : sql``

  const result = db.get<{ totalCost: number; totalTokensIn: number; totalTokensOut: number }>(sql`
    SELECT
      coalesce(sum(${llmCosts.cost}), 0) as totalCost,
      coalesce(sum(${llmCosts.tokensIn}), 0) as totalTokensIn,
      coalesce(sum(${llmCosts.tokensOut}), 0) as totalTokensOut
    FROM ${llmCosts}
    ${timeFilter}
  `)

  return result ?? { totalCost: 0, totalTokensIn: 0, totalTokensOut: 0 }
}
