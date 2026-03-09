import { ipcMain } from 'electron'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  getCredentialKey,
  isEncryptionAvailable
} from '../services/credential.service'
import { PROVIDERS, MODELS } from '../llm/registry'

const setApiKeySchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().min(1)
})

const validateApiKeySchema = z.object({
  providerId: z.string().min(1),
  apiKey: z.string().min(1)
})

export function registerProvidersIpc(): void {
  // ── List providers with configuration status ────────
  ipcMain.handle('providers:list', async () => {
    const db = getDatabase()
    return PROVIDERS.map(p => {
      let isConfigured = false
      if (!p.requiresApiKey) {
        isConfigured = true // Local providers don't need keys
      } else {
        const key = getCredentialKey(p.id)
        const result = db.select().from(settings).where(eq(settings.key, key)).get()
        isConfigured = !!result?.value
      }
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        description: p.description,
        icon: p.icon,
        requiresApiKey: p.requiresApiKey,
        isConfigured,
        isEnabled: true
      }
    })
  })

  // ── List models (optionally filtered by provider) ───
  ipcMain.handle('providers:models', async (_event, providerId?: string) => {
    if (providerId) {
      return MODELS.filter(m => m.providerId === providerId)
    }
    return MODELS
  })

  // ── Set API Key ─────────────────────────────────────
  ipcMain.handle('providers:setApiKey', async (_event, providerId: string, apiKey: string) => {
    const parsed = setApiKeySchema.safeParse({ providerId, apiKey })
    if (!parsed.success) throw new Error('Invalid payload')

    if (!isEncryptionAvailable()) {
      throw new Error('Encryption not available — cannot store API keys securely')
    }

    const db = getDatabase()
    const encrypted = encryptApiKey(parsed.data.apiKey)
    const key = getCredentialKey(parsed.data.providerId)

    db.insert(settings)
      .values({ key, value: encrypted, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: encrypted, updatedAt: new Date() }
      })
      .run()
  })

  ipcMain.handle('providers:validateApiKey', async (_event, providerId: string, apiKey: string) => {
    const parsed = validateApiKeySchema.safeParse({ providerId, apiKey })
    if (!parsed.success) return false

    // TODO: Actual validation by making a test API call per provider
    // For now, just check the key is non-empty and looks valid
    const key = parsed.data.apiKey
    if (key.length < 10) return false
    return true
  })

  ipcMain.handle('providers:getApiKeyMasked', async (_event, providerId: string) => {
    if (!providerId) return null

    const db = getDatabase()
    const key = getCredentialKey(providerId)
    const result = db.select().from(settings).where(eq(settings.key, key)).get()

    if (!result?.value) return null

    try {
      const decrypted = decryptApiKey(result.value)
      return maskApiKey(decrypted)
    } catch {
      return null
    }
  })

  ipcMain.handle('providers:hasApiKey', async (_event, providerId: string) => {
    if (!providerId) return false

    const db = getDatabase()
    const key = getCredentialKey(providerId)
    const result = db.select().from(settings).where(eq(settings.key, key)).get()

    return !!result?.value
  })

  console.log('[IPC] Providers handlers registered')
}

/**
 * Retrieves the decrypted API key for a provider.
 * This is used internally by the main process only — NEVER sent to renderer.
 */
export function getApiKeyForProvider(providerId: string): string | null {
  const db = getDatabase()
  const key = getCredentialKey(providerId)
  const result = db.select().from(settings).where(eq(settings.key, key)).get()

  if (!result?.value) return null

  try {
    return decryptApiKey(result.value)
  } catch {
    return null
  }
}
