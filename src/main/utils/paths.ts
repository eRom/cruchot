import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

/**
 * Retourne le chemin du dossier de donnees de l'application.
 * Cree le dossier s'il n'existe pas.
 */
export function getAppDataPath(): string {
  const appData = app.getPath('userData')
  return appData
}

/**
 * Retourne le chemin du fichier de base de donnees SQLite.
 * Cree le dossier db/ s'il n'existe pas.
 */
export function getDbPath(): string {
  const dbDir = join(app.getPath('userData'), 'db')
  mkdirSync(dbDir, { recursive: true })
  return join(dbDir, 'main.db')
}

/**
 * Retourne le chemin du dossier d'attachments.
 * Cree le dossier s'il n'existe pas.
 */
export function getAttachmentsPath(): string {
  const dir = join(app.getPath('userData'), 'attachments')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Retourne le chemin du dossier d'images generees.
 * Cree le dossier s'il n'existe pas.
 */
export function getImagesPath(): string {
  const dir = join(app.getPath('userData'), 'images')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Retourne le chemin du dossier de recordings VCR.
 * Cree le dossier s'il n'existe pas.
 */
export function getVcrRecordingsPath(): string {
  const dir = join(app.getPath('userData'), 'vcr-recordings')
  mkdirSync(dir, { recursive: true })
  return dir
}
