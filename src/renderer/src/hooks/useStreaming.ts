import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useUiStore } from '@/stores/ui.store'
import { useSemanticMemoryStore } from '@/stores/semantic-memory.store'

interface StreamChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'tool-result' | 'tool-approval' | 'tool-approval-resolved' | 'finish' | 'error'
  content?: string
  modelId?: string
  providerId?: string
  messageId?: string
  conversationId?: string // Present on chunks from scheduled task executor
  error?: string
  category?: string
  suggestion?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolCallId?: string
  toolIsError?: boolean
  toolResult?: string
  toolResultMeta?: {
    duration?: number
    exitCode?: number
    lineCount?: number
    byteSize?: number
    matchCount?: number
    fileCount?: number
  }
  approvalId?: string
  decision?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  cost?: number
  responseTimeMs?: number
  fileOperations?: Array<{ id: string; type: string; path: string; content?: string; status: string }>
  toolCalls?: Array<{ toolName: string; args?: Record<string, unknown>; status: string; error?: string }>
  searchSources?: Array<{ title: string; url: string; snippet?: string }>
  semanticRecallCount?: number
}

/** Human-readable labels for workspace tool calls */
const TOOL_LABELS: Record<string, string> = {
  bash: 'Commande shell',
  readFile: 'Lecture du fichier',
  writeFile: 'Ecriture du fichier',
  FileEdit: 'Modification du fichier',
  listFiles: 'Exploration des fichiers',
  GrepTool: 'Recherche dans les fichiers',
  GlobTool: 'Recherche de fichiers',
  WebFetchTool: 'Acces web',
  search: 'Recherche web'
}

/** Parse MCP tool name (prefix__toolName) into readable label */
function getToolLabel(toolName: string): string {
  if (TOOL_LABELS[toolName]) return TOOL_LABELS[toolName]
  // MCP tools: "servername__toolname" → "[servername] toolname"
  const mcpMatch = toolName.match(/^([^_]+)__(.+)$/)
  if (mcpMatch) {
    return `[${mcpMatch[1]}] ${mcpMatch[2]}`
  }
  return toolName
}

/**
 * Hook that listens for streaming chunks from the main process
 * and updates the messages store in real-time.
 *
 * Stream phases:
 *  1. start         → create placeholder message (processing spinner)
 *  2. tool-call     → LLM calls workspace tool (reading files, etc.)
 *  3. reasoning-delta → accumulate reasoning text (thinking phase)
 *  4. text-delta    → accumulate response text (generating phase)
 *  5. finish/error  → finalize
 */
