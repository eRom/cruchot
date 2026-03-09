import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { conversations } from '../schema'

export function getAllConversations() {
  const db = getDatabase()
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .all()
}

export function getConversation(id: string) {
  const db = getDatabase()
  return db.select().from(conversations).where(eq(conversations.id, id)).get()
}

export function createConversation(title?: string) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(conversations)
    .values({
      id,
      title: title || 'Nouvelle conversation',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getConversation(id)!
}

export function renameConversation(id: string, title: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function updateConversationModel(id: string, modelId: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ modelId, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function touchConversation(id: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function deleteConversation(id: string) {
  const db = getDatabase()
  // Messages are cascade-deleted via FK or we delete them explicitly
  db.delete(conversations).where(eq(conversations.id, id)).run()
}
