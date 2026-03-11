import { ipcMain } from 'electron'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../llm/router'
import { getMessagesForConversation } from '../db/queries/messages'
import { getConversation } from '../db/queries/conversations'

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'xai', 'deepseek', 'qwen', 'perplexity', 'lmstudio', 'ollama'] as const

const summarizeSchema = z.object({
  conversationId: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\-.:\/]+$/),
  prompt: z.string().min(1).max(10_000)
})

export function registerSummaryIpc(): void {
  ipcMain.handle('summary:generate', async (_event, payload: unknown) => {
    const parsed = summarizeSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid summary:generate payload')

    const { conversationId, modelId, prompt } = parsed.data

    // Split "providerId::modelId" + validate provider
    const parts = modelId.split('::')
    if (parts.length !== 2) throw new Error('Invalid modelId format — expected "providerId::modelId"')
    const [providerId, actualModelId] = parts

    if (!VALID_PROVIDERS.includes(providerId as (typeof VALID_PROVIDERS)[number])) {
      throw new Error('Invalid provider')
    }

    const model = getModel(providerId, actualModelId)

    // Verify conversation exists
    const conv = getConversation(conversationId)
    if (!conv) throw new Error('Conversation not found')

    // Load conversation messages and serialize into a single user message
    // (avoids "assistant message prefill" errors on some providers)
    const allMessages = getMessagesForConversation(conversationId)
    const chatMessages = allMessages.filter((m) => m.role === 'user' || m.role === 'assistant')

    if (chatMessages.length < 2) {
      throw new Error('Pas assez de messages pour generer un resume')
    }

    const transcript = chatMessages
      .map((m) => `[${m.role === 'user' ? 'Utilisateur' : 'Assistant'}]\n${m.content}`)
      .join('\n\n---\n\n')

    // Truncate very long conversations
    const maxLen = 100_000
    const truncated = transcript.length > maxLen
      ? transcript.slice(0, maxLen) + '\n\n... (conversation tronquee)'
      : transcript

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `Voici la conversation a resumer :\n\n${truncated}` }
      ],
      maxTokens: 4096,
      temperature: 0.3
    })

    return { text: result.text.trim() }
  })

  console.log('[IPC] Summary handlers registered')
}
