import Database from 'better-sqlite3'
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import * as schema from './schema'

let db: BetterSQLite3Database<typeof schema> | null = null
let sqlite: Database.Database | null = null

/**
 * Initialise la connexion SQLite et retourne l'instance Drizzle.
 * - Cree le dossier de la DB si necessaire
 * - Active WAL mode, foreign_keys, busy_timeout
 * - Retourne une instance singleton
 */
export function initDatabase(dbPath: string): BetterSQLite3Database<typeof schema> {
  if (db) return db

  // Creer le dossier parent si necessaire
  mkdirSync(dirname(dbPath), { recursive: true })

  // Ouvrir la connexion SQLite (synchrone)
  sqlite = new Database(dbPath)

  // Pragmas pour performance et integrite
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  // Creer l'instance Drizzle
  db = drizzle(sqlite, { schema })

  return db
}

/**
 * Retourne l'instance Drizzle existante.
 * Leve une erreur si la DB n'est pas initialisee.
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

/**
 * Retourne l'instance SQLite brute (pour les migrations ou operations speciales).
 */
export function getSqliteDatabase(): Database.Database {
  if (!sqlite) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return sqlite
}

/**
 * Ferme la connexion SQLite proprement.
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}