export function useStreaming() {
  const addMessage = useMessagesStore((s) => s.addMessage)
  const appendToMessage = useMessagesStore((s) => s.appendToMessage)
  const appendReasoning = useMessagesStore((s) => s.appendReasoning)
  const addToolCall = useMessagesStore((s) => s.addToolCall)
  const updateLastToolCallStatus = useMessagesStore((s) => s.updateLastToolCallStatus)
  const updateLastToolCallResult = useMessagesStore((s) => s.updateLastToolCallResult)
  const updateMessage = useMessagesStore((s) => s.updateMessage)
  const setStreamingMessageId = useMessagesStore((s) => s.setStreamingMessageId)
  const updateConversation = useConversationsStore((s) => s.updateConversation)
  const setIsStreaming = useUiStore((s) => s.setIsStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const setLastRecallCount = useSemanticMemoryStore((s) => s.setLastRecallCount)

  // Use ref for streaming message ID to avoid stale closure issues
  const streamingIdRef = useRef<string | null>(null)

  const handleChunk = useCallback(
    (chunk: StreamChunk) => {
      // Ignore chunks from background scheduled tasks (they have a conversationId that differs from active)
      if (chunk.conversationId && chunk.conversationId !== activeConversationId) {
        return
      }

      switch (chunk.type) {
        case 'tool-approval': {
          useUiStore.getState().setPendingApproval({
            approvalId: chunk.approvalId!,
            toolName: chunk.toolName!,
            toolArgs: chunk.toolArgs ?? {}
          })
          return
        }

        case 'tool-approval-resolved': {
          useUiStore.getState().setPendingApproval(null)
          return
        }

        case 'start': {
          // Immediately create a placeholder assistant message with "processing" phase
          const id = crypto.randomUUID()
          streamingIdRef.current = id
          addMessage({
            id,
            conversationId: activeConversationId || '',
            role: 'assistant',
            content: '',
            modelId: chunk.modelId,
            providerId: chunk.providerId,
            createdAt: new Date(),
            isStreaming: true,
            streamPhase: 'processing'
          })
          setStreamingMessageId(id)
          setIsStreaming(true)
          break
        }

        case 'reasoning-delta': {
          const msgId = streamingIdRef.current
          if (msgId) {
            // Switch to reasoning phase on first reasoning chunk
            updateMessage(msgId, { streamPhase: 'reasoning' })
            appendReasoning(msgId, chunk.content || '')
          }
          break
        }

        case 'tool-call': {
          const msgId = streamingIdRef.current
          if (msgId && chunk.toolName) {
            const toolLabel = getToolLabel(chunk.toolName)
            const argPath = (chunk.toolArgs?.command || chunk.toolArgs?.path || chunk.toolArgs?.query || '') as string
            const detail = argPath ? ` : ${argPath}` : ''
            // Add tool call to the persistent list with "running" status
            addToolCall(msgId, {
              toolName: chunk.toolName,
              args: chunk.toolArgs,
              status: 'running'
            })
            // Also update the processing indicator
            updateMessage(msgId, {
              streamPhase: 'processing',
              toolCall: `${toolLabel}${detail}`
            })
          }
          break
        }

        case 'tool-result': {
          const msgId = streamingIdRef.current
          if (msgId) {
            const status = chunk.toolIsError ? 'error' : 'success'
            if (chunk.toolResult !== undefined) {
              updateLastToolCallResult(msgId, status, chunk.toolResult, chunk.toolResultMeta)
            } else {
              updateLastToolCallStatus(msgId, status)
            }
          }
          break
        }

        case 'text-delta': {
          if (!streamingIdRef.current) {
            // Edge case: text-delta arrives without a prior start signal
            const id = crypto.randomUUID()
            streamingIdRef.current = id
            addMessage({
              id,
              conversationId: activeConversationId || '',
              role: 'assistant',
              content: chunk.content || '',
              createdAt: new Date(),
              isStreaming: true,
              streamPhase: 'generating'
            })
            setStreamingMessageId(id)
            setIsStreaming(true)
          } else {
            // Switch to generating phase on first text chunk (clear tool call indicator)
            updateMessage(streamingIdRef.current, { streamPhase: 'generating', toolCall: undefined })
            appendToMessage(streamingIdRef.current, chunk.content || '')
          }
          break
        }

        case 'finish': {
          const msgId = streamingIdRef.current
          if (msgId) {
            // Build contentData from finish chunk
            const finishContentData: Record<string, unknown> = {}
            if (chunk.fileOperations && chunk.fileOperations.length > 0) {
              finishContentData.fileOperations = chunk.fileOperations
            }
            if (chunk.toolCalls && chunk.toolCalls.length > 0) {
              finishContentData.toolCalls = chunk.toolCalls
            }
            if (chunk.searchSources && chunk.searchSources.length > 0) {
              finishContentData.searchSources = chunk.searchSources
            }

            updateMessage(msgId, {
              isStreaming: false,
              streamPhase: null,
              toolCall: undefined,
              ...(chunk.content ? { content: chunk.content } : {}),
              tokensIn: chunk.usage?.promptTokens,
              tokensOut: chunk.usage?.completionTokens,
              cost: chunk.cost,
              responseTimeMs: chunk.responseTimeMs,
              ...(Object.keys(finishContentData).length > 0
                ? { contentData: finishContentData }
                : {})
            })
          }
          // Update semantic memory badge
          setLastRecallCount(chunk.semanticRecallCount ?? 0)
          streamingIdRef.current = null
          setStreamingMessageId(null)
          setIsStreaming(false)
          break
        }

        case 'error': {
          const msgId = streamingIdRef.current
          if (msgId) {
            updateMessage(msgId, {
              isStreaming: false,
              streamPhase: null,
              content: `Erreur: ${chunk.error || 'Erreur inconnue'}${chunk.suggestion ? `\n\n${chunk.suggestion}` : ''}`
            })
          } else {
            // Error before any chunk — create error message
            addMessage({
              id: crypto.randomUUID(),
              conversationId: activeConversationId || '',
              role: 'assistant',
              content: `Erreur: ${chunk.error || 'Erreur inconnue'}${chunk.suggestion ? `\n\n${chunk.suggestion}` : ''}`,
              createdAt: new Date(),
              isStreaming: false
            })
          }
          streamingIdRef.current = null
          setStreamingMessageId(null)
          setIsStreaming(false)

          toast.error(chunk.error || 'Erreur inconnue', {
            description: chunk.suggestion,
            duration: chunk.category === 'actionable' ? 10000 : 6000
          })
          break
        }
      }
    },
    [activeConversationId, addMessage, appendToMessage, appendReasoning, addToolCall, updateLastToolCallStatus, updateLastToolCallResult, updateMessage, setStreamingMessageId, setIsStreaming, setLastRecallCount]
  )

  // Listen for streaming chunks
  useEffect(() => {
    window.api.onChunk(handleChunk)
    return () => {
      window.api.offChunk()
    }
  }, [handleChunk])

  // Listen for conversation title updates
  useEffect(() => {
    window.api.onConversationUpdated((data: { id: string; title: string }) => {
      updateConversation(data.id, { title: data.title })
    })
    return () => {
      window.api.offConversationUpdated()
    }
  }, [updateConversation])
}
