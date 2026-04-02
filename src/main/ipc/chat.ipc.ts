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
import { buildConversationTools, buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from '../llm/tools'
import { getAllPermissionRules } from '../db/queries/permissions'
import { mcpManagerService } from '../services/mcp-manager.service'
import { telegramBotService } from '../services/telegram-bot.service'
import { remoteServerService } from '../services/remote-server.service'
import { buildMemoryBlock } from '../db/queries/memory-fragments'
import { qdrantMemoryService } from '../services/qdrant-memory.service'
import { buildSemanticMemoryBlock } from '../llm/memory-prompt'
import { buildLibraryContextBlock, type LibraryChunkForPrompt } from '../llm/library-prompt'
import { buildSkillContextBlock } from '../llm/skill-prompt'
import { DEFAULT_SYSTEM_PROMPT } from '../llm/system-prompt'
import { getSkillByName } from '../db/queries/skills'
import { libraryService } from '../services/library.service'
import { getConversationLibraryId, getLibrary } from '../db/queries/libraries'
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
  searchEnabled: z.boolean().optional(),
  libraryId: z.string().optional(),
  skillName: z.string().max(200).optional(),
  skillArgs: z.string().max(10_000).optional(),
  yoloMode: z.boolean().optional()
})

let currentAbortController: AbortController | null = null

// ── Pending Approvals (for tool permission pipeline) ──────
const pendingApprovals = new Map<string, {
  resolve: (decision: 'allow' | 'deny' | 'allow-session') => void
  timeout: NodeJS.Timeout
}>()

const APPROVAL_TIMEOUT_MS = 60_000 // 60 seconds

// ── Tool result extraction helpers ─────────────────────────

const MAX_TOOL_RESULT_LENGTH = 10_000 // 10KB

function extractToolMeta(
  toolName: string,
  output: unknown
): { result: string; resultMeta: Record<string, number> } {
  const raw = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
  const result = raw.length > MAX_TOOL_RESULT_LENGTH
    ? raw.slice(0, MAX_TOOL_RESULT_LENGTH) + '\n[tronqué]'
    : raw
  const meta: Record<string, number> = {}

  if (toolName === 'bash') {
    if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>
      if (typeof obj.exitCode === 'number') meta.exitCode = obj.exitCode
    }
  } else if (toolName === 'readFile') {
    if (typeof output === 'string') {
      meta.lineCount = output.split('\n').length
      meta.byteSize = Buffer.byteLength(output, 'utf8')
    }
  } else if (toolName === 'writeFile') {
    if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>
      if (typeof obj.size === 'number') meta.byteSize = obj.size
    }
  } else if (toolName === 'GrepTool') {
    if (typeof output === 'string') {
      const lines = output.split('\n').filter(l => l.trim())
      meta.matchCount = lines.length
    }
  } else if (toolName === 'listFiles' || toolName === 'GlobTool') {
    if (typeof output === 'string') {
      meta.fileCount = output.split('\n').filter(l => l.trim()).length
    }
  }

  return { result, resultMeta: meta }
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
  searchEnabled?: boolean
  skillName?: string
  skillArgs?: string
  yoloMode?: boolean
  source: 'desktop' | 'telegram' | 'websocket'
  window: BrowserWindow
}

