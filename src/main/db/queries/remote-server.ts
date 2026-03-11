import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { remoteSessions, settings } from '../schema'

// ── Config (key-value in settings table) ────────────────────

const CONFIG_PREFIX = 'multi-llm:remote-server:'

export function getServerConfig(): Record<string, string> {
  const db = getDatabase()
  const rows = db
    .select()
    .from(settings)
    .all()
    .filter((r) => r.key.startsWith(CONFIG_PREFIX))

  const config: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.replace(CONFIG_PREFIX, '')
    if (row.value) config[key] = row.value
  }
  return config
}

export function setServerConfig(key: string, value: string): void {
  const db = getDatabase()
  const fullKey = CONFIG_PREFIX + key
  db.insert(settings)
    .values({ key: fullKey, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() }
    })
    .run()
}

export function deleteServerConfig(key: string): void {
  const db = getDatabase()
  db.delete(settings)
    .where(eq(settings.key, CONFIG_PREFIX + key))
    .run()
}

// ── WebSocket Sessions ────────────────────────────────────

export function getActiveWebSocketSession() {
  const db = getDatabase()
  return db
    .select()
    .from(remoteSessions)
    .where(
      and(
        eq(remoteSessions.isActive, true),
        eq(remoteSessions.sessionType, 'websocket')
      )
    )
    .get()
}

export function createWebSocketSession(data: {
  conversationId?: string
  wsClientFingerprint?: string
  wsSessionToken?: string
  wsIpAddress?: string
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(remoteSessions)
    .values({
      id,
      sessionType: 'websocket',
      isActive: true,
      conversationId: data.conversationId ?? null,
      wsClientFingerprint: data.wsClientFingerprint ?? null,
      wsSessionToken: data.wsSessionToken ?? null,
      wsIpAddress: data.wsIpAddress ?? null,
      createdAt: now
    })
    .run()

  return db.select().from(remoteSessions).where(eq(remoteSessions.id, id)).get()!
}

export function updateWebSocketSession(
  id: string,
  data: {
    pairedAt?: Date | null
    lastActivity?: Date | null
    conversationId?: string | null
    wsClientFingerprint?: string | null
    wsSessionToken?: string | null
    wsIpAddress?: string | null
  }
) {
  const db = getDatabase()
  db.update(remoteSessions)
    .set(data)
    .where(eq(remoteSessions.id, id))
    .run()

  return db.select().from(remoteSessions).where(eq(remoteSessions.id, id)).get()
}

export function deactivateWebSocketSessions(): void {
  const db = getDatabase()
  // Deactivate all websocket sessions
  const activeSessions = db
    .select()
    .from(remoteSessions)
    .where(
      and(
        eq(remoteSessions.isActive, true),
        eq(remoteSessions.sessionType, 'websocket')
      )
    )
    .all()

  for (const session of activeSessions) {
    db.update(remoteSessions)
      .set({ isActive: false })
      .where(eq(remoteSessions.id, session.id))
      .run()
  }
}

export function touchWebSocketActivity(id: string): void {
  const db = getDatabase()
  db.update(remoteSessions)
    .set({ lastActivity: new Date() })
    .where(eq(remoteSessions.id, id))
    .run()
}
