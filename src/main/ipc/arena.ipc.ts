import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { streamText, NoOutputGeneratedError } from 'ai'
import { nanoid } from 'nanoid'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { createMessage, getMessagesForConversation } from '../db/queries/messages'
import { getConversation, touchConversation, renameConversation, updateConversationModel, setConversationArena } from '../db/queries/conversations'
import { createArenaMatch, updateArenaMatchMessageId, updateArenaVote, getArenaMatchesForConversation, getArenaStats } from '../db/queries/arena'
import { buildMemoryBlock } from '../db/queries/memory-fragments'
import { qdrantMemoryService } from '../services/qdrant-memory.service'
import { buildSemanticMemoryBlock } from '../llm/memory-prompt'

const arenaSendSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(100_000),
  leftProviderId: z.string().min(1),
  leftModelId: z.string().min(1),
  rightProviderId: z.string().min(1),
  rightModelId: z.string().min(1),
  systemPrompt: z.string().max(50_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  thinkingEffort: z.enum(['off', 'low', 'medium', 'high']).optional()
})

const arenaVoteSchema = z.object({
  matchId: z.string().min(1),
  vote: z.enum(['left', 'right', 'tie'])
})

const idSchema = z.string().min(1).max(100)

let leftAbortController: AbortController | null = null
let rightAbortController: AbortController | null = null

