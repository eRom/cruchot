import { eq, desc, and, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { slashCommands } from '../schema'

export function getAllSlashCommands() {
  const db = getDatabase()
  return db
    .select()
    .from(slashCommands)
    .orderBy(slashCommands.sortOrder, desc(slashCommands.updatedAt))
    .all()
}

export function getSlashCommand(id: string) {
  const db = getDatabase()
  return db.select().from(slashCommands).where(eq(slashCommands.id, id)).get()
}

export function getSlashCommandByName(name: string, projectId?: string | null) {
  const db = getDatabase()
  if (projectId) {
    // Try project-scoped first
    const projectCmd = db
      .select()
      .from(slashCommands)
      .where(and(eq(slashCommands.name, name), eq(slashCommands.projectId, projectId)))
      .get()
    if (projectCmd) return projectCmd
  }
  // Fallback to global
  return db
    .select()
    .from(slashCommands)
    .where(and(eq(slashCommands.name, name), isNull(slashCommands.projectId)))
    .get()
}

export function createSlashCommand(data: {
  name: string
  description: string
  prompt: string
  category?: string | null
  projectId?: string | null
  isBuiltin?: boolean
  sortOrder?: number
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(slashCommands)
    .values({
      id,
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      category: data.category ?? null,
      projectId: data.projectId ?? null,
      isBuiltin: data.isBuiltin ?? false,
      sortOrder: data.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getSlashCommand(id)!
}

export function updateSlashCommand(
  id: string,
  data: {
    name?: string
    description?: string
    prompt?: string
    category?: string | null
    projectId?: string | null
    sortOrder?: number
  }
) {
  const db = getDatabase()
  db.update(slashCommands)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(slashCommands.id, id))
    .run()

  return getSlashCommand(id)
}

export function deleteSlashCommand(id: string) {
  const db = getDatabase()
  db.delete(slashCommands).where(eq(slashCommands.id, id)).run()
}

export function reorderSlashCommands(orderedIds: string[]) {
  const db = getDatabase()
  const now = new Date()
  for (let i = 0; i < orderedIds.length; i++) {
    db.update(slashCommands)
      .set({ sortOrder: i, updatedAt: now })
      .where(eq(slashCommands.id, orderedIds[i]))
      .run()
  }
}

/**
 * Upsert builtin commands. If a builtin exists and has NOT been modified
 * by the user (prompt matches original), update it. Otherwise leave it.
 */
export function seedBuiltinCommands(
  builtins: Array<{ name: string; description: string; prompt: string; category?: string }>
) {
  const db = getDatabase()
  const now = new Date()

  for (const b of builtins) {
    const existing = db
      .select()
      .from(slashCommands)
      .where(and(eq(slashCommands.name, b.name), eq(slashCommands.isBuiltin, true)))
      .get()

    if (!existing) {
      // Insert new builtin
      db.insert(slashCommands)
        .values({
          id: nanoid(),
          name: b.name,
          description: b.description,
          prompt: b.prompt,
          category: b.category ?? null,
          projectId: null,
          isBuiltin: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now
        })
        .run()
    }
    // If exists, don't update — user may have customized it
  }
}
