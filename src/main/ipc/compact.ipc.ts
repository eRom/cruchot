import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { getModel } from '../llm/router'
import { getMessagesForConversation } from '../db/queries/messages'
import { getConversation, updateConversationCompact } from '../db/queries/conversations'
import { compactService } from '../services/compact.service'
import { MODELS } from '../llm/registry'
import { calculateMessageCost } from '../llm/cost-calculator'
import { createLlmCost } from '../db/queries/llm-costs'

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'xai', 'deepseek', 'qwen', 'perplexity', 'openrouter', 'lmstudio', 'ollama'] as const

const compactingConversations = new Set<string>()

const compactRunSchema = z.object({
  conversationId: z.string().min(1).max(100)
})

export function registerCompactIpc(): void {
  ipcMain.handle('compact:run', async (_event, payload: unknown) => {
    const parsed = compactRunSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid compact:run payload')

    const { conversationId } = parsed.data

    if (compactingConversations.has(conversationId)) {
      throw new Error('Compaction already in progress')
    }
    compactingConversations.add(conversationId)

    try {
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

      // Get model context window from registry
      const modelInfo = MODELS.find(m => m.id === actualModelId)
      const contextWindow = modelInfo?.contextWindow ?? 200_000

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

        // Track LLM cost
        if (result.usage) {
          const cost = calculateMessageCost(actualModelId, result.usage.inputTokens, result.usage.outputTokens)
          createLlmCost({
            type: 'compact',
            conversationId,
            modelId: actualModelId,
            providerId,
            tokensIn: result.usage.inputTokens,
            tokensOut: result.usage.outputTokens,
            cost,
            metadata: { tokensBefore: result.tokensBefore, tokensAfter: result.tokensAfter }
          })
        }

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
    } finally {
      compactingConversations.delete(conversationId)
    }
  })

  console.log('[IPC] Compact handlers registered')
}
