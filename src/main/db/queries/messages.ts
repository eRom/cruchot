import { eq, asc } from 'drizzle-orm'
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

  db.insert(messages)
    .values({
      id,
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      parentMessageId: params.parentMessageId,
      modelId: params.modelId,
      providerId: params.providerId,
      tokensIn: params.tokensIn,
      tokensOut: params.tokensOut,
      cost: params.cost,
      responseTimeMs: params.responseTimeMs,
      createdAt: new Date()
    })
    .run()

  return db.select().from(messages).where(eq(messages.id, id)).get()!
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
