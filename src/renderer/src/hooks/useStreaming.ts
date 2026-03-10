import { useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useUiStore } from '@/stores/ui.store'

interface StreamChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'finish' | 'error'
  content?: string
  modelId?: string
  providerId?: string
  messageId?: string
  error?: string
  category?: string
  suggestion?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  cost?: number
  responseTimeMs?: number
}

/**
 * Hook that listens for streaming chunks from the main process
 * and updates the messages store in real-time.
 *
 * Stream phases:
 *  1. start         → create placeholder message (processing spinner)
 *  2. reasoning-delta → accumulate reasoning text (thinking phase)
 *  3. text-delta    → accumulate response text (generating phase)
 *  4. finish/error  → finalize
 */
export function useStreaming() {
  const addMessage = useMessagesStore((s) => s.addMessage)
  const appendToMessage = useMessagesStore((s) => s.appendToMessage)
  const appendReasoning = useMessagesStore((s) => s.appendReasoning)
  const updateMessage = useMessagesStore((s) => s.updateMessage)
  const setStreamingMessageId = useMessagesStore((s) => s.setStreamingMessageId)
  const updateConversation = useConversationsStore((s) => s.updateConversation)
  const setIsStreaming = useUiStore((s) => s.setIsStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)

  // Use ref for streaming message ID to avoid stale closure issues
  const streamingIdRef = useRef<string | null>(null)

  const handleChunk = useCallback(
    (chunk: StreamChunk) => {
      switch (chunk.type) {
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
            // Switch to generating phase on first text chunk
            updateMessage(streamingIdRef.current, { streamPhase: 'generating' })
            appendToMessage(streamingIdRef.current, chunk.content || '')
          }
          break
        }

        case 'finish': {
          const msgId = streamingIdRef.current
          if (msgId) {
            updateMessage(msgId, {
              isStreaming: false,
              streamPhase: null,
              // Set full content from server as safety net (in case chunks were lost)
              ...(chunk.content ? { content: chunk.content } : {}),
              tokensIn: chunk.usage?.promptTokens,
              tokensOut: chunk.usage?.completionTokens,
              cost: chunk.cost,
              responseTimeMs: chunk.responseTimeMs
            })
          }
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
            duration: 6000
          })
          break
        }
      }
    },
    [activeConversationId, addMessage, appendToMessage, appendReasoning, updateMessage, setStreamingMessageId, setIsStreaming]
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
