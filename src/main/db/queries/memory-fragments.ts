import { eq, asc, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { memoryFragments } from '../schema'

export function getAllMemoryFragments() {
  const db = getDatabase()
  return db.select().from(memoryFragments).orderBy(asc(memoryFragments.sortOrder)).all()
}

export function getActiveMemoryFragments() {
  const db = getDatabase()
  return db
    .select()
    .from(memoryFragments)
    .where(eq(memoryFragments.isActive, true))
    .orderBy(asc(memoryFragments.sortOrder))
    .all()
}

export function createMemoryFragment(content: string, isActive = true) {
  const db = getDatabase()
  const now = new Date()

  // Get next sort order
  const maxResult = db
    .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
    .from(memoryFragments)
    .get()
  const sortOrder = (maxResult?.maxOrder ?? -1) + 1

  const id = nanoid()
  db.insert(memoryFragments)
    .values({ id, content, isActive, sortOrder, createdAt: now, updatedAt: now })
    .run()

  return db.select().from(memoryFragments).where(eq(memoryFragments.id, id)).get()!
}

export function updateMemoryFragment(id: string, updates: { content?: string; isActive?: boolean }) {
  const db = getDatabase()
  const now = new Date()

  db.update(memoryFragments)
    .set({ ...updates, updatedAt: now })
    .where(eq(memoryFragments.id, id))
    .run()

  return db.select().from(memoryFragments).where(eq(memoryFragments.id, id)).get()
}

export function deleteMemoryFragment(id: string) {
  const db = getDatabase()
  db.delete(memoryFragments).where(eq(memoryFragments.id, id)).run()
}

export function toggleMemoryFragment(id: string) {
  const db = getDatabase()
  const now = new Date()

  db.run(sql`UPDATE memory_fragments SET is_active = NOT is_active, updated_at = ${Math.floor(now.getTime() / 1000)} WHERE id = ${id}`)

  return db.select().from(memoryFragments).where(eq(memoryFragments.id, id)).get()
}

export function reorderMemoryFragments(orderedIds: string[]) {
  const db = getDatabase()
  const now = new Date()

  for (let i = 0; i < orderedIds.length; i++) {
    db.update(memoryFragments)
      .set({ sortOrder: i, updatedAt: now })
      .where(eq(memoryFragments.id, orderedIds[i]))
      .run()
  }
}

/**
 * Builds the <user-memory> block from active fragments.
 * Returns null if no active fragments.
 */
export function buildMemoryBlock(): string | null {
  const fragments = getActiveMemoryFragments()
  if (fragments.length === 0) return null

  const joined = fragments.map(f => f.content).join('\n')
  return `<user-memory>\n${joined}\n</user-memory>`
}
