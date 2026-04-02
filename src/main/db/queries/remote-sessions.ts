import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { remoteSessions } from '../schema'

export function getActiveSession() {
  const db = getDatabase()
  return db
    .select()
    .from(remoteSessions)
    .where(eq(remoteSessions.isActive, true))
    .get()
}

export function getSession(id: string) {
  const db = getDatabase()
  return db.select().from(remoteSessions).where(eq(remoteSessions.id, id)).get()
}

export function createSession(data: {
  botUsername?: string
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  const row = {
    id,
    botUsername: data.botUsername ?? null,
    isActive: true,
    sessionType: 'telegram' as const,
    telegramChatId: null,
    pairedAt: null,
    lastActivity: null,
    conversationId: null,
    autoApproveRead: true,
    autoApproveWrite: false,
    autoApproveBash: false,
    autoApproveList: true,
    autoApproveMcp: false,
    wsClientFingerprint: null,
    wsSessionToken: null,
    wsIpAddress: null,
    createdAt: now
  }

  db.insert(remoteSessions).values(row).run()

  return row
}

export function updateSession(
  id: string,
  data: {
    telegramChatId?: string | null
    botUsername?: string | null
    pairedAt?: Date | null
    lastActivity?: Date | null
    isActive?: boolean
    conversationId?: string | null
  }
) {
  const db = getDatabase()
  db.update(remoteSessions)
    .set(data)
    .where(eq(remoteSessions.id, id))
    .run()

  return getSession(id)
}

export function deactivateSession(id: string) {
  const db = getDatabase()
  db.update(remoteSessions)
    .set({ isActive: false })
    .where(eq(remoteSessions.id, id))
    .run()
}

export function updateSessionAutoApprove(
  id: string,
  data: {
    autoApproveRead?: boolean
    autoApproveWrite?: boolean
    autoApproveBash?: boolean
    autoApproveList?: boolean
    autoApproveMcp?: boolean
  }
) {
  const db = getDatabase()
  db.update(remoteSessions)
    .set(data)
    .where(eq(remoteSessions.id, id))
    .run()

  return getSession(id)
}

export function touchSessionActivity(id: string) {
  const db = getDatabase()
  db.update(remoteSessions)
    .set({ lastActivity: new Date() })
    .where(eq(remoteSessions.id, id))
    .run()
}
