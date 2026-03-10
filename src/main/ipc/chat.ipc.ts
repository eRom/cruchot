import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { streamText, NoOutputGeneratedError } from 'ai'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { createMessage, getMessagesForConversation } from '../db/queries/messages'
import { touchConversation, renameConversation, getConversation } from '../db/queries/conversations'

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  thinkingEffort: z.enum(['off', 'low', 'medium', 'high']).optional()
})

let currentAbortController: AbortController | null = null

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, payload) => {
    const parsed = sendMessageSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { conversationId, content, modelId, providerId, systemPrompt, temperature, maxTokens, topP, thinkingEffort } = parsed.data
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')

    // Abort any existing stream
    if (currentAbortController) {
      currentAbortController.abort()
    }
    currentAbortController = new AbortController()

    const startTime = Date.now()

    try {
      // Save user message to DB
      createMessage({
        conversationId,
        role: 'user',
        content,
        modelId,
        providerId
      })

      // Touch conversation updatedAt
      touchConversation(conversationId)

      // Auto-generate title from first message if title is still default
      const conv = getConversation(conversationId)
      if (conv && conv.title === 'Nouvelle conversation') {
        const shortTitle = content.slice(0, 60) + (content.length > 60 ? '...' : '')
        renameConversation(conversationId, shortTitle)
        // Notify renderer about the title update
        win.webContents.send('conversation:updated', {
          id: conversationId,
          title: shortTitle
        })
      }

      const model = getModel(providerId, modelId)

      // Signal the renderer that processing has started
      win.webContents.send('chat:chunk', {
        type: 'start',
        modelId,
        providerId
      })

      // Load conversation history from DB
      const dbMessages = getMessagesForConversation(conversationId)
      const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

      if (systemPrompt) {
        aiMessages.push({ role: 'system', content: systemPrompt })
      }

      for (const msg of dbMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          aiMessages.push({ role: msg.role, content: msg.content })
        }
      }

      // Build providerOptions for thinking if supported
      const providerOptions = thinkingEffort && thinkingEffort !== 'off'
        ? buildThinkingProviderOptions(providerId, thinkingEffort)
        : undefined

      // Accumulate reasoning text during streaming
      let accumulatedReasoning = ''

      const result = streamText({
        model,
        messages: aiMessages,
        abortSignal: currentAbortController.signal,
        temperature,
        maxTokens,
        topP,
        providerOptions,
        onChunk({ chunk }) {
          if (chunk.type === 'text-delta') {
            win.webContents.send('chat:chunk', {
              type: 'text-delta',
              content: chunk.text
            })
          } else if (chunk.type === 'reasoning-delta') {
            accumulatedReasoning += chunk.text
            win.webContents.send('chat:chunk', {
              type: 'reasoning-delta',
              content: chunk.text
            })
          }
        },
        async onFinish({ text, usage }) {
          const responseTimeMs = Date.now() - startTime
          const tokensIn = usage?.promptTokens ?? 0
          const tokensOut = usage?.completionTokens ?? 0
          const cost = calculateMessageCost(modelId, tokensIn, tokensOut)

          // Save assistant message to DB (with reasoning in contentData if present)
          const contentData = accumulatedReasoning
            ? { reasoning: accumulatedReasoning }
            : undefined

          const savedMessage = createMessage({
            conversationId,
            role: 'assistant',
            content: text,
            modelId,
            providerId,
            tokensIn,
            tokensOut,
            cost,
            responseTimeMs,
            contentData
          })

          win.webContents.send('chat:chunk', {
            type: 'finish',
            content: text,
            messageId: savedMessage.id,
            usage: {
              promptTokens: tokensIn,
              completionTokens: tokensOut,
              totalTokens: tokensIn + tokensOut
            },
            cost,
            responseTimeMs
          })

          currentAbortController = null
        }
      })

      // Consume the stream (needed for onChunk/onFinish to fire)
      try {
        await result.text
      } catch (e) {
        // NoOutputGeneratedError = stream completed but no text output
        // (reasoning models may produce only reasoning tokens)
        // onFinish already handled saving, so we can ignore this
        if (!(e instanceof NoOutputGeneratedError)) {
          throw e
        }
      }

    } catch (error: unknown) {
      currentAbortController = null

      // Don't report abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        win.webContents.send('chat:chunk', {
          type: 'finish',
          content: ''
        })
        return
      }

      const classified = classifyError(error)
      console.error('[Chat] Stream error:', error)
      win.webContents.send('chat:chunk', {
        type: 'error',
        error: classified.message,
        category: classified.category,
        suggestion: classified.suggestion
      })
    }
  })

  ipcMain.handle('chat:cancel', async () => {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
  })

  console.log('[IPC] Chat handlers registered')
}
