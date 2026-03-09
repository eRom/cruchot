import { eq, desc } from 'drizzle-orm'
import { getDatabase } from '../index'
import { images } from '../schema'

export function getAllImages() {
  const db = getDatabase()
  return db
    .select()
    .from(images)
    .orderBy(desc(images.createdAt))
    .all()
}

export function getImagesByConversation(conversationId: string) {
  const db = getDatabase()
  return db
    .select()
    .from(images)
    .where(eq(images.conversationId, conversationId))
    .orderBy(desc(images.createdAt))
    .all()
}

export function deleteImage(id: string) {
  const db = getDatabase()
  db.delete(images).where(eq(images.id, id)).run()
}
