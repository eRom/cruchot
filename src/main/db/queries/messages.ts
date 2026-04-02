import { eq, asc, desc, and, lt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { messages } from '../schema'

export interface CreateMessageParams {
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parentMessageId?: string
  modelId?: string
  providerId?: string
  tokensIn?: number
  tokensOut?: number
  cost?: number
  responseTimeMs?: number
  contentData?: Record<string, unknown>
}

export function getMessagesForConversation(conversationId: string) {
  const db = getDatabase()
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .all()
}

export function createMessage(params: CreateMessageParams) {
  const db = getDatabase()
  const id = nanoid()
  const createdAt = new Date()

  db.insert(messages)
    .values({
      id,
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      parentMessageId: params.parentMessageId ?? null,
      modelId: params.modelId ?? null,
      providerId: params.providerId ?? null,
      tokensIn: params.tokensIn ?? null,
      tokensOut: params.tokensOut ?? null,
      cost: params.cost ?? null,
      responseTimeMs: params.responseTimeMs ?? null,
      contentData: params.contentData ?? null,
      createdAt
    })
    .run()

  return {
    id,
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    parentMessageId: params.parentMessageId ?? null,
    modelId: params.modelId ?? null,
    providerId: params.providerId ?? null,
    tokensIn: params.tokensIn ?? null,
    tokensOut: params.tokensOut ?? null,
    cost: params.cost ?? null,
    responseTimeMs: params.responseTimeMs ?? null,
    contentData: params.contentData ?? null,
    createdAt
  }
}

export function updateMessage(id: string, updates: Partial<CreateMessageParams> & { content?: string }) {
  const db = getDatabase()
  db.update(messages)
    .set(updates)
    .where(eq(messages.id, id))
    .run()
}

export function deleteMessage(id: string) {
  const db = getDatabase()
  db.delete(messages).where(eq(messages.id, id)).run()
}

export function deleteMessagesForConversation(conversationId: string) {
  const db = getDatabase()
  db.delete(messages).where(eq(messages.conversationId, conversationId)).run()
}

export function deleteAllMessages() {
  const db = getDatabase()
  db.delete(messages).run()
}

// ── Pagination ────────────────────────────────────────────

export function getMessageCount(conversationId: string): number {
  const db = getDatabase()
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .get()
  return result?.count ?? 0
}

export interface MessagesPageResult {
  messages: ReturnType<typeof getMessagesForConversation>
  totalCount: number
  hasMore: boolean
}

export function getMessagesPage(
  conversationId: string,
  limit: number = 50,
  beforeDate?: Date
): MessagesPageResult {
  const db = getDatabase()
  const totalCount = getMessageCount(conversationId)

  const conditions = beforeDate
    ? and(
        eq(messages.conversationId, conversationId),
        lt(messages.createdAt, beforeDate)
      )
    : eq(messages.conversationId, conversationId)

  // Query newest-first with LIMIT, then reverse for chronological order
  const rows = db
    .select()
    .from(messages)
    .where(conditions)
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all()
    .reverse()

  return {
    messages: rows,
    totalCount,
    hasMore: beforeDate
      ? rows.length === limit
      : totalCount > limit
  }
}
