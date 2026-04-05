import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { getModel } from '../llm/router'
import { getMessagesForConversation } from '../db/queries/messages'
import { getConversation, updateConversationCompact } from '../db/queries/conversations'
import { compactService } from '../services/compact.service'

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'xai', 'deepseek', 'qwen', 'perplexity', 'lmstudio', 'ollama'] as const

const compactRunSchema = z.object({
  conversationId: z.string().min(1).max(100)
})

export function registerCompactIpc(): void {
  ipcMain.handle('compact:run', async (_event, payload: unknown) => {
    const parsed = compactRunSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid compact:run payload')

    const { conversationId } = parsed.data
    const conv = getConversation(conversationId)
    if (!conv) throw new Error('Conversation not found')
    if (!conv.modelId) throw new Error('No model set for this conversation')

    const parts = conv.modelId.split('::')
    if (parts.length !== 2) throw new Error('Invalid modelId format')
    const [providerId, actualModelId] = parts

    if (!VALID_PROVIDERS.includes(providerId as (typeof VALID_PROVIDERS)[number])) {
      throw new Error('Invalid provider')
    }

    const model = getModel(providerId, actualModelId)
    const messages = getMessagesForConversation(conversationId)

    // Get model context window
    let contextWindow = 200_000
    try {
      const { getDatabase } = await import('../db')
      const { models } = await import('../db/schema')
      const { eq } = await import('drizzle-orm')
      const db = getDatabase()
      const dbModel = db.select().from(models).where(eq(models.id, actualModelId)).get()
      if (dbModel?.contextWindow) contextWindow = dbModel.contextWindow
    } catch { /* use fallback */ }

    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('compact:status', { isCompacting: true })
    }

    try {
      const result = await compactService.fullCompact(
        conversationId,
        messages,
        model,
        contextWindow,
        conv.compactSummary
      )

      // Find boundary: last summarized message
      const summarizedMessages = messages.filter(m => !result.keptMessages.some(km => km.id === m.id))
      const boundaryId = summarizedMessages.length > 0
        ? summarizedMessages[summarizedMessages.length - 1].id
        : conv.compactBoundaryId ?? messages[0]?.id ?? ''

      updateConversationCompact(conversationId, result.summary, boundaryId)

      if (win) {
        win.webContents.send('compact:status', {
          isCompacting: false,
          needsFullCompact: false,
          tokenEstimate: result.tokensAfter
        })
      }

      return {
        tokensBefore: result.tokensBefore,
        tokensAfter: result.tokensAfter
      }
    } catch (error) {
      if (win) {
        win.webContents.send('compact:status', { isCompacting: false })
      }
      throw error
    }
  })

  console.log('[IPC] Compact handlers registered')
}
