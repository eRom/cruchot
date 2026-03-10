import { sql } from 'drizzle-orm'
import { getDatabase } from '../index'
import { messages, conversations, projects, ttsUsage } from '../schema'

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

export interface ProjectStat {
  projectId: string | null
  projectName: string
  projectColor: string | null
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
  conversationsCount: number
}

export interface GlobalStats {
  totalCost: number
  totalMessages: number
  totalTokensIn: number
  totalTokensOut: number
  totalResponseTimeMs: number
  totalConversations: number
  totalTtsCost: number
}

function buildWhereClause(days?: number, tableRef = messages): ReturnType<typeof sql> | undefined {
  if (!days || days <= 0) return undefined
  const sinceTimestamp = Math.floor((Date.now() - days * 86400000) / 1000)
  return sql`${tableRef.createdAt} >= ${sinceTimestamp}`
}

export function getDailyStats(days: number = 30): DailyStat[] {
  const db = getDatabase()
  const whereClause = buildWhereClause(days)

  const query = db
    .select({
      date: sql<string>`date(${messages.createdAt}, 'unixepoch')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)

  if (whereClause) {
    query.where(whereClause)
  }

  return query
    .groupBy(sql`date(${messages.createdAt}, 'unixepoch')`)
    .orderBy(sql`date(${messages.createdAt}, 'unixepoch') ASC`)
    .all()
}

export function getProviderStats(days?: number): ProviderStat[] {
  const db = getDatabase()
  const whereClause = buildWhereClause(days)

  const query = db
    .select({
      providerId: sql<string>`coalesce(${messages.providerId}, 'unknown')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)

  if (whereClause) {
    query.where(sql`${messages.role} = 'assistant' AND ${whereClause}`)
  } else {
    query.where(sql`${messages.role} = 'assistant'`)
  }

  return query.groupBy(messages.providerId).all()
}

export function getModelStats(days?: number): ModelStat[] {
  const db = getDatabase()
  const whereClause = buildWhereClause(days)

  const query = db
    .select({
      modelId: sql<string>`coalesce(${messages.modelId}, 'unknown')`,
      providerId: sql<string>`coalesce(${messages.providerId}, 'unknown')`,
      messagesCount: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${messages.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${messages.tokensOut}), 0)`,
      totalCost: sql<number>`coalesce(sum(${messages.cost}), 0)`
    })
    .from(messages)

  if (whereClause) {
    query.where(sql`${messages.role} = 'assistant' AND ${whereClause}`)
  } else {
    query.where(sql`${messages.role} = 'assistant'`)
  }

  return query.groupBy(messages.modelId, messages.providerId).all()
}

export function getProjectStats(days?: number): ProjectStat[] {
  const db = getDatabase()
  const sinceTimestamp = days && days > 0
    ? Math.floor((Date.now() - days * 86400000) / 1000)
    : null

  const timeFilter = sinceTimestamp
    ? sql`AND ${messages.createdAt} >= ${sinceTimestamp}`
    : sql``

  const results = db.all<ProjectStat>(sql`
    SELECT
      ${conversations.projectId} as projectId,
      coalesce(${projects.name}, 'Sans projet') as projectName,
      ${projects.color} as projectColor,
      count(*) as messagesCount,
      coalesce(sum(${messages.tokensIn}), 0) as tokensIn,
      coalesce(sum(${messages.tokensOut}), 0) as tokensOut,
      coalesce(sum(${messages.cost}), 0) as totalCost,
      count(distinct ${messages.conversationId}) as conversationsCount
    FROM ${messages}
    INNER JOIN ${conversations} ON ${messages.conversationId} = ${conversations.id}
    LEFT JOIN ${projects} ON ${conversations.projectId} = ${projects.id}
    WHERE ${messages.role} = 'assistant' ${timeFilter}
    GROUP BY ${conversations.projectId}
    ORDER BY totalCost DESC
  `)

  return results
}

export function getGlobalStats(days?: number): GlobalStats {
  const db = getDatabase()
  const sinceTimestamp = days && days > 0
    ? Math.floor((Date.now() - days * 86400000) / 1000)
    : null

  const timeFilter = sinceTimestamp
    ? sql`WHERE ${messages.createdAt} >= ${sinceTimestamp}`
    : sql``

  const ttsTimeFilter = sinceTimestamp
    ? sql`WHERE ${ttsUsage.createdAt} >= ${sinceTimestamp}`
    : sql``

  const result = db.get<GlobalStats>(sql`
    SELECT
      coalesce(sum(${messages.cost}), 0) as totalCost,
      count(*) as totalMessages,
      coalesce(sum(${messages.tokensIn}), 0) as totalTokensIn,
      coalesce(sum(${messages.tokensOut}), 0) as totalTokensOut,
      coalesce(sum(${messages.responseTimeMs}), 0) as totalResponseTimeMs,
      count(distinct ${messages.conversationId}) as totalConversations,
      (SELECT coalesce(sum(${ttsUsage.cost}), 0) FROM ${ttsUsage} ${ttsTimeFilter}) as totalTtsCost
    FROM ${messages}
    ${timeFilter}
  `)

  return result ?? {
    totalCost: 0,
    totalMessages: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalResponseTimeMs: 0,
    totalConversations: 0,
    totalTtsCost: 0
  }
}
