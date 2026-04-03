import { ipcMain, BrowserWindow } from 'electron'
import os from 'node:os'
import { z } from 'zod'
import { streamText, tool, NoOutputGeneratedError, stepCountIs } from 'ai'
import { nanoid } from 'nanoid'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { validateAttachment, processAttachments, buildContentParts, MAX_FILES_PER_MESSAGE, type AttachmentRef } from '../llm/attachments'
import { parseFileOperations } from '../llm/file-operations'
import { ThinkTagParser } from '../llm/think-tag-parser'
import { parsePlanMarkers, parseStepMarker, stripPlanMarkers } from '../llm/plan-parser'
import { buildPlanPromptBlock } from '../llm/plan-prompt'
import type { PlanData, PlanStep } from '../../preload/types'
import { buildConversationTools, buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT, wrapExternalTool } from '../llm/tools'
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
  planMode: z.boolean().optional(),
})

let currentAbortController: AbortController | null = null

// ── Pending Approvals (for tool permission pipeline) ──────
const pendingApprovals = new Map<string, {
  resolve: (decision: 'allow' | 'deny' | 'allow-session') => void
  timeout: NodeJS.Timeout
}>()

// YOLO mode state — main process owns this, not renderer
const yoloModeByConversation = new Map<string, boolean>()

// Plan mode state
const forcedPlanMode = new Map<string, boolean>()
const pendingPlanApprovals = new Map<string, {
  resolve: (result: { decision: 'approved' | 'cancelled'; steps: PlanStep[] }) => void
  messageId: string
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

// ── Phase interfaces ──────────────────────────────────────

interface ToolCallRecord {
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
}

interface ChatPrepareResult {
  conversationId: string
  content: string
  modelId: string
  providerId: string
  roleId?: string
  source: 'desktop' | 'telegram' | 'websocket'
  model: ReturnType<typeof getModel>
  aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image?: string; mimeType?: string }> }>
  tools: Record<string, unknown>
  hasTools: boolean
  providerOptions: ReturnType<typeof buildThinkingProviderOptions> | undefined
  temperature?: number
  maxTokens?: number
  topP?: number
  isRemoteConnected: boolean
  isWsConnected: boolean
  startTime: number
  conv: ReturnType<typeof getConversation>
  librarySourcesForMessage: LibraryChunkForPrompt[]
  // Execution-phase context (needed to rebuild tools after plan approval)
  resolvedWorkspacePath: string
  rules: import('../llm/permission-engine').PermissionRule[]
  onAskApproval: (request: { toolName: string; toolArgs: Record<string, unknown> }) => Promise<'allow' | 'deny' | 'allow-session'>
  systemPromptBase: string
}

interface ChatStreamResult {
  fullText: string
  accumulatedReasoning: string
  usage: { inputTokens: number; outputTokens: number } | null
  accumulatedToolCalls: ToolCallRecord[]
  accumulatedSearchSources: Array<{ title: string; url: string; snippet?: string }>
  responseTimeMs: number
  planData: PlanData | null
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
  planMode?: boolean
  source: 'desktop' | 'telegram' | 'websocket'
  window: BrowserWindow
}

// ── Phase 1: Prepare ─────────────────────────────────────

