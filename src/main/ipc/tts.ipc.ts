import { ipcMain } from 'electron'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { synthesizeSpeech, getTtsModel } from '../services/tts.service'
import { insertTtsUsage } from '../db/queries/tts'
import { getApiKeyForProvider } from './providers.ipc'

const synthesizeSchema = z.object({
  provider: z.enum(['openai', 'google']),
  text: z.string().min(1).max(4096),
  speed: z.number().min(0.5).max(2.0).optional(),
  messageId: z.string().optional()
})

export function registerTtsIpc(): void {
  ipcMain.handle('tts:synthesize', async (_event, payload: unknown) => {
    const parsed = synthesizeSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid TTS payload: ${parsed.error.message}`)
    }

    const { provider, text, speed, messageId } = parsed.data

    console.log(`[TTS] Synthesizing with provider: ${provider}, text length: ${text.length}`)
    const result = await synthesizeSpeech({ provider, text, speed })
    console.log(`[TTS] Success — mimeType: ${result.mimeType}, audio size: ${result.audio.length} chars, cost: $${result.cost}`)

    if (messageId) {
      insertTtsUsage({
        id: nanoid(),
        messageId,
        provider,
        model: getTtsModel(provider),
        textLength: text.length,
        cost: result.cost
      })
    }

    return result
  })

  ipcMain.handle('tts:getAvailableProviders', async () => {
    const available: Array<{ id: string; name: string }> = [
      { id: 'browser', name: 'Navigateur (Web Speech)' }
    ]

    if (getApiKeyForProvider('openai')) {
      available.push({ id: 'openai', name: 'OpenAI (Coral)' })
    }
    if (getApiKeyForProvider('google')) {
      available.push({ id: 'google', name: 'Google (Aoede)' })
    }

    return available
  })

  console.log('[IPC] TTS handlers registered')
}
