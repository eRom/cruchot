import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { projects } from '../schema'

export function getAllProjects() {
  const db = getDatabase()
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .all()
}

export function getProject(id: string) {
  const db = getDatabase()
  return db.select().from(projects).where(eq(projects.id, id)).get()
}

export function createProject(data: {
  name: string
  description?: string
  systemPrompt?: string
  defaultModelId?: string
  color?: string
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(projects)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      systemPrompt: data.systemPrompt ?? null,
      defaultModelId: data.defaultModelId ?? null,
      color: data.color ?? null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getProject(id)!
}

export function updateProject(
  id: string,
  data: {
    name?: string
    description?: string | null
    systemPrompt?: string | null
    defaultModelId?: string | null
    color?: string | null
  }
) {
  const db = getDatabase()
  db.update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .run()

  return getProject(id)
}

export function deleteProject(id: string) {
  const db = getDatabase()
  db.delete(projects).where(eq(projects.id, id)).run()
}
