import { eq, desc, like } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { prompts } from '../schema'

export function getAllPrompts() {
  const db = getDatabase()
  return db
    .select()
    .from(prompts)
    .orderBy(desc(prompts.updatedAt))
    .all()
}

export function getPrompt(id: string) {
  const db = getDatabase()
  return db.select().from(prompts).where(eq(prompts.id, id)).get()
}

export function getPromptsByCategory(category: string) {
  const db = getDatabase()
  return db
    .select()
    .from(prompts)
    .where(eq(prompts.category, category))
    .orderBy(desc(prompts.updatedAt))
    .all()
}

export function getPromptsByType(type: 'complet' | 'complement' | 'system') {
  const db = getDatabase()
  return db
    .select()
    .from(prompts)
    .where(eq(prompts.type, type))
    .orderBy(desc(prompts.updatedAt))
    .all()
}

export function searchPrompts(query: string) {
  const db = getDatabase()
  return db
    .select()
    .from(prompts)
    .where(like(prompts.title, `%${query}%`))
    .orderBy(desc(prompts.updatedAt))
    .all()
}

export function createPrompt(data: {
  title: string
  content: string
  category?: string
  tags?: string[]
  type: 'complet' | 'complement' | 'system'
  variables?: Array<{ name: string; description?: string }>
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  const row = {
    id,
    title: data.title,
    content: data.content,
    category: data.category ?? null,
    tags: data.tags ?? null,
    type: data.type,
    variables: data.variables ?? null,
    createdAt: now,
    updatedAt: now
  }

  db.insert(prompts).values(row).run()

  return row
}

export function updatePrompt(
  id: string,
  data: {
    title?: string
    content?: string
    category?: string | null
    tags?: string[] | null
    type?: 'complet' | 'complement' | 'system'
    variables?: Array<{ name: string; description?: string }> | null
  }
) {
  const db = getDatabase()
  db.update(prompts)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(prompts.id, id))
    .run()

  return getPrompt(id)
}

export function deletePrompt(id: string) {
  const db = getDatabase()
  db.delete(prompts).where(eq(prompts.id, id)).run()
}
