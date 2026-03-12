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
import {
  detectLocalProviders,
  getLMStudioModels,
  getOllamaModels,
  setLmStudioBaseUrl,
  getLmStudioBaseUrl,
  setOllamaBaseUrl,
  getOllamaBaseUrl
} from '../services/local-providers.service'

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
  // Includes dynamic LM Studio models when server is reachable
  ipcMain.handle('providers:models', async (_event, providerId?: string) => {
    const staticModels = providerId ? MODELS.filter(m => m.providerId === providerId) : [...MODELS]

    let allModels = staticModels

    // Attempt to fetch LM Studio models (non-blocking, silent fail)
    if (!providerId || providerId === 'lmstudio') {
      try {
        const lmModels = await getLMStudioModels()
        const dynamicModels = lmModels.map(m => ({
          id: m.id,
          providerId: 'lmstudio',
          name: m.id,
          displayName: m.id,
          type: 'text' as const,
          contextWindow: 0,
          inputPrice: 0,
          outputPrice: 0,
          supportsImages: false,
          supportsStreaming: true,
          supportsThinking: false
        }))
        allModels = [...allModels, ...dynamicModels]
      } catch {
        // LM Studio offline — skip
      }
    }

    // Attempt to fetch Ollama models (non-blocking, silent fail)
    if (!providerId || providerId === 'ollama') {
      try {
        const ollamaModels = await getOllamaModels()
        const dynamicModels = ollamaModels.map(m => ({
          id: m.name,
          providerId: 'ollama',
          name: m.name,
          displayName: m.name,
          type: 'text' as const,
          contextWindow: 0,
          inputPrice: 0,
          outputPrice: 0,
          supportsImages: false,
          supportsStreaming: true,
          supportsThinking: false
        }))
        allModels = [...allModels, ...dynamicModels]
      } catch {
        // Ollama offline — skip
      }
    }

    return allModels
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

  // ── Local Providers — detect, models, URL config, test ──

  ipcMain.handle('localProviders:detect', async () => {
    return detectLocalProviders()
  })

  ipcMain.handle('localProviders:models', async (_event, providerId: string) => {
    const parsed = z.string().min(1).safeParse(providerId)
    if (!parsed.success) throw new Error('Invalid providerId')

    if (parsed.data === 'lmstudio') {
      const lmModels = await getLMStudioModels()
      return lmModels.map(m => ({
        id: m.id,
        providerId: 'lmstudio',
        name: m.id,
        displayName: m.id,
        type: 'text' as const,
        contextWindow: 0,
        inputPrice: 0,
        outputPrice: 0,
        supportsImages: false,
        supportsStreaming: true,
        supportsThinking: false
      }))
    }

    if (parsed.data === 'ollama') {
      const ollamaModels = await getOllamaModels()
      return ollamaModels.map(m => ({
        id: m.name,
        providerId: 'ollama',
        name: m.name,
        displayName: m.name,
        type: 'text' as const,
        contextWindow: 0,
        inputPrice: 0,
        outputPrice: 0,
        supportsImages: false,
        supportsStreaming: true,
        supportsThinking: false
      }))
    }

    return []
  })

  const setBaseUrlSchema = z.object({
    providerId: z.string().min(1),
    baseUrl: z.string().url().startsWith('http')
  })

  ipcMain.handle('localProviders:setBaseUrl', async (_event, payload: unknown) => {
    const parsed = setBaseUrlSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload: ' + parsed.error.message)

    const cleanUrl = parsed.data.baseUrl.replace(/\/+$/, '')

    if (parsed.data.providerId === 'lmstudio') {
      setLmStudioBaseUrl(cleanUrl)
    } else if (parsed.data.providerId === 'ollama') {
      setOllamaBaseUrl(cleanUrl)
    }
  })

  const testConnectionSchema = z.object({
    providerId: z.string().min(1),
    baseUrl: z.string().url().startsWith('http').optional()
  })

  ipcMain.handle('localProviders:testConnection', async (_event, payload: unknown) => {
    const parsed = testConnectionSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload: ' + parsed.error.message)

    if (parsed.data.providerId === 'lmstudio') {
      const url = parsed.data.baseUrl?.replace(/\/+$/, '') ?? getLmStudioBaseUrl()
      try {
        const models = await getLMStudioModels(url)
        return {
          reachable: true,
          modelCount: models.length,
          models: models.map(m => ({
            id: m.id,
            providerId: 'lmstudio',
            name: m.id,
            displayName: m.id,
            type: 'text' as const,
            contextWindow: 0,
            inputPrice: 0,
            outputPrice: 0,
            supportsImages: false,
            supportsStreaming: true,
            supportsThinking: false
          }))
        }
      } catch {
        return { reachable: false, modelCount: 0, models: [] }
      }
    }

    if (parsed.data.providerId === 'ollama') {
      const url = parsed.data.baseUrl?.replace(/\/+$/, '') ?? getOllamaBaseUrl()
      try {
        const models = await getOllamaModels(url)
        return {
          reachable: true,
          modelCount: models.length,
          models: models.map(m => ({
            id: m.name,
            providerId: 'ollama',
            name: m.name,
            displayName: m.name,
            type: 'text' as const,
            contextWindow: 0,
            inputPrice: 0,
            outputPrice: 0,
            supportsImages: false,
            supportsStreaming: true,
            supportsThinking: false
          }))
        }
      } catch {
        return { reachable: false, modelCount: 0, models: [] }
      }
    }

    return { reachable: false, modelCount: 0, models: [] }
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
