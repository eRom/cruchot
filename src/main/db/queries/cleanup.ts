import { sql } from 'drizzle-orm'
import { getDatabase } from '../index'
import {
  attachments,
  images,
  messages,
  remoteSessions,
  conversations,
  scheduledTasks,
  mcpServers,
  slashCommands,
  projects,
  roles,
  prompts,
  memoryFragments,
  statistics,
  ttsUsage,
  settings,
  vectorSyncState,
  libraryChunks,
  librarySources,
  libraries,
  arenaMatches,
  bardas
} from '../schema'

/**
 * Zone orange : supprime conversations, projets et images generees.
 * Conserve roles, prompts, MCP, memoire, parametres, cles API.
 */
export function deleteConversationsProjectsImages(): { imagePaths: string[] } {
  const db = getDatabase()

  // Recuperer les paths des images avant suppression
  const imageRows = db.select({ path: images.path }).from(images).all()
  const imagePaths = imageRows.map((r) => r.path)

  // Ordre FK : enfants d'abord
  db.delete(attachments).run()
  db.delete(images).run()
  db.delete(arenaMatches).run()
  db.delete(remoteSessions).run()
  db.delete(vectorSyncState).run()
  db.delete(messages).run()
  db.delete(bardas).run()
  db.delete(scheduledTasks).run()
  db.delete(mcpServers).run()
  db.delete(slashCommands).run()
  // Libraries (chunks → sources → libraries)
  db.delete(libraryChunks).run()
  db.delete(librarySources).run()
  db.delete(libraries).run()
  db.delete(conversations).run()
  db.delete(projects).run()

  return { imagePaths }
}

/**
 * Zone rouge : factory reset — supprime TOUTES les donnees.
 * Seule la structure DB est conservee.
 */
export function factoryResetDatabase(): { imagePaths: string[] } {
  const db = getDatabase()

  // Recuperer les paths des images avant suppression
  const imageRows = db.select({ path: images.path }).from(images).all()
  const imagePaths = imageRows.map((r) => r.path)

  // Ordre FK strict : enfants → parents → standalone
  db.delete(attachments).run()
  db.delete(images).run()
  db.delete(arenaMatches).run()
  db.delete(remoteSessions).run()
  db.delete(vectorSyncState).run()
  db.delete(messages).run()
  db.delete(conversations).run()
  db.delete(bardas).run()
  db.delete(scheduledTasks).run()
  db.delete(mcpServers).run()
  db.delete(slashCommands).run()
  // Libraries (chunks → sources → libraries)
  db.delete(libraryChunks).run()
  db.delete(librarySources).run()
  db.delete(libraries).run()
  db.delete(projects).run()
  db.delete(roles).run()
  db.delete(prompts).run()
  db.delete(memoryFragments).run()
  db.delete(statistics).run()
  db.delete(ttsUsage).run()
  db.delete(settings).run()

  return { imagePaths }
}
