import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { encryptApiKey, decryptApiKey } from './credential.service'

const INSTANCE_TOKEN_KEY = 'multi-llm:instance-token'

/**
 * Ensures an instance token (32 bytes) exists in the DB.
 * Creates one if missing, stores it encrypted via safeStorage.
 */
export function ensureInstanceToken(): void {
  const db = getDatabase()
  const existing = db.select().from(settings).where(eq(settings.key, INSTANCE_TOKEN_KEY)).get()

  if (existing?.value) {
    console.log('[InstanceToken] Token already exists')
    return
  }

  const token = crypto.randomBytes(32).toString('hex')
  const encrypted = encryptApiKey(token)

  db.insert(settings)
    .values({ key: INSTANCE_TOKEN_KEY, value: encrypted, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: encrypted, updatedAt: new Date() }
    })
    .run()

  console.log('[InstanceToken] New instance token created')
}

/**
 * Returns the instance token as a 32-byte Buffer.
 */
export function getInstanceToken(): Buffer {
  const db = getDatabase()
  const row = db.select().from(settings).where(eq(settings.key, INSTANCE_TOKEN_KEY)).get()

  if (!row?.value) {
    throw new Error('Instance token not found. Call ensureInstanceToken() first.')
  }

  const hex = decryptApiKey(row.value)
  return Buffer.from(hex, 'hex')
}

/**
 * Returns the instance token as a 64-char hex string (for clipboard copy).
 */
export function getInstanceTokenHex(): string {
  return getInstanceToken().toString('hex')
}
