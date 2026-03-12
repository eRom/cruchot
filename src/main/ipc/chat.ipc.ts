import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { streamText, tool, NoOutputGeneratedError, stepCountIs } from 'ai'
import { nanoid } from 'nanoid'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { validateAttachment, processAttachments, buildContentParts, MAX_FILES_PER_MESSAGE, type AttachmentRef } from '../llm/attachments'
import { parseFileOperations } from '../llm/file-operations'
import { buildWorkspaceTools, buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from '../llm/workspace-tools'
import { getActiveWorkspace, getActiveWorkspaceRoot } from './workspace.ipc'
import { mcpManagerService } from '../services/mcp-manager.service'
import { telegramBotService } from '../services/telegram-bot.service'
import { remoteServerService } from '../services/remote-server.service'
import { buildMemoryBlock } from '../db/queries/memory-fragments'
import { createMessage, getMessagesForConversation } from '../db/queries/messages'
import { touchConversation, renameConversation, getConversation, updateConversationModel, updateConversationRole } from '../db/queries/conversations'
import { getActiveSession } from '../db/queries/remote-sessions'

const attachmentSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  size: z.number().nonnegative(),
  type: z.enum(['image', 'document', 'code']),
  mimeType: z.string().min(1)
})

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(100_000),
  modelId: z.string().min(1),
  providerId: z.string().min(1),
  systemPrompt: z.string().max(50_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  thinkingEffort: z.enum(['off', 'low', 'medium', 'high']).optional(),
  roleId: z.string().optional(),
  attachments: z.array(attachmentSchema).max(MAX_FILES_PER_MESSAGE).optional(),
  fileContexts: z.array(z.object({
    path: z.string().max(1000),
    content: z.string().max(500_000),
    language: z.string().max(50)
  })).max(20).optional(),
  hasWorkspace: z.boolean().optional(),
  searchEnabled: z.boolean().optional()
})

let currentAbortController: AbortController | null = null

// ── Tool Approval Gate ──────────────────────────────────────

interface ToolLike {
  description?: string
  inputSchema?: unknown
  execute?: (args: unknown) => Promise<unknown>
  [key: string]: unknown
}

function shouldAutoApprove(toolName: string, session: { autoApproveRead: boolean; autoApproveWrite: boolean; autoApproveBash: boolean; autoApproveList: boolean; autoApproveMcp: boolean }): boolean {
  // Workspace tools
  if (toolName === 'readFile') return session.autoApproveRead
  if (toolName === 'listFiles') return session.autoApproveList
  if (toolName === 'writeFile') return session.autoApproveWrite
  if (toolName === 'bash') return session.autoApproveBash
  // Search tool (external API like MCP)
  if (toolName === 'search') return session.autoApproveMcp
  // MCP tools (contain double underscore)
  if (toolName.includes('__')) return session.autoApproveMcp
  // Unknown tools default to requiring approval
  return false
}

function wrapToolsWithApproval(
  tools: Record<string, ToolLike>,
  bot: typeof telegramBotService,
  session: { autoApproveRead: boolean; autoApproveWrite: boolean; autoApproveBash: boolean; autoApproveList: boolean; autoApproveMcp: boolean }
): Record<string, ToolLike> {
  const wrapped: Record<string, ToolLike> = {}

  for (const [name, t] of Object.entries(tools)) {
    if (shouldAutoApprove(name, session)) {
      // Auto-approved — notify Telegram but don't wait
      const originalExecute = t.execute
      wrapped[name] = {
        ...t,
        execute: async (args: unknown) => {
          // Notify Telegram about auto-approved tool
          bot.sendToolResult(name, `[auto-approve] ${name}(${JSON.stringify(args).slice(0, 200)})`).catch(() => {})
          return originalExecute ? originalExecute(args) : undefined
        }
      }
    } else {
      // Requires approval
      const originalExecute = t.execute
      wrapped[name] = {
        ...t,
        execute: async (args: unknown) => {
          const approved = await bot.requestApproval(nanoid(), name, args as Record<string, unknown>)
          if (!approved) {
            return { error: 'Tool call denied by user via Telegram' }
          }
          return originalExecute ? originalExecute(args) : undefined
        }
      }
    }
  }

  return wrapped
}

// ── Exported chat handler (used by both IPC and Telegram) ───

