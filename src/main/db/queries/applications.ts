import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../index'
import { allowedApps } from '../schema'

// ── Allowed Apps CRUD ─────────────────────────────────────

export function listAllowedApps() {
  const db = getDatabase()
  return db.select().from(allowedApps).all()
}

export function listEnabledApps() {
  const db = getDatabase()
  return db.select().from(allowedApps).where(eq(allowedApps.isEnabled, true)).all()
}

export function getAllowedAppById(id: string) {
  const db = getDatabase()
  return db.select().from(allowedApps).where(eq(allowedApps.id, id)).get()
}

export function getAllowedAppByName(name: string) {
  const db = getDatabase()
  const all = db.select().from(allowedApps).where(eq(allowedApps.isEnabled, true)).all()
  const lower = name.toLowerCase()
  return all.find(a => a.name.toLowerCase() === lower) ?? null
}

export function createAllowedApp(data: {
  name: string
  path: string
  type: 'local' | 'web'
  description?: string
}) {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date()

  db.insert(allowedApps).values({
    id,
    name: data.name,
    path: data.path,
    type: data.type,
    description: data.description ?? null,
    isEnabled: true,
    createdAt: now,
    updatedAt: now
  }).run()

  return getAllowedAppById(id)!
}

export function updateAllowedApp(id: string, data: {
  name?: string
  path?: string
  type?: 'local' | 'web'
  description?: string | null
}) {
  const db = getDatabase()
  const now = new Date()

  db.update(allowedApps)
    .set({ ...data, updatedAt: now })
    .where(eq(allowedApps.id, id))
    .run()

  return getAllowedAppById(id)
}

export function toggleAllowedApp(id: string, isEnabled: boolean) {
  const db = getDatabase()
  db.update(allowedApps)
    .set({ isEnabled, updatedAt: new Date() })
    .where(eq(allowedApps.id, id))
    .run()
}

export function deleteAllowedApp(id: string) {
  const db = getDatabase()
  db.delete(allowedApps).where(eq(allowedApps.id, id)).run()
}