async function prepareChat(params: HandleChatMessageParams, win: BrowserWindow): Promise<ChatPrepareResult> {
  const {
    conversationId, content, modelId, providerId, systemPrompt,
    temperature, maxTokens, topP, thinkingEffort, roleId,
    attachments: attachmentRefs, fileContexts,
    searchEnabled, skillName, skillArgs, planMode, source
  } = params

  const isRemoteConnected = telegramBotService.getStatus() === 'connected'
  const isWsConnected = remoteServerService.getStatus() === 'running'
    && remoteServerService.getConnectedClients().length > 0

  const startTime = Date.now()

  // Load conversation to get workspace path
  const conv = getConversation(conversationId)
  const workspacePath = conv?.workspacePath ?? '~/.cruchot/sandbox/'
  // Resolve ~ to home dir
  const resolvedWorkspacePath = workspacePath.startsWith('~/')
    ? workspacePath.replace('~/', `${os.homedir()}/`)
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

  // ── Parallel pre-flight enrichments (M1) ─────────────────
  // All 4 operations are independent — run them concurrently to minimise TTFT.
  const [attachResult, recallResult, libraryResult, skillResult] = await Promise.allSettled([

    // 1. Attachment processing (extract text, encode images)
    (async (): Promise<Awaited<ReturnType<typeof processAttachments>>> => {
      if (validatedRefs.length === 0) return []
      return processAttachments(validatedRefs)
    })(),

    // 2. Semantic memory recall (Qdrant)
    (async (): Promise<{ block: string }> => {
      if (qdrantMemoryService.getStatus() !== 'ready') return { block: '' }
      const recalls = await qdrantMemoryService.recall(content, {
        topK: 5,
        scoreThreshold: 0.35,
        projectId: conv?.projectId ?? null,
        conversationId
      })
      return { block: recalls.length > 0 ? buildSemanticMemoryBlock(recalls) : '' }
    })(),

    // 3. Library retrieval (RAG)
    (async (): Promise<{ block: string; sources: LibraryChunkForPrompt[] }> => {
      const activeLibraryId = getConversationLibraryId(conversationId)
      if (!activeLibraryId) return { block: '', sources: [] }

      const lib = getLibrary(activeLibraryId)
      const libName = lib?.name ?? 'Referentiel'
      const toolCallId = `library-retrieval-${Date.now()}`

      win.webContents.send('chat:chunk', {
        type: 'tool-call',
        toolName: 'librarySearch',
        toolArgs: { query: content.slice(0, 120), library: libName },
        toolCallId
      })

      try {
        const chunks = await libraryService.retrieveForChat(activeLibraryId, content)
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'librarySearch',
          toolCallId,
          toolIsError: false
        })
        if (chunks.length > 0) {
          return { block: buildLibraryContextBlock(chunks, libName), sources: chunks }
        }
        return { block: '', sources: [] }
      } catch (err) {
        console.warn('[Chat] Library retrieval failed:', err)
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'librarySearch',
          toolCallId,
          toolIsError: true
        })
        return { block: '', sources: [] }
      }
    })(),

    // 4. Skill context build
    (async (): Promise<{ block: string }> => {
      if (!skillName) return { block: '' }
      const dbSkill = getSkillByName(skillName)
      if (!dbSkill || !dbSkill.enabled) return { block: '' }

      const toolCallId = `skill-invoke-${Date.now()}`
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
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'skill',
          toolCallId,
          toolIsError: false
        })
        return { block: result?.block ?? '' }
      } catch (err) {
        console.warn('[Chat] Skill execution failed:', err)
        win.webContents.send('chat:chunk', {
          type: 'tool-result',
          toolName: 'skill',
          toolCallId,
          toolIsError: true
        })
        return { block: '' }
      }
    })()
  ])

  // Log any rejected enrichments (should not happen — each IIFE handles its own errors)
  for (const r of [attachResult, recallResult, libraryResult, skillResult]) {
    if (r.status === 'rejected') console.error('[Chat] Enrichment failed:', r.reason)
  }

  // Extract results with graceful fallbacks
  const processedAttachments = attachResult.status === 'fulfilled' ? attachResult.value : []
  const semanticMemoryBlock = recallResult.status === 'fulfilled' ? recallResult.value.block : ''
  const libraryContextBlock = libraryResult.status === 'fulfilled' ? libraryResult.value.block : ''
  const librarySourcesForMessage: LibraryChunkForPrompt[] = libraryResult.status === 'fulfilled' ? libraryResult.value.sources : []
  const skillContextBlock = skillResult.status === 'fulfilled' ? skillResult.value.block : ''

  const { imageParts, inlineText } = buildContentParts(processedAttachments)

  // Load conversation history from DB
  const dbMessages = getMessagesForConversation(conversationId)
  const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: string; text?: string; image?: string; mimeType?: string }> }> = []

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
  // Plan instructions injection — only when tools are available
  {
    const isForced = forcedPlanMode.get(conversationId) || planMode
    // hasTools not yet computed here, but tools depend on workspace — always true in practice
    // We inject plan prompt whenever tools exist; the gating on hasTools happens below after tool building
    const planPromptBlock = buildPlanPromptBlock(isForced ? 'forced' : 'default')
    if (planPromptBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += planPromptBlock
    }
    // Reset one-shot forced mode after use
    if (forcedPlanMode.get(conversationId)) {
      forcedPlanMode.delete(conversationId)
    }
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

  // Shared approval callback — used by both workspace tools and MCP tools
  const onAskApproval = async (request: { toolName: string; toolArgs: Record<string, unknown> }): Promise<'allow' | 'deny' | 'allow-session'> => {
    // YOLO mode: auto-accept all tool approvals without prompting
    if (yoloModeByConversation.get(conversationId)) return 'allow'

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

  // C1: Pass planMode to gate write tools during forced plan proposal phase
  const planModeActive = forcedPlanMode.get(conversationId) || planMode
  const workspaceTools = buildConversationTools(resolvedWorkspacePath, {
    rules,
    conversationId,
    onAskApproval,
    planMode: planModeActive ? 'proposed' : undefined
  })

  // Build MCP tools — wrapped with same permission pipeline as workspace tools
  let mcpTools: Record<string, unknown> = {}
  try {
    const rawMcpTools = await mcpManagerService.getToolsForChat(conv?.projectId)
    for (const [name, tool] of Object.entries(rawMcpTools)) {
      mcpTools[name] = wrapExternalTool(name, tool, resolvedWorkspacePath, {
        rules,
        conversationId,
        onAskApproval,
        planMode: planModeActive ? 'proposed' : undefined
      })
    }
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
        const rawSearchTool = perplexitySearch({ apiKey: perplexityApiKey })
        mcpTools = { ...mcpTools, search: wrapExternalTool('search', rawSearchTool, resolvedWorkspacePath, { rules, conversationId, onAskApproval, planMode: planModeActive ? 'proposed' : undefined }) }
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

  // Capture base system prompt (from aiMessages[0]) for execution-phase prompt building
  const systemPromptBase = (aiMessages.length > 0 && aiMessages[0].role === 'system' && typeof aiMessages[0].content === 'string')
    ? aiMessages[0].content
    : ''

  return {
    conversationId,
    content,
    modelId,
    providerId,
    roleId,
    source,
    model,
    aiMessages,
    tools,
    hasTools,
    providerOptions,
    temperature,
    maxTokens,
    topP,
    isRemoteConnected,
    isWsConnected,
    startTime,
    conv,
    librarySourcesForMessage,
    resolvedWorkspacePath,
    rules,
    onAskApproval,
    systemPromptBase
  }
}

// ── Phase 2: Stream ──────────────────────────────────────

async function streamChat(
  prepared: ChatPrepareResult,
  win: BrowserWindow,
  abortSignal: AbortSignal
): Promise<ChatStreamResult> {
  const {
    conversationId, model, aiMessages, tools, hasTools, providerOptions,
    temperature, maxTokens, topP,
    isRemoteConnected, isWsConnected, startTime
  } = prepared

  // Accumulate text during streaming (needed because with maxSteps, result.text only has the last step)
  let accumulatedReasoning = ''
  let accumulatedText = ''
  const accumulatedToolCalls: ToolCallRecord[] = []
  const accumulatedSearchSources: Array<{ title: string; url: string; snippet?: string }> = []
  const toolStartTimes = new Map<string, number>() // toolCallId -> Date.now()

  // Plan mode state for this stream
  let planEmitted = false
  let inPlanBlock = false         // Bug 4: buffer plan text to avoid marker leaking
  let approvedPlanData: PlanData | null = null

  // Bug 2: Two-phase abort — abort the first stream when a full plan is detected
  // so tools don't execute before user approval
  const planDetectAbortController = new AbortController()
  const firstStreamSignal = AbortSignal.any([abortSignal, planDetectAbortController.signal])

  // Token batching — accumulate text-delta chunks, flush every 50ms
  let batchBuffer = ''
  let batchTimer: ReturnType<typeof setInterval> | null = null
  const BATCH_INTERVAL_MS = 50

  function flushBatch() {
    if (batchBuffer.length > 0) {
      // Parse step markers from the batch BEFORE stripping (50ms buffer captures complete markers)
      const stepResults = parseStepMarker(batchBuffer)
      for (const sr of stepResults) {
        win.webContents.send('chat:chunk', {
          type: 'plan-step',
          stepIndex: sr.index,
          stepStatus: sr.status
        })
      }
      // Strip ALL plan/step markers from visible text
      const cleaned = stripPlanMarkers(batchBuffer)
      if (cleaned.length > 0) {
        win.webContents.send('chat:chunk', { type: 'text-delta', content: cleaned })
        if (isRemoteConnected) telegramBotService.pushChunk(cleaned)
        if (isWsConnected) remoteServerService.pushChunk(cleaned)
      }
      batchBuffer = ''
    }
  }

  function startBatchTimer() {
    if (!batchTimer) {
      batchTimer = setInterval(flushBatch, BATCH_INTERVAL_MS)
    }
  }

  function stopBatchTimer() {
    if (batchTimer) {
      clearInterval(batchTimer)
      batchTimer = null
    }
    flushBatch()
  }

  // Parser for <think>...</think> tags from open-source models (LM Studio, Ollama, etc.)
  const thinkParser = new ThinkTagParser()

  try {
    const result = streamText({
      model,
      messages: aiMessages,
      abortSignal: firstStreamSignal, // Bug 2: combined signal (user cancel + plan-detect abort)
      temperature,
      maxTokens,
      topP,
      providerOptions,
      ...(hasTools ? { tools, maxSteps: 200, stopWhen: stepCountIs(200) } : {}),
      onChunk({ chunk }) {
        if (chunk.type === 'text-delta') {
          const segments = thinkParser.parse(chunk.text)
          for (const seg of segments) {
            if (seg.type === 'text') {
              // Keep raw text for plan block detection
              accumulatedText += seg.content

              // Detect plan block start — buffer markers instead of sending to renderer
              if (!inPlanBlock && accumulatedText.includes('[PLAN:start')) {
                inPlanBlock = true
                flushBatch()
              }

              // Check for complete plan block (step markers are parsed in flushBatch)
              if (!planEmitted && accumulatedText.includes('[PLAN:end]')) {
                const planData = parsePlanMarkers(accumulatedText)
                if (planData) {
                  planEmitted = true
                  inPlanBlock = false
                  // Discard buffer (contains plan markers) — don't flush to renderer
                  batchBuffer = ''
                  win.webContents.send('chat:chunk', { type: 'plan-proposed', plan: planData })

                  // Bug 2: Abort stream immediately for full plans (non-YOLO)
                  // to prevent tools from executing before user approval
                  if (planData.level === 'full' && !yoloModeByConversation.get(conversationId)) {
                    planDetectAbortController.abort()
                  }
                }
              }

              // When inside a plan block, don't send marker text to renderer.
              if (!inPlanBlock) {
                // Add raw text to buffer — flushBatch() handles marker stripping
                batchBuffer += seg.content
                startBatchTimer()
              }
            } else {
              flushBatch()
              accumulatedReasoning += seg.content
              win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: seg.content })
              if (isWsConnected) remoteServerService.pushReasoningChunk(seg.content)
            }
          }
        } else if (chunk.type === 'reasoning-delta') {
          flushBatch() // Flush text buffer before non-text chunk
          accumulatedReasoning += chunk.text
          win.webContents.send('chat:chunk', {
            type: 'reasoning-delta',
            content: chunk.text
          })
          if (isWsConnected) remoteServerService.pushReasoningChunk(chunk.text)
        } else if (chunk.type === 'tool-call') {
          flushBatch() // Flush text buffer before non-text chunk
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
          flushBatch() // Flush text buffer before non-text chunk
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
    let planDetectAborted = false // Bug 2: track whether we aborted for plan detection
    // Mutable usage accumulator — written by both first stream and execution phase
    let mergedUsage: { inputTokens?: number; outputTokens?: number } | null = null

    try {
      await result.text
    } catch (firstStreamErr) {
      // Bug 2: Distinguish plan-detect abort from user cancel
      if (firstStreamErr instanceof Error && firstStreamErr.name === 'AbortError') {
        if (planDetectAbortController.signal.aborted && !abortSignal.aborted) {
          // Plan-detect abort — this is expected, not an error
          planDetectAborted = true
        } else {
          // User cancel — rethrow to be handled by outer catch
          throw firstStreamErr
        }
      } else if (firstStreamErr instanceof NoOutputGeneratedError) {
        if (firstStreamErr.cause) throw firstStreamErr.cause
        // Genuine no-output — continue
      } else {
        throw firstStreamErr
      }
    }

    try {
      // Flush any remaining buffered content (e.g. partial <think> tag that never completed)
      const remaining = thinkParser.flush()
      for (const seg of remaining) {
        if (seg.type === 'text') {
          accumulatedText += seg.content
          if (!inPlanBlock) {
            batchBuffer += seg.content
          }
        } else {
          accumulatedReasoning += seg.content
          win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: seg.content })
          if (isWsConnected) remoteServerService.pushReasoningChunk(seg.content)
        }
      }

      // Final plan block check (in case [PLAN:end] arrived in the last flush)
      if (!planEmitted && accumulatedText.includes('[PLAN:end]')) {
        const planData = parsePlanMarkers(accumulatedText)
        if (planData) {
          planEmitted = true
          inPlanBlock = false
          flushBatch()
          win.webContents.send('chat:chunk', { type: 'plan-proposed', plan: planData })
        }
      }

      // Stop batch timer and flush any remaining batched text
      stopBatchTimer()

      // Plan approval gate — block for full-level plans unless YOLO mode
      if (planEmitted) {
        const planData = parsePlanMarkers(accumulatedText)
        if (planData && planData.level === 'full' && !yoloModeByConversation.get(conversationId)) {
          // I3: Add 5-minute timeout to plan approval
          // Bug 3: Also cancel approval if user clicks STOP (abort signal)
          const approvalResult = await new Promise<{ decision: 'approved' | 'cancelled'; steps: PlanStep[] }>((resolve) => {
            const timeout = setTimeout(() => {
              pendingPlanApprovals.delete(conversationId)
              resolve({ decision: 'cancelled', steps: [] })
            }, 5 * 60 * 1000) // 5 minutes

            // Listen for user abort during plan approval wait
            const onAbort = () => {
              clearTimeout(timeout)
              pendingPlanApprovals.delete(conversationId)
              resolve({ decision: 'cancelled', steps: [] })
            }
            if (abortSignal.aborted) {
              onAbort()
              return
            }
            abortSignal.addEventListener('abort', onAbort, { once: true })

            pendingPlanApprovals.set(conversationId, {
              resolve: (result) => {
                clearTimeout(timeout)
                abortSignal.removeEventListener('abort', onAbort)
                resolve(result)
              },
              messageId: ''
            })
          })
          pendingPlanApprovals.delete(conversationId)

          if (approvalResult.decision === 'cancelled') {
            planData.status = 'cancelled'
            // Notify renderer of cancellation
            win.webContents.send('chat:chunk', { type: 'plan-proposed', plan: { ...planData } })
          } else {
            planData.status = 'approved'
            planData.approvedAt = Math.floor(Date.now() / 1000)
            planData.steps = approvalResult.steps.length > 0 ? approvalResult.steps : planData.steps
            approvedPlanData = planData

            // Notify renderer that plan was approved (hides Valider/Annuler buttons)
            win.webContents.send('chat:chunk', { type: 'plan-proposed', plan: { ...planData } })

            // C2: Launch execution phase — second streamText with write tools unlocked
            const executionPrompt = buildPlanPromptBlock('execution', planData)
            if (executionPrompt) {
              // Bug 5: Auto-approve all tools during execution — user already validated the plan
              const execOnAskApproval = async (_request: { toolName: string; toolArgs: Record<string, unknown> }): Promise<'allow' | 'deny' | 'allow-session'> => {
                return 'allow' as const
              }

              // Rebuild tools with planMode: 'approved' (write tools unlocked) + auto-approve
              const { resolvedWorkspacePath, rules } = prepared
              const execWorkspaceTools = buildConversationTools(resolvedWorkspacePath, {
                rules,
                conversationId,
                onAskApproval: execOnAskApproval,
                planMode: 'approved'
              })

              // Build MCP tools for execution (also unlocked + auto-approve)
              let execMcpTools: Record<string, unknown> = {}
              try {
                const rawMcpTools = await mcpManagerService.getToolsForChat(prepared.conv?.projectId)
                for (const [name, t] of Object.entries(rawMcpTools)) {
                  execMcpTools[name] = wrapExternalTool(name, t, resolvedWorkspacePath, {
                    rules,
                    conversationId,
                    onAskApproval: execOnAskApproval,
                    planMode: 'approved'
                  })
                }
              } catch { /* MCP tools unavailable during execution — continue without */ }

              const execTools = { ...execWorkspaceTools, ...execMcpTools }
              const execHasTools = Object.keys(execTools).length > 0

              // Update plan status to running and notify renderer
              planData.status = 'running'
              win.webContents.send('chat:chunk', { type: 'plan-proposed', plan: { ...planData } })
              win.webContents.send('chat:chunk', {
                type: 'plan-step',
                stepIndex: planData.steps.filter(s => s.enabled)[0]?.id ?? 1,
                stepStatus: 'running'
              })

              // Build execution system prompt (base + execution block)
              const execSystemPrompt = prepared.systemPromptBase + '\n\n' + executionPrompt

              // Build execution messages: original conversation + plan response + execution instruction
              const execMessages: typeof aiMessages = [
                { role: 'system', content: execSystemPrompt },
                ...aiMessages.filter(m => m.role !== 'system'),
                { role: 'assistant' as const, content: accumulatedText },
                { role: 'user' as const, content: 'Plan approuve. Execute-le maintenant.' }
              ]

              // Second streamText for execution phase
              const execResult = streamText({
                model,
                messages: execMessages,
                abortSignal,
                temperature,
                maxTokens,
                topP,
                providerOptions,
                ...(execHasTools ? { tools: execTools, maxSteps: 200, stopWhen: stepCountIs(200) } : {}),
                onChunk({ chunk: execChunk }) {
                  if (execChunk.type === 'text-delta') {
                    const segments = thinkParser.parse(execChunk.text)
                    for (const seg of segments) {
                      if (seg.type === 'text') {
                        accumulatedText += seg.content

                        // Add raw text to buffer — flushBatch() handles marker parsing + stripping
                        batchBuffer += seg.content
                        startBatchTimer()
                      } else {
                        flushBatch()
                        accumulatedReasoning += seg.content
                        win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: seg.content })
                        if (isWsConnected) remoteServerService.pushReasoningChunk(seg.content)
                      }
                    }
                  } else if (execChunk.type === 'tool-call') {
                    flushBatch()
                    toolStartTimes.set(execChunk.toolCallId, Date.now())
                    accumulatedToolCalls.push({
                      toolName: execChunk.toolName,
                      args: execChunk.args as Record<string, unknown>,
                      status: 'running'
                    })
                    win.webContents.send('chat:chunk', {
                      type: 'tool-call',
                      toolName: execChunk.toolName,
                      toolArgs: execChunk.args,
                      toolCallId: execChunk.toolCallId
                    })
                  } else if (execChunk.type === 'tool-result') {
                    const toolResult = execChunk as { type: 'tool-result'; toolName: string; toolCallId: string; output: unknown }
                    const isError = toolResult.output != null && typeof toolResult.output === 'object' && 'error' in (toolResult.output as Record<string, unknown>)
                    const { result: toolResultText, resultMeta } = extractToolMeta(toolResult.toolName, toolResult.output)
                    const toolStart = toolStartTimes.get(toolResult.toolCallId)
                    if (toolStart) {
                      resultMeta.duration = Date.now() - toolStart
                      toolStartTimes.delete(toolResult.toolCallId)
                    }
                    const tc = accumulatedToolCalls.find(t => t.toolName === toolResult.toolName && t.status === 'running')
                    if (tc) {
                      tc.status = isError ? 'error' : 'success'
                      if (isError) tc.error = String((toolResult.output as Record<string, unknown>).error)
                      tc.result = toolResultText
                      tc.resultMeta = Object.keys(resultMeta).length > 0 ? resultMeta : undefined
                    }
                    flushBatch()
                    win.webContents.send('chat:chunk', {
                      type: 'tool-result',
                      toolName: toolResult.toolName,
                      toolCallId: toolResult.toolCallId,
                      toolIsError: isError,
                      toolResult: toolResultText,
                      toolResultMeta: Object.keys(resultMeta).length > 0 ? resultMeta : undefined
                    })
                    if (isRemoteConnected) {
                      telegramBotService.sendToolResult(toolResult.toolName, toolResult.output).catch(() => {})
                    }
                    if (isWsConnected) {
                      remoteServerService.sendToolResult(toolResult.toolName, toolResult.output).catch(() => {})
                    }
                  }
                }
              })

              // Consume execution stream
              try {
                await execResult.text

                // Flush remaining from thinkParser
                const remaining = thinkParser.flush()
                for (const seg of remaining) {
                  if (seg.type === 'text') {
                    accumulatedText += seg.content
                    batchBuffer += seg.content
                  } else {
                    accumulatedReasoning += seg.content
                    win.webContents.send('chat:chunk', { type: 'reasoning-delta', content: seg.content })
                  }
                }
                stopBatchTimer()

                // Merge execution usage into the shared accumulator
                try {
                  const execUsage = await execResult.usage
                  if (execUsage) {
                    mergedUsage = {
                      inputTokens: ((mergedUsage?.inputTokens) ?? 0) + (execUsage.inputTokens ?? 0),
                      outputTokens: ((mergedUsage?.outputTokens) ?? 0) + (execUsage.outputTokens ?? 0)
                    }
                  }
                } catch {
                  // Execution usage unavailable — continue with what we have
                }
              } catch (execErr) {
                stopBatchTimer()
                if (execErr instanceof NoOutputGeneratedError) {
                  if (execErr.cause) throw execErr.cause
                } else {
                  throw execErr
                }
              }

              // C3: Mark plan as done after execution
              planData.status = 'done'
              planData.completedAt = Math.floor(Date.now() / 1000)
              approvedPlanData = planData
              win.webContents.send('chat:chunk', { type: 'plan-done' })
            }
          }
        } else if (planData) {
          // Light plan or YOLO mode — auto-approve
          planData.status = 'approved'
          planData.approvedAt = Math.floor(Date.now() / 1000)
          approvedPlanData = planData
        }
      }

      fullText = stripPlanMarkers(accumulatedText)
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
    // When the first stream was aborted for plan detection, result.usage may reject — handle gracefully
    try {
      const firstUsage = await result.usage
      if (firstUsage) {
        mergedUsage = {
          inputTokens: ((mergedUsage?.inputTokens) ?? 0) + (firstUsage.inputTokens ?? 0),
          outputTokens: ((mergedUsage?.outputTokens) ?? 0) + (firstUsage.outputTokens ?? 0)
        }
      }
    } catch {
      // Aborted stream — usage unavailable from first phase (execution phase usage is already in mergedUsage)
    }
    const responseTimeMs = Date.now() - startTime

    return {
      fullText,
      accumulatedReasoning,
      usage: mergedUsage ? { inputTokens: mergedUsage.inputTokens ?? 0, outputTokens: mergedUsage.outputTokens ?? 0 } : null,
      accumulatedToolCalls,
      accumulatedSearchSources,
      responseTimeMs,
      planData: approvedPlanData
    }
  } finally {
    // Ensure batch timer is always cleaned up (covers error/abort paths)
    stopBatchTimer()
  }
}

// ── Phase 3: Finalize ────────────────────────────────────

async function finalizeChat(
  prepared: ChatPrepareResult,
  streamResult: ChatStreamResult,
  win: BrowserWindow
): Promise<void> {
  const {
    conversationId, content, modelId, providerId, roleId, conv,
    librarySourcesForMessage
  } = prepared
  const {
    fullText, accumulatedReasoning, usage, accumulatedToolCalls,
    accumulatedSearchSources, responseTimeMs, planData
  } = streamResult

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
  if (planData) contentData.plan = planData
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
}

// ── Orchestrator ─────────────────────────────────────────

export async function handleChatMessage(params: HandleChatMessageParams): Promise<void> {
  const win = params.window

  // Abort any existing stream
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()

  try {
    const prepared = await prepareChat(params, win)
    const streamResult = await streamChat(prepared, win, currentAbortController.signal)
    await finalizeChat(prepared, streamResult, win)
    currentAbortController = null
  } catch (error: unknown) {
    currentAbortController = null

    const isRemoteConnected = telegramBotService.getStatus() === 'connected'
    const isWsConnected = remoteServerService.getStatus() === 'running'
      && remoteServerService.getConnectedClients().length > 0

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
  ipcMain.handle('chat:set-yolo-mode', async (_event, payload: unknown) => {
    const parsed = z.object({
      conversationId: z.string().min(1),
      enabled: z.boolean()
    }).safeParse(payload)
    if (!parsed.success) throw new Error('Payload invalide')
    yoloModeByConversation.set(parsed.data.conversationId, parsed.data.enabled)
  })

  ipcMain.handle('chat:get-yolo-mode', async (_event, payload: unknown) => {
    const parsed = z.object({ conversationId: z.string().min(1) }).safeParse(payload)
    if (!parsed.success) throw new Error('Payload invalide')
    return yoloModeByConversation.get(parsed.data.conversationId) ?? false
  })

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

  // ── Plan mode handlers ──────────────────────────────────

  ipcMain.handle('chat:approvePlan', async (_event, payload: unknown) => {
    const schema = z.object({
      conversationId: z.string().min(1),
      messageId: z.string(),
      decision: z.enum(['approved', 'cancelled']),
      steps: z.array(z.object({
        id: z.number(),
        label: z.string(),
        tools: z.array(z.string()).optional(),
        status: z.enum(['pending', 'running', 'done', 'skipped', 'failed']),
        enabled: z.boolean()
      }))
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid approvePlan payload')

    const pending = pendingPlanApprovals.get(parsed.data.conversationId)
    if (pending) {
      pending.resolve({ decision: parsed.data.decision, steps: parsed.data.steps })
    }
  })

  ipcMain.handle('chat:setPlanMode', async (_event, payload: unknown) => {
    const parsed = z.object({
      conversationId: z.string().min(1),
      forced: z.boolean()
    }).safeParse(payload)
    if (!parsed.success) throw new Error('Invalid setPlanMode payload')

    if (parsed.data.forced) {
      forcedPlanMode.set(parsed.data.conversationId, true)
    } else {
      forcedPlanMode.delete(parsed.data.conversationId)
    }
  })

  ipcMain.handle('chat:updatePlanStep', async (_event, payload: unknown) => {
    const schema = z.object({
      conversationId: z.string().min(1),
      messageId: z.string(),
      stepIndex: z.number(),
      action: z.enum(['retry', 'skip', 'abort'])
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid updatePlanStep payload')

    const pending = pendingPlanApprovals.get(parsed.data.conversationId)
    if (pending) {
      if (parsed.data.action === 'abort') {
        pending.resolve({ decision: 'cancelled', steps: [] })
      } else if (parsed.data.action === 'skip') {
        pending.resolve({ decision: 'approved', steps: [] })
      }
      // I4: retry re-approves the plan to allow the failed step to be re-attempted
      if (parsed.data.action === 'retry') {
        pending.resolve({ decision: 'approved', steps: [] })
      }
    }
  })

  console.log('[IPC] Chat handlers registered')
}
