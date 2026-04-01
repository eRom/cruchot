import crypto from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { getDatabase } from '../index'
import {
  bardas,
  roles,
  slashCommands,
  prompts,
  memoryFragments,
  libraries,
  librarySources,
  libraryChunks,
  mcpServers,
  skills
} from '../schema'

// ── Bardas CRUD ─────────────────────────────────────────

export function createBarda(data: {
  namespace: string
  name: string
  description?: string
  version?: string
  author?: string
  rolesCount?: number
  commandsCount?: number
  promptsCount?: number
  fragmentsCount?: number
  librariesCount?: number
  mcpServersCount?: number
}) {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date()

  db.insert(bardas).values({
    id,
    namespace: data.namespace,
    name: data.name,
    description: data.description ?? null,
    version: data.version ?? null,
    author: data.author ?? null,
    isEnabled: true,
    rolesCount: data.rolesCount ?? 0,
    commandsCount: data.commandsCount ?? 0,
    promptsCount: data.promptsCount ?? 0,
    fragmentsCount: data.fragmentsCount ?? 0,
    librariesCount: data.librariesCount ?? 0,
    mcpServersCount: data.mcpServersCount ?? 0,
    createdAt: now,
    updatedAt: now
  }).run()

  return getBardaById(id)!
}

export function listBardas() {
  const db = getDatabase()
  return db.select().from(bardas).orderBy(bardas.name).all()
}

export function getBardaById(id: string) {
  const db = getDatabase()
  return db.select().from(bardas).where(eq(bardas.id, id)).get() ?? null
}

export function getBardaByNamespace(namespace: string) {
  const db = getDatabase()
  return db.select().from(bardas).where(eq(bardas.namespace, namespace)).get() ?? null
}

export function toggleBarda(id: string, isEnabled: boolean) {
  const db = getDatabase()
  db.update(bardas)
    .set({ isEnabled, updatedAt: new Date() })
    .where(eq(bardas.id, id))
    .run()
}

export function deleteBarda(id: string) {
  const db = getDatabase()
  db.delete(bardas).where(eq(bardas.id, id)).run()
}

/**
 * Supprime toutes les ressources associees a un namespace Barda.
 * Ordre FK strict : enfants d'abord.
 */
export function deleteResourcesByNamespace(namespace: string) {
  const db = getDatabase()

  // 1. library_chunks WHERE library_id IN (SELECT id FROM libraries WHERE namespace = ?)
  db.run(
    sql`DELETE FROM library_chunks WHERE library_id IN (SELECT id FROM libraries WHERE namespace = ${namespace})`
  )

  // 2. library_sources WHERE library_id IN (SELECT id FROM libraries WHERE namespace = ?)
  db.run(
    sql`DELETE FROM library_sources WHERE library_id IN (SELECT id FROM libraries WHERE namespace = ${namespace})`
  )

  // 3. libraries
  db.delete(libraries).where(eq(libraries.namespace, namespace)).run()

  // 4. slash_commands
  db.delete(slashCommands).where(eq(slashCommands.namespace, namespace)).run()

  // 5. roles
  db.delete(roles).where(eq(roles.namespace, namespace)).run()

  // 6. prompts
  db.delete(prompts).where(eq(prompts.namespace, namespace)).run()

  // 7. memory_fragments
  db.delete(memoryFragments).where(eq(memoryFragments.namespace, namespace)).run()

  // 8. mcp_servers
  db.delete(mcpServers).where(eq(mcpServers.namespace, namespace)).run()

  // 9. Skills
  db.delete(skills).where(eq(skills.namespace, namespace)).run()
}

export function countActiveFragments(): number {
  const db = getDatabase()
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(memoryFragments)
    .where(eq(memoryFragments.isActive, true))
    .get()
  return result?.count ?? 0
}