export function registerArenaIpc(): void {
  ipcMain.handle('arena:send', async (event, payload) => {
    const parsed = arenaSendSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const _win = BrowserWindow.fromWebContents(event.sender)
    if (!_win) throw new Error('No window found')
    const win = _win

    const {
      conversationId, content,
      leftProviderId, leftModelId, rightProviderId, rightModelId,
      systemPrompt, temperature, maxTokens, thinkingEffort
    } = parsed.data

    // Abort any existing arena streams
    if (leftAbortController) leftAbortController.abort()
    if (rightAbortController) rightAbortController.abort()

    // Save user message (shared between both sides)
    const userMsg = createMessage({
      conversationId,
      role: 'user',
      content
    })

    // Mark as arena conversation + touch
    setConversationArena(conversationId, true)
    touchConversation(conversationId)

    // Auto-generate title from first message
    const conv = getConversation(conversationId)
    if (conv && conv.title === 'Nouvelle conversation') {
      const shortTitle = '[Arena] ' + content.slice(0, 30) + (content.length > 30 ? '...' : '')
      renameConversation(conversationId, shortTitle)
      win.webContents.send('conversation:updated', { id: conversationId, title: shortTitle })
    }

    // Create arena match row
    const match = createArenaMatch({
      conversationId,
      userMessageId: userMsg.id,
      leftProviderId,
      leftModelId,
      rightProviderId,
      rightModelId
    })

    // Send match ID to renderer
    win.webContents.send('arena:match-created', { matchId: match.id })

    // Load conversation history
    const dbMessages = getMessagesForConversation(conversationId)
    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    // Build system prompt (simplified: memory + role, no workspace tools/MCP)
    let semanticMemoryBlock = ''
    if (qdrantMemoryService.getStatus() === 'ready') {
      try {
        const recalls = await qdrantMemoryService.recall(content, {
          topK: 5,
          scoreThreshold: 0.35,
          projectId: conv?.projectId ?? null,
          conversationId
        })
        if (recalls.length > 0) {
          semanticMemoryBlock = buildSemanticMemoryBlock(recalls)
        }
      } catch {
        // Silent
      }
    }

    const memoryBlock = buildMemoryBlock()
    let combinedSystemPrompt = ''
    if (semanticMemoryBlock) combinedSystemPrompt += semanticMemoryBlock
    if (memoryBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += memoryBlock
    }
    if (systemPrompt) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += systemPrompt
    }
    if (combinedSystemPrompt) {
      aiMessages.push({ role: 'system', content: combinedSystemPrompt })
    }

    // Add conversation history (skip arena-specific messages, just user/assistant)
    for (const msg of dbMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        aiMessages.push({ role: msg.role, content: msg.content })
      }
    }

    // Stream one side
    async function streamSide(
      side: 'left' | 'right',
      providerId: string,
      modelId: string,
      controller: AbortController
    ) {
      const channel = `arena:chunk:${side}` as const
      const startTime = Date.now()

      win.webContents.send(channel, { type: 'start', modelId, providerId })

      try {
        const model = getModel(providerId, modelId)
        const providerOptions = thinkingEffort && thinkingEffort !== 'off'
          ? buildThinkingProviderOptions(providerId, thinkingEffort)
          : undefined

        let accumulatedText = ''
        let accumulatedReasoning = ''

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streamOptions: any = {
          model,
          messages: aiMessages,
          abortSignal: controller.signal,
          temperature,
          maxTokens,
          providerOptions,
          onChunk({ chunk }: { chunk: { type: string; text?: string } }) {
            if (chunk.type === 'text-delta') {
              accumulatedText += chunk.text ?? ''
              win.webContents.send(channel, { type: 'text-delta', content: chunk.text })
            } else if (chunk.type === 'reasoning-delta') {
              accumulatedReasoning += chunk.text ?? ''
              win.webContents.send(channel, { type: 'reasoning-delta', content: chunk.text })
            }
          }
        }
        const result = streamText(streamOptions)

        let fullText = ''
        try {
          await result.text
          fullText = accumulatedText
        } catch (e) {
          if (e instanceof NoOutputGeneratedError) {
            if (e.cause) throw e.cause
          } else {
            throw e
          }
        }

        const usage = await result.usage
        const responseTimeMs = Date.now() - startTime
        const tokensIn = usage?.inputTokens ?? 0
        const tokensOut = usage?.outputTokens ?? 0
        const cost = calculateMessageCost(modelId, tokensIn, tokensOut)

        // Save assistant message
        const contentData: Record<string, unknown> = {}
        if (accumulatedReasoning) contentData.reasoning = accumulatedReasoning
        contentData.arenaSide = side

        const assistantMsg = createMessage({
          conversationId,
          role: 'assistant',
          content: fullText,
          modelId,
          providerId,
          parentMessageId: userMsg.id,
          tokensIn,
          tokensOut,
          cost,
          responseTimeMs,
          contentData: Object.keys(contentData).length > 0 ? contentData : undefined
        })

        // Link to arena match
        updateArenaMatchMessageId(match.id, side, assistantMsg.id)

        win.webContents.send(channel, {
          type: 'finish',
          content: fullText,
          messageId: assistantMsg.id,
          usage: { promptTokens: tokensIn, completionTokens: tokensOut },
          cost,
          responseTimeMs
        })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          win.webContents.send(channel, { type: 'finish', content: '' })
          return
        }
        const classified = classifyError(err)
        console.error(`[Arena] ${side} stream error:`, err)
        win.webContents.send(channel, { type: 'error', error: classified.message })
      }
    }

    // Fire both streams in parallel
    leftAbortController = new AbortController()
    rightAbortController = new AbortController()

    await Promise.allSettled([
      streamSide('left', leftProviderId, leftModelId, leftAbortController),
      streamSide('right', rightProviderId, rightModelId, rightAbortController)
    ])

    // Update conversation model to show both models
    updateConversationModel(conversationId, `${leftProviderId}::${leftModelId}`)

    leftAbortController = null
    rightAbortController = null
  })

  ipcMain.handle('arena:cancel', async () => {
    if (leftAbortController) {
      leftAbortController.abort()
      leftAbortController = null
    }
    if (rightAbortController) {
      rightAbortController.abort()
      rightAbortController = null
    }
  })

  ipcMain.handle('arena:vote', async (_event, payload) => {
    const parsed = arenaVoteSchema.parse(payload)
    updateArenaVote(parsed.matchId, parsed.vote)
  })

  ipcMain.handle('arena:getMatches', async (_event, payload) => {
    const schema = z.object({ conversationId: idSchema })
    const parsed = schema.parse(payload)
    return getArenaMatchesForConversation(parsed.conversationId)
  })

  ipcMain.handle('arena:getStats', async () => {
    return getArenaStats()
  })

  console.log('[IPC] Arena handlers registered')
}