export interface HandleChatMessageParams {
  conversationId: string
  content: string
  modelId: string
  providerId: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  thinkingEffort?: string
  roleId?: string
  attachments?: AttachmentRef[]
  fileContexts?: Array<{ path: string; content: string; language: string }>
  hasWorkspace?: boolean
  searchEnabled?: boolean
  source: 'desktop' | 'telegram' | 'websocket'
  window: BrowserWindow
}

export async function handleChatMessage(params: HandleChatMessageParams): Promise<void> {
  const {
    conversationId, content, modelId, providerId, systemPrompt,
    temperature, maxTokens, topP, thinkingEffort, roleId,
    attachments: attachmentRefs, fileContexts, hasWorkspace,
    searchEnabled, source, window: win
  } = params

  // Abort any existing stream
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()

  const isRemoteConnected = telegramBotService.getStatus() === 'connected'
  const isWsConnected = remoteServerService.getStatus() === 'running'
    && remoteServerService.getConnectedClients().length > 0

  const startTime = Date.now()

  try {
    // Re-validate attachments (extension, size, existence, path confinement) in the main process
    const validatedRefs: AttachmentRef[] = []
    const workspaceRoot = getActiveWorkspaceRoot()
    if (attachmentRefs && attachmentRefs.length > 0) {
      for (const ref of attachmentRefs) {
        const result = validateAttachment(ref.path, workspaceRoot)
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
    if (conv && (conv.title === 'Nouvelle conversation' || conv.title.startsWith('[Remote]'))) {
      const shortTitle = (source === 'telegram' ? '[R] ' : '') + content.slice(0, 35) + (content.length > 35 ? '...' : '')
      if (conv.title === 'Nouvelle conversation' || conv.title.startsWith('[Remote] Session')) {
        renameConversation(conversationId, shortTitle)
        win.webContents.send('conversation:updated', {
          id: conversationId,
          title: shortTitle
        })
      }
    }

    const model = getModel(providerId, modelId)

    // Signal the renderer that processing has started
    win.webContents.send('chat:chunk', {
      type: 'start',
      modelId,
      providerId
    })

    // Start Telegram streaming if connected
    if (isRemoteConnected) {
      await telegramBotService.startStreaming()
    }
    // Start WebSocket streaming if connected
    if (isWsConnected) {
      remoteServerService.startStreaming()
    }

    // Process attachments (extract text, encode images)
    let processedAttachments: Awaited<ReturnType<typeof processAttachments>> = []
    if (validatedRefs.length > 0) {
      processedAttachments = await processAttachments(validatedRefs)
    }
    const { imageParts, inlineText } = buildContentParts(processedAttachments)

    // Load conversation history from DB
    const dbMessages = getMessagesForConversation(conversationId)
    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image?: string; mimeType?: string }> }> = []

    // Build combined system prompt: memory fragments + role prompt
    const memoryBlock = buildMemoryBlock()
    let combinedSystemPrompt = ''
    if (memoryBlock) combinedSystemPrompt += memoryBlock
    if (systemPrompt) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += systemPrompt
    }
    if (combinedSystemPrompt) {
      aiMessages.push({ role: 'system', content: combinedSystemPrompt })
    }

    for (const msg of dbMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        aiMessages.push({ role: msg.role, content: msg.content })
      }
    }

    // Inject workspace file context into system prompt
    if (fileContexts && fileContexts.length > 0) {
      // Sanitize path and language to prevent XML attribute injection
      const sanitizeAttr = (s: string) => s.replace(/["<>&]/g, '')
      // Sanitize content to prevent XML tag injection (same pattern as buildWorkspaceContextBlock)
      const sanitizeContent = (s: string) => s
        .replace(/<\/file>/gi, '&lt;/file&gt;')
        .replace(/<\/workspace-files>/gi, '&lt;/workspace-files&gt;')
      const fileBlock = fileContexts.map(f =>
        `<file path="${sanitizeAttr(f.path)}" language="${sanitizeAttr(f.language)}">\n${sanitizeContent(f.content)}\n</file>`
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
    const workspaceTools = activeWorkspace ? buildWorkspaceTools(activeWorkspace) : {}

    // Build MCP tools (from connected MCP servers, scoped to project)
    let mcpTools: Record<string, unknown> = {}
    try {
      mcpTools = await mcpManagerService.getToolsForChat(conv?.projectId)
    } catch (err) {
      console.warn('[Chat] Failed to get MCP tools:', err)
    }

    // Inject Perplexity Search tool if search mode is enabled
    if (searchEnabled) {
      try {
        const { getApiKeyForProvider } = await import('./providers.ipc')
        const perplexityApiKey = getApiKeyForProvider('perplexity')
        if (perplexityApiKey) {
          const { perplexitySearch } = await import('@perplexity-ai/ai-sdk')
          mcpTools = { ...mcpTools, search: perplexitySearch({ apiKey: perplexityApiKey }) }
        }
      } catch (err) {
        console.warn('[Chat] Failed to inject Perplexity Search tool:', err)
      }
    }

    // Merge all tools
    let tools = { ...workspaceTools, ...mcpTools } as Record<string, ToolLike>

    // Wrap tools with approval gate when Remote is connected
    if (isRemoteConnected && source === 'telegram') {
      const session = getActiveSession()
      if (session) {
        tools = wrapToolsWithApproval(tools, telegramBotService, {
          autoApproveRead: session.autoApproveRead,
          autoApproveWrite: session.autoApproveWrite,
          autoApproveBash: session.autoApproveBash,
          autoApproveList: session.autoApproveList,
          autoApproveMcp: session.autoApproveMcp
        })
      }
    }
    // Wrap tools with approval gate when WebSocket Remote is connected
    if (isWsConnected && source === 'websocket') {
      const { getActiveWebSocketSession } = await import('../db/queries/remote-server')
      const wsSession = getActiveWebSocketSession()
      if (wsSession) {
        tools = wrapToolsWithApproval(tools, remoteServerService, {
          autoApproveRead: wsSession.autoApproveRead,
          autoApproveWrite: wsSession.autoApproveWrite,
          autoApproveBash: wsSession.autoApproveBash,
          autoApproveList: wsSession.autoApproveList,
          autoApproveMcp: wsSession.autoApproveMcp
        })
      }
    }

    const hasTools = Object.keys(tools).length > 0

    // Inject workspace context + tools system prompt when workspace is active
    if (activeWorkspace) {
      const contextBlock = buildWorkspaceContextBlock(activeWorkspace.rootPath)
      const workspacePrompt = contextBlock
        ? contextBlock + '\n\n' + WORKSPACE_TOOLS_PROMPT
        : WORKSPACE_TOOLS_PROMPT

      if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
        aiMessages[0].content += '\n\n' + workspacePrompt
      } else {
        aiMessages.unshift({ role: 'system', content: workspacePrompt })
      }
    }

    // Inject search system prompt when search mode is enabled
    if (searchEnabled) {
      const searchPrompt = `Le mode recherche web est active. Vous disposez d'un outil "search" pour chercher sur le web via Perplexity.

IMPORTANT : Quand l'utilisateur pose une question, privilegiez l'outil "search" pour trouver des informations sur le web. N'utilisez PAS les outils de workspace (bash, readFile, listFiles, writeFile) sauf si l'utilisateur demande explicitement de travailler sur des fichiers locaux. Citez vos sources dans la reponse.`
      if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
        aiMessages[0].content += '\n\n' + searchPrompt
      } else {
        aiMessages.unshift({ role: 'system', content: searchPrompt })
      }
    }

    // Build providerOptions for thinking if supported
    const providerOptions = thinkingEffort && thinkingEffort !== 'off'
      ? buildThinkingProviderOptions(providerId, thinkingEffort)
      : undefined

    // Accumulate text during streaming (needed because with maxSteps, result.text only has the last step)
    let accumulatedReasoning = ''
    let accumulatedText = ''
    const accumulatedToolCalls: Array<{ toolName: string; args?: Record<string, unknown>; status: 'running' | 'success' | 'error'; error?: string }> = []
    const accumulatedSearchSources: Array<{ title: string; url: string; snippet?: string }> = []

    // State machine for parsing <think> tags from open-source models (LM Studio, Ollama, etc.)
    // These models emit reasoning inside <think>...</think> as plain text-delta chunks.
    let insideThinkTag = false
    let pendingBuffer = '' // Buffer for partial tag detection

    function emitTextOrThinking(text: string) {
      let remaining = text

      while (remaining.length > 0) {
        if (!insideThinkTag) {
          // Look for <think> opening tag
          const openIdx = remaining.indexOf('<think>')
          if (openIdx === -1) {
            // Check for partial tag at the end (e.g. "<thi")
            const partialIdx = remaining.lastIndexOf('<')
            if (partialIdx !== -1 && partialIdx > remaining.length - 8 && '<think>'.startsWith(remaining.slice(partialIdx))) {
              // Buffer the potential partial tag
              const safeText = remaining.slice(0, partialIdx)
              if (safeText) {
                accumulatedText += safeText
                win.webContents.send('chat:chunk', { type: 'text-delta', content: safeText })
                // Tri-forward to Telegram + WebSocket
                if (isRemoteConnected) telegramBotService.pushChunk(safeText)
                if (isWsConnected) remoteServerService.pushChunk(safeText)
              }
              pendingBuffer = remaining.slice(partialIdx)
              return
            }
            // No tag at all — emit as text
            accumulatedText += remaining
            win.webContents.send('chat:chunk', { type: 'text-delta', content: remaining })
            // Tri-forward to Telegram + WebSocket
            if (isRemoteConnected) telegramBotService.pushChunk(remaining)
            if (isWsConnected) remoteServerService.pushChunk(remaining)
            return
          }
          // Emit text before the tag
          if (openIdx > 0) {
            const before = remaining.slice(0, openIdx)
            accumulatedText += before
            win.webContents.send('chat:chunk', { type: 'text-delta', content: before })
            if (isRemoteConnected) telegramBotService.pushChunk(before)
            if (isWsConnected) remoteServerService.pushChunk(before)
          }
          insideThinkTag = true
          remaining = remaining.slice(openIdx + 7) // skip "<think>"
        } else {
          // Inside <think> — look for </think> closing tag
          const closeIdx = remaining.indexOf('</think>')
          if (closeIdx === -1) {
            // Check for partial closing tag
            const partialIdx = remaining.lastIndexOf('<')
            if (partialIdx !== -1 && partialIdx > remaining.length - 9 && '</think>'.startsWith(remaining.slice(partialIdx))) {
              const safeText = remaining.slice(0, partialIdx)
              if (safeText) {
                accumulatedReasoning += safeText
                win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: safeText })
                if (isWsConnected) remoteServerService.pushReasoningChunk(safeText)
              }
              pendingBuffer = remaining.slice(partialIdx)
              return
            }
            // All reasoning content
            accumulatedReasoning += remaining
            win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: remaining })
            if (isWsConnected) remoteServerService.pushReasoningChunk(remaining)
            return
          }
          // Emit reasoning before the close tag
          if (closeIdx > 0) {
            const reasoning = remaining.slice(0, closeIdx)
            accumulatedReasoning += reasoning
            win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: reasoning })
            if (isWsConnected) remoteServerService.pushReasoningChunk(reasoning)
          }
          insideThinkTag = false
          remaining = remaining.slice(closeIdx + 8) // skip "</think>"
        }
      }
    }

    const result = streamText({
      model,
      messages: aiMessages,
      abortSignal: currentAbortController.signal,
      temperature,
      maxTokens,
      topP,
      providerOptions,
      ...(hasTools ? { tools, maxSteps: 50, stopWhen: stepCountIs(50) } : {}),
      onChunk({ chunk }) {
        if (chunk.type === 'text-delta') {
          // Prepend any buffered partial tag content
          const text = pendingBuffer + chunk.text
          pendingBuffer = ''
          emitTextOrThinking(text)
        } else if (chunk.type === 'reasoning-delta') {
          accumulatedReasoning += chunk.text
          win.webContents.send('chat:chunk', {
            type: 'reasoning-delta',
            content: chunk.text
          })
          if (isWsConnected) remoteServerService.pushReasoningChunk(chunk.text)
        } else if (chunk.type === 'tool-call') {
          // Track tool call as running
          accumulatedToolCalls.push({
            toolName: chunk.toolName,
            args: chunk.args as Record<string, unknown>,
            status: 'running'
          })
          win.webContents.send('chat:chunk', {
            type: 'tool-call',
            toolName: chunk.toolName,
            toolArgs: chunk.args,
            toolCallId: chunk.toolCallId
          })
          if (isWsConnected) {
            remoteServerService.broadcastToAuthenticatedClients({
              type: 'tool-call',
              toolCallId: chunk.toolCallId,
              toolName: chunk.toolName,
              args: chunk.args
            })
          }
        } else if (chunk.type === 'tool-result') {
          // Tool execution completed — update status
          const toolResult = chunk as { type: 'tool-result'; toolName: string; toolCallId: string; output: unknown }
          const isError = toolResult.output != null && typeof toolResult.output === 'object' && 'error' in (toolResult.output as Record<string, unknown>)
          // Extract search sources from Perplexity Search tool results
          if (toolResult.toolName === 'search' && toolResult.output && typeof toolResult.output === 'object') {
            const output = toolResult.output as Record<string, unknown>
            if (Array.isArray(output.sources)) {
              for (const src of output.sources) {
                if (src && typeof src === 'object' && typeof (src as Record<string, unknown>).url === 'string') {
                  accumulatedSearchSources.push({
                    title: String((src as Record<string, unknown>).title ?? ''),
                    url: String((src as Record<string, unknown>).url),
                    snippet: (src as Record<string, unknown>).snippet ? String((src as Record<string, unknown>).snippet) : undefined
                  })
                }
              }
            }
          }
          const tc = accumulatedToolCalls.find(t => t.toolName === toolResult.toolName && t.status === 'running')
          if (tc) {
            tc.status = isError ? 'error' : 'success'
            if (isError) tc.error = String((toolResult.output as Record<string, unknown>).error)
          }
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: toolResult.toolName,
            toolCallId: toolResult.toolCallId,
            toolIsError: isError
          })
          // Forward tool result to Telegram + WebSocket
          if (isRemoteConnected) {
            telegramBotService.sendToolResult(toolResult.toolName, toolResult.output).catch(() => {})
          }
          if (isWsConnected) {
            remoteServerService.sendToolResult(toolResult.toolName, toolResult.output).catch(() => {})
          }
        }
      }
    })

    // Consume the stream — usage is only available after full consumption
    let fullText = ''
    try {
      await result.text
      // Flush any remaining buffered content (e.g. partial <think> tag that never completed)
      if (pendingBuffer) {
        if (insideThinkTag) {
          accumulatedReasoning += pendingBuffer
          win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: pendingBuffer })
          if (isWsConnected) remoteServerService.pushReasoningChunk(pendingBuffer)
        } else {
          accumulatedText += pendingBuffer
          win.webContents.send('chat:chunk', { type: 'text-delta', content: pendingBuffer })
          if (isRemoteConnected) telegramBotService.pushChunk(pendingBuffer)
          if (isWsConnected) remoteServerService.pushChunk(pendingBuffer)
        }
        pendingBuffer = ''
      }
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

    // End Telegram streaming
    if (isRemoteConnected) {
      await telegramBotService.endStreaming(fullText)
    }
    // End WebSocket streaming
    if (isWsConnected) {
      remoteServerService.endStreaming(fullText)
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
    if (accumulatedToolCalls.length > 0) {
      // Finalize any still-running tool calls as success (in case onStepFinish didn't fire for them)
      contentData.toolCalls = accumulatedToolCalls.map(tc => ({
        ...tc,
        status: tc.status === 'running' ? 'success' : tc.status
      }))
    }
    if (fileOps.length > 0) contentData.fileOperations = fileOps.map(op => ({ ...op, status: 'pending' }))
    if (accumulatedSearchSources.length > 0) contentData.searchSources = accumulatedSearchSources

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
      fileOperations: fileOps.length > 0 ? fileOps.map(op => ({ ...op, status: 'pending' })) : undefined,
      toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls.map(tc => ({
        ...tc,
        status: tc.status === 'running' ? 'success' : tc.status
      })) : undefined,
      searchSources: accumulatedSearchSources.length > 0 ? accumulatedSearchSources : undefined
    })

    currentAbortController = null

  } catch (error: unknown) {
    currentAbortController = null

    // End Telegram streaming on error
    if (isRemoteConnected) {
      await telegramBotService.endStreaming('').catch(() => {})
    }
    // End WebSocket streaming on error
    if (isWsConnected) {
      remoteServerService.endStreaming('')
    }

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

    // Notify Telegram about error (generic message — avoid leaking internal details)
    if (isRemoteConnected) {
      const safeMsg = classified.category === 'fatal' ? 'Erreur d\'authentification API.'
        : classified.category === 'actionable' ? 'Erreur : quota ou limite atteinte.'
        : 'Erreur lors de la generation.'
      telegramBotService.sendMessage(safeMsg).catch(() => {})
    }
    // Notify WebSocket about error
    if (isWsConnected) {
      const safeMsg = classified.category === 'fatal' ? 'Erreur d\'authentification API.'
        : classified.category === 'actionable' ? 'Erreur : quota ou limite atteinte.'
        : 'Erreur lors de la generation.'
      remoteServerService.broadcastToAuthenticatedClients({ type: 'error', message: safeMsg })
    }
  }
}

// ── IPC Registration ──────────────────────────────────────

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, payload) => {
    const parsed = sendMessageSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window found')

    await handleChatMessage({
      ...parsed.data,
      source: 'desktop',
      window: win
    })
  })

  ipcMain.handle('chat:cancel', async () => {
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
    }
  })

  console.log('[IPC] Chat handlers registered')
}
