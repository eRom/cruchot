import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import crypto from 'node:crypto'
import { getDatabase } from '../index'
import { meetSessions, meetCosts } from '../schema'

// ── Invite Code ──────────────────────────────────────────

const SAFE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const INVITE_TTL_MS = 15 * 60 * 1000

export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  return Array.from(bytes)
    .map((b) => SAFE_ALPHABET[b % SAFE_ALPHABET.length])
    .join('')
}

// ── Sessions ─────────────────────────────────────────────

export function createMeetSession(data: {
  conversationId: string
  hostName: string
  guestName: string
}): { id: string; inviteCode: string; inviteExpiresAt: Date } {
  const db = getDatabase()
  const id = nanoid()
  const inviteCode = generateInviteCode()
  const now = new Date()
  const inviteExpiresAt = new Date(now.getTime() + INVITE_TTL_MS)

  db.insert(meetSessions)
    .values({
      id,
      conversationId: data.conversationId,
      hostName: data.hostName,
      guestName: data.guestName,
      inviteCode,
      inviteExpiresAt,
      status: 'waiting',
      guestCanLlm: false,
      guestAutoApprove: false,
      guestVisibility: 'response-only',
      createdAt: now
    })
    .run()

  return { id, inviteCode, inviteExpiresAt }
}

export function getMeetSessionByInviteCode(code: string) {
  const db = getDatabase()
  return db
    .select()
    .from(meetSessions)
    .where(
      and(
        eq(meetSessions.inviteCode, code),
        eq(meetSessions.status, 'waiting')
      )
    )
    .get()
}

export function getMeetSessionById(id: string) {
  const db = getDatabase()
  return db.select().from(meetSessions).where(eq(meetSessions.id, id)).get()
}

export function getActiveMeetSession() {
  const db = getDatabase()
  return db
    .select()
    .from(meetSessions)
    .where(eq(meetSessions.status, 'connected'))
    .get()
}

export function updateMeetSession(
  id: string,
  data: Partial<{
    status: 'waiting' | 'connected' | 'ended'
    guestCanLlm: boolean
    guestAutoApprove: boolean
    guestVisibility: 'response-only' | 'full'
    startedAt: Date
    endedAt: Date
  }>
) {
  const db = getDatabase()
  db.update(meetSessions).set(data).where(eq(meetSessions.id, id)).run()
  return db.select().from(meetSessions).where(eq(meetSessions.id, id)).get()
}

export function endMeetSession(id: string) {
  return updateMeetSession(id, { status: 'ended', endedAt: new Date() })
}

// ── Costs ────────────────────────────────────────────────

export function addMeetCost(data: {
  meetSessionId: string
  messageId: string
  sender: 'host' | 'guest'
  providerId: string
  modelId: string
  tokensIn: number
  tokensOut: number
  cost: number
}) {
  const db = getDatabase()
  const id = nanoid()
  db.insert(meetCosts)
    .values({ id, ...data, createdAt: new Date() })
    .run()
}

export function getMeetSessionCosts(meetSessionId: string) {
  const db = getDatabase()
  return db
    .select()
    .from(meetCosts)
    .where(eq(meetCosts.meetSessionId, meetSessionId))
    .all()
}