export async function handleChatMessage(params: HandleChatMessageParams): Promise<void> {
  const {
    conversationId, content, modelId, providerId, systemPrompt,
    temperature, maxTokens, topP, thinkingEffort, roleId,
    attachments: attachmentRefs, fileContexts,
    searchEnabled, skillName, skillArgs, yoloMode, source, window: win
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
    // Load conversation to get workspace path
    const conv = getConversation(conversationId)
    const workspacePath = conv?.workspacePath ?? '~/.cruchot/sandbox/'
    // Resolve ~ to home dir
    const resolvedWorkspacePath = workspacePath.startsWith('~/')
      ? workspacePath.replace('~/', `${process.env.HOME ?? '/tmp'}/`)
      : workspacePath

    // Re-validate attachments (extension, size, existence, path confinement) in the main process
    const validatedRefs: AttachmentRef[] = []
    const workspaceRoot = resolvedWorkspacePath
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
    const userContentData: Record<string, unknown> = {}
    if (validatedRefs.length > 0) {
      userContentData.attachments = validatedRefs.map(r => ({ path: r.path, name: r.name, size: r.size, type: r.type, mimeType: r.mimeType }))
    }
    const activeLibId = getConversationLibraryId(conversationId)
    if (activeLibId) {
      userContentData.libraryId = activeLibId
    }

    createMessage({
      conversationId,
      role: 'user',
      content,
      modelId,
      providerId,
      contentData: Object.keys(userContentData).length > 0 ? userContentData : undefined
    })

    // Touch conversation updatedAt
    touchConversation(conversationId)

    // Auto-generate title from first message if title is still default
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

    // Semantic memory recall (if enabled)
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
      } catch (err) {
        console.warn('[Chat] Semantic memory recall failed:', err)
      }
    }

    // Library retrieval (RAG — if a library is attached to the conversation, sticky)
    let libraryContextBlock = ''
    let librarySourcesForMessage: LibraryChunkForPrompt[] = []
    const activeLibraryId = getConversationLibraryId(conversationId)
    if (activeLibraryId) {
      const lib = getLibrary(activeLibraryId)
      const libName = lib?.name ?? 'Referentiel'
      const toolCallId = `library-retrieval-${Date.now()}`

      // Send synthetic tool-call chunk to renderer (shows "Recherche referentiel" in ToolCallBlock)
      win.webContents.send('chat:chunk', {
        type: 'tool-call',
        toolName: 'librarySearch',
        toolArgs: { query: content.slice(0, 120), library: libName },
        toolCallId
      })

      try {
        const chunks = await libraryService.retrieveForChat(activeLibraryId, content)
        if (chunks.length > 0) {
          libraryContextBlock = buildLibraryContextBlock(chunks, libName)
          librarySourcesForMessage = chunks
        }
        // Send synthetic tool-result (success)
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'librarySearch',
          toolCallId,
          toolIsError: false
        })
      } catch (err) {
        console.warn('[Chat] Library retrieval failed:', err)
        // Send synthetic tool-result (error)
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'librarySearch',
          toolCallId,
          toolIsError: true
        })
      }
    }

    // Skill injection (if invoked via /skill-name)
    let skillContextBlock = ''
    if (skillName) {
      const dbSkill = getSkillByName(skillName)
      if (dbSkill && dbSkill.enabled) {
        const toolCallId = `skill-invoke-${Date.now()}`

        // Send synthetic tool-call chunk
        win.webContents.send('chat:chunk', {
          type: 'tool-call',
          toolName: 'skill',
          toolArgs: { name: skillName },
          toolCallId
        })

        try {
          const result = await buildSkillContextBlock(
            skillName,
            skillArgs ?? '',
            resolvedWorkspacePath
          )
          if (result) {
            skillContextBlock = result.block
          }
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: 'skill',
            toolCallId,
            toolIsError: false
          })
        } catch (err) {
          console.warn('[Chat] Skill execution failed:', err)
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: 'skill',
            toolCallId,
            toolIsError: true
          })
        }
      }
    }

    // Build combined system prompt: base + library-context + semantic memory + memory fragments + role prompt
    const memoryBlock = buildMemoryBlock()
    let combinedSystemPrompt = DEFAULT_SYSTEM_PROMPT

    if (libraryContextBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += libraryContextBlock
    }
    if (semanticMemoryBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += semanticMemoryBlock
    }
    if (memoryBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += memoryBlock
    }
    if (systemPrompt) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += systemPrompt
    }
    if (skillContextBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += skillContextBlock
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

    // Build conversation tools with permission pipeline
    const rules = getAllPermissionRules()
    const workspaceTools = buildConversationTools(resolvedWorkspacePath, {
      rules,
      onAskApproval: async (request) => {
        // YOLO mode: auto-accept all tool approvals without prompting
        if (yoloMode) return 'allow'

        const approvalId = crypto.randomUUID()

        return new Promise<'allow' | 'deny' | 'allow-session'>((resolve) => {
          const timeout = setTimeout(() => {
            pendingApprovals.delete(approvalId)
            resolve('deny')
            win.webContents.send('chat:chunk', {
              type: 'tool-approval-resolved',
              approvalId,
              decision: 'deny'
            })
          }, APPROVAL_TIMEOUT_MS)

          pendingApprovals.set(approvalId, { resolve, timeout })

          // Route approval request based on source
          if (source === 'telegram' && isRemoteConnected) {
            telegramBotService.requestApproval(approvalId, request.toolName, request.toolArgs)
              .then(approved => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve(approved ? 'allow' : 'deny')
              })
              .catch(() => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve('deny')
              })
          } else if (source === 'websocket' && isWsConnected) {
            // WebSocket remote — similar pattern
            // For now, deny by default (WebSocket approval not yet wired)
            clearTimeout(timeout)
            pendingApprovals.delete(approvalId)
            resolve('deny')
          } else {
            // Desktop: send approval request via IPC chunk
            win.webContents.send('chat:chunk', {
              type: 'tool-approval',
              approvalId,
              toolName: request.toolName,
              toolArgs: request.toolArgs
            })
          }
        })
      }
    })

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

    // Merge all tools (workspace tools already wrapped by permission pipeline)
    const tools = { ...workspaceTools, ...mcpTools }

    const hasTools = Object.keys(tools).length > 0

    // Inject workspace context + tools system prompt (always — every conversation has a workspace)
    const contextBlock = buildWorkspaceContextBlock(resolvedWorkspacePath)
    const workspacePrompt = contextBlock
      ? contextBlock + '\n\n' + WORKSPACE_TOOLS_PROMPT
      : WORKSPACE_TOOLS_PROMPT

    if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
      aiMessages[0].content += '\n\n' + workspacePrompt
    } else {
      aiMessages.unshift({ role: 'system', content: workspacePrompt })
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
    const accumulatedToolCalls: Array<{
      toolName: string
      args?: Record<string, unknown>
      status: 'running' | 'success' | 'error'
      error?: string
      result?: string
      resultMeta?: {
        duration?: number
        exitCode?: number
        lineCount?: number
        byteSize?: number
        matchCount?: number
        fileCount?: number
      }
    }> = []
    const accumulatedSearchSources: Array<{ title: string; url: string; snippet?: string }> = []
    const toolStartTimes = new Map<string, number>() // toolCallId → Date.now()

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
      ...(hasTools ? { tools, maxSteps: 200, stopWhen: stepCountIs(200) } : {}),
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
          // Track tool call as running + record start time
          toolStartTimes.set(chunk.toolCallId, Date.now())
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
          const { result: toolResultText, resultMeta } = extractToolMeta(toolResult.toolName, toolResult.output)
          // Compute per-tool duration
          const toolStart = toolStartTimes.get(toolResult.toolCallId)
          if (toolStart) {
            resultMeta.duration = Date.now() - toolStart
            toolStartTimes.delete(toolResult.toolCallId)
          }
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
            tc.result = toolResultText
            tc.resultMeta = Object.keys(resultMeta).length > 0 ? resultMeta : undefined
          }
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: toolResult.toolName,
            toolCallId: toolResult.toolCallId,
            toolIsError: isError,
            toolResult: toolResultText,
            toolResultMeta: Object.keys(resultMeta).length > 0 ? resultMeta : undefined
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
    if (librarySourcesForMessage.length > 0) {
      contentData.librarySources = librarySourcesForMessage.map(s => ({
        id: s.id,
        sourceId: s.sourceId,
        libraryId: s.libraryId,
        libraryName: s.libraryName,
        filename: s.filename,
        heading: s.heading,
        lineStart: s.lineStart,
        lineEnd: s.lineEnd,
        chunkPreview: s.contentPreview,
        score: s.score
      }))
    }

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

    // Ingest messages into semantic memory (fire-and-forget)
    if (qdrantMemoryService.getStatus() === 'ready') {
      const projectId = conv?.projectId ?? null
      qdrantMemoryService.ingest({
        id: nanoid(),
        conversationId,
        projectId,
        role: 'user',
        content,
        modelId: null,
        createdAt: new Date()
      }).catch(() => {})
      qdrantMemoryService.ingest({
        id: savedMessage.id,
        conversationId,
        projectId,
        role: 'assistant',
        content: fullText,
        modelId,
        createdAt: new Date()
      }).catch(() => {})
    }

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
      searchSources: accumulatedSearchSources.length > 0 ? accumulatedSearchSources : undefined,
      semanticRecallCount: qdrantMemoryService.getLastRecallCount() || undefined,
      librarySourcesCount: librarySourcesForMessage.length > 0 ? librarySourcesForMessage.length : undefined
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

  ipcMain.handle('chat:approve-tool', async (_event, payload: unknown) => {
    const schema = z.object({
      approvalId: z.string().min(1),
      decision: z.enum(['allow', 'deny', 'allow-session'])
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid approve-tool payload')

    const { approvalId, decision } = parsed.data
    const pending = pendingApprovals.get(approvalId)
    if (pending) {
      clearTimeout(pending.timeout)
      pendingApprovals.delete(approvalId)
      pending.resolve(decision)
    }
  })

  console.log('[IPC] Chat handlers registered')
}
