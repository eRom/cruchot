import { eq, desc, isNull } from 'drizzle-orm'
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

export function createConversation(title?: string, projectId?: string) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(conversations)
    .values({
      id,
      title: title || 'Nouvelle conversation',
      projectId: projectId ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getConversation(id)!
}

export function getConversationsByProject(projectId: string | null) {
  const db = getDatabase()
  if (projectId === null) {
    // "Boite de reception" — conversations sans projet
    return db
      .select()
      .from(conversations)
      .where(isNull(conversations.projectId))
      .orderBy(desc(conversations.updatedAt))
      .all()
  }
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .orderBy(desc(conversations.updatedAt))
    .all()
}

export function setConversationProject(id: string, projectId: string | null) {
  const db = getDatabase()
  db.update(conversations)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
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

export function updateConversationRole(id: string, roleId: string | null) {
  const db = getDatabase()
  db.update(conversations)
    .set({ roleId, updatedAt: new Date() })
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

export function toggleFavorite(id: string, isFavorite: boolean) {
  const db = getDatabase()
  db.update(conversations)
    .set({ isFavorite, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
  return getConversation(id)
}

export function deleteAllConversations() {
  const db = getDatabase()
  db.delete(conversations).run()
}
