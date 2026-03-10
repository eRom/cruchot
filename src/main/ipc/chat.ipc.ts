import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { streamText, NoOutputGeneratedError } from 'ai'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { validateAttachment, processAttachments, buildContentParts, MAX_FILES_PER_MESSAGE, type AttachmentRef } from '../llm/attachments'
import { parseFileOperations } from '../llm/file-operations'
import { buildWorkspaceTools, WORKSPACE_TOOLS_PROMPT } from '../llm/workspace-tools'
import { getActiveWorkspace } from './workspace.ipc'
import { createMessage, getMessagesForConversation } from '../db/queries/messages'
import { touchConversation, renameConversation, getConversation, updateConversationModel, updateConversationRole } from '../db/queries/conversations'

const attachmentSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().nonnegative(),
  type: z.enum(['image', 'document', 'code']),
  mimeType: z.string().min(1)
})

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  thinkingEffort: z.enum(['off', 'low', 'medium', 'high']).optional(),
  roleId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(MAX_FILES_PER_MESSAGE).optional(),
  fileContexts: z.array(z.object({
    path: z.string(),
    content: z.string(),
    language: z.string()
  })).optional(),
  hasWorkspace: z.boolean().optional()
})

let currentAbortController: AbortController | null = null

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, payload) => {
    const parsed = sendMessageSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { conversationId, content, modelId, providerId, systemPrompt, temperature, maxTokens, topP, thinkingEffort, roleId, attachments: attachmentRefs, fileContexts, hasWorkspace } = parsed.data
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')

    // Abort any existing stream
    if (currentAbortController) {
      currentAbortController.abort()
    }
    currentAbortController = new AbortController()

    const startTime = Date.now()

    try {
      // Re-validate attachments (extension, size, existence) in the main process
      const validatedRefs: AttachmentRef[] = []
      if (attachmentRefs && attachmentRefs.length > 0) {
        for (const ref of attachmentRefs) {
          const result = validateAttachment(ref.path)
          if (!result.valid) {
            throw new Error(result.error)
          }
          validatedRefs.push(result.ref)
        }
      }

      // Save user message to DB (with attachment references in contentData)
      const userContentData = validatedRefs.length > 0
        ? { attachments: validatedRefs.map(r => ({ path: r.path, name: r.name, size: r.size, type: r.type, mimeType: r.mimeType })) }
        : undefined

      createMessage({
        conversationId,
        role: 'user',
        content,
        modelId,
        providerId,
        contentData: userContentData
      })

      // Touch conversation updatedAt
      touchConversation(conversationId)

      // Auto-generate title from first message if title is still default
      const conv = getConversation(conversationId)
      if (conv && conv.title === 'Nouvelle conversation') {
        const shortTitle = content.slice(0, 35) + (content.length > 35 ? '...' : '')
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

      // Process attachments (extract text, encode images)
      let processedAttachments: Awaited<ReturnType<typeof processAttachments>> = []
      if (validatedRefs.length > 0) {
        processedAttachments = await processAttachments(validatedRefs)
      }
      const { imageParts, inlineText } = buildContentParts(processedAttachments)

      // Load conversation history from DB
      const dbMessages = getMessagesForConversation(conversationId)
      const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image?: string; mimeType?: string }> }> = []

      if (systemPrompt) {
        aiMessages.push({ role: 'system', content: systemPrompt })
      }

      for (const msg of dbMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          aiMessages.push({ role: msg.role, content: msg.content })
        }
      }

      // Inject workspace file context into system prompt
      if (fileContexts && fileContexts.length > 0) {
        const fileBlock = fileContexts.map(f =>
          `<file path="${f.path}" language="${f.language}">\n${f.content}\n</file>`
        ).join('\n\n')

        const workspaceInstruction = `\n\n<workspace-files>\n${fileBlock}\n</workspace-files>\n\nQuand tu proposes des modifications de fichiers, utilise ce format :\n\`\`\`file:create:chemin/fichier.ext\ncontenu\n\`\`\`\n\`\`\`file:modify:chemin/fichier.ext\ncontenu complet modifie\n\`\`\`\n\`\`\`file:delete:chemin/fichier.ext\n\`\`\``

        if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
          aiMessages[0].content += workspaceInstruction
        } else {
          aiMessages.unshift({ role: 'system', content: workspaceInstruction })
        }
      }

      // Replace the last user message (just added above) with multi-part content if attachments
      if (imageParts.length > 0 || inlineText) {
        // Remove the last user message we just pushed from history
        const lastIdx = aiMessages.length - 1
        if (lastIdx >= 0 && aiMessages[lastIdx].role === 'user') {
          const textWithAttachments = content + inlineText
          if (imageParts.length > 0) {
            // Multi-part: text + images
            const parts: Array<{ type: string; text?: string; image?: string; mimeType?: string }> = [
              { type: 'text', text: textWithAttachments }
            ]
            for (const img of imageParts) {
              parts.push({ type: 'image', image: img.image, mimeType: img.mimeType })
            }
            aiMessages[lastIdx] = { role: 'user', content: parts }
          } else {
            // Text only (document/code attachments inlined)
            aiMessages[lastIdx] = { role: 'user', content: textWithAttachments }
          }
        }
      }

      // Build workspace tools if workspace is active
      const activeWorkspace = hasWorkspace ? getActiveWorkspace() : null
      const tools = activeWorkspace ? buildWorkspaceTools(activeWorkspace) : undefined

      // Inject workspace tools system prompt when workspace is active
      if (activeWorkspace) {
        if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
          aiMessages[0].content += '\n\n' + WORKSPACE_TOOLS_PROMPT
        } else {
          aiMessages.unshift({ role: 'system', content: WORKSPACE_TOOLS_PROMPT })
        }
      }

      // Build providerOptions for thinking if supported
      const providerOptions = thinkingEffort && thinkingEffort !== 'off'
        ? buildThinkingProviderOptions(providerId, thinkingEffort)
        : undefined

      // Accumulate text during streaming (needed because with maxSteps, result.text only has the last step)
      let accumulatedReasoning = ''
      let accumulatedText = ''

      const result = streamText({
        model,
        messages: aiMessages,
        abortSignal: currentAbortController.signal,
        temperature,
        maxTokens,
        topP,
        providerOptions,
        ...(tools ? { tools, maxSteps: 10 } : {}),
        onChunk({ chunk }) {
          if (chunk.type === 'text-delta') {
            accumulatedText += chunk.text
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
          } else if (chunk.type === 'tool-call') {
            win.webContents.send('chat:chunk', {
              type: 'tool-call',
              toolName: chunk.toolName,
              toolArgs: chunk.args
            })
          }
        }
      })

      // Consume the stream — usage is only available after full consumption
      let fullText = ''
      try {
        await result.text
        fullText = accumulatedText
      } catch (e) {
        if (e instanceof NoOutputGeneratedError) {
          // If the NoOutputGeneratedError wraps a real API error, rethrow it
          if (e.cause) throw e.cause
          // Otherwise it's a genuine "no output" (e.g. reasoning model with no text)
        } else {
          throw e
        }
      }

      // Get usage from resolved promise (more reliable than onFinish for some providers)
      const usage = await result.usage
      const responseTimeMs = Date.now() - startTime
      const tokensIn = usage?.inputTokens ?? 0
      const tokensOut = usage?.outputTokens ?? 0
      const cost = calculateMessageCost(modelId, tokensIn, tokensOut)

      // Save last used model on the conversation (for restore on switch)
      updateConversationModel(conversationId, `${providerId}::${modelId}`)

      // Persist role on the conversation (first message only in practice)
      if (roleId) {
        updateConversationRole(conversationId, roleId)
      }

      // Parse file operations from assistant response
      const fileOps = parseFileOperations(fullText)

      // Build contentData
      const contentData: Record<string, unknown> = {}
      if (accumulatedReasoning) contentData.reasoning = accumulatedReasoning
      if (fileOps.length > 0) contentData.fileOperations = fileOps.map(op => ({ ...op, status: 'pending' }))

      const savedMessage = createMessage({
        conversationId,
        role: 'assistant',
        content: fullText,
        modelId,
        providerId,
        tokensIn,
        tokensOut,
        cost,
        responseTimeMs,
        contentData: Object.keys(contentData).length > 0 ? contentData : undefined
      })

      win.webContents.send('chat:chunk', {
        type: 'finish',
        content: fullText,
        messageId: savedMessage.id,
        usage: {
          promptTokens: tokensIn,
          completionTokens: tokensOut,
          totalTokens: tokensIn + tokensOut
        },
        cost,
        responseTimeMs,
        fileOperations: fileOps.length > 0 ? fileOps.map(op => ({ ...op, status: 'pending' })) : undefined
      })

      currentAbortController = null

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
