import { useRef, useCallback, useEffect } from 'react'
import type { ClientMessage, ServerMessage, AppAction } from '../types/protocol'

interface UseWebSocketParams {
  wsUrl: string | null
  dispatch: React.Dispatch<AppAction>
}

export function useWebSocket({ wsUrl, dispatch }: UseWebSocketParams) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectDelayRef = useRef(1000)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const intentionalCloseRef = useRef(false)

  const connect = useCallback(() => {
    if (!wsUrl) return
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connecting' })

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'connected' })
        reconnectDelayRef.current = 1000

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30_000)
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage
          handleServerMessage(message, dispatch)
        } catch {
          console.warn('[WS] Invalid message:', event.data)
        }
      }

      ws.onclose = () => {
        cleanup()
        dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' })

        if (!intentionalCloseRef.current) {
          // Auto-reconnect with backoff
          reconnectTimerRef.current = setTimeout(() => {
            reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30_000)
            connect()
          }, reconnectDelayRef.current)
        }
      }

      ws.onerror = () => {
        // onclose will fire after onerror
      }
    } catch {
      dispatch({ type: 'SET_CONNECTION_STATUS', status: 'disconnected' })
    }
  }, [wsUrl, dispatch])

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    cleanup()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [cleanup])

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  // Auto-connect when wsUrl changes
  useEffect(() => {
    if (wsUrl) {
      intentionalCloseRef.current = false
      connect()
    }
    return () => {
      disconnect()
    }
  }, [wsUrl, connect, disconnect])

  return { send, disconnect, isConnected: () => wsRef.current?.readyState === WebSocket.OPEN }
}

function handleServerMessage(message: ServerMessage, dispatch: React.Dispatch<AppAction>) {
  switch (message.type) {
    case 'auth-required':
      // Ready for pairing
      break

    case 'paired':
      dispatch({
        type: 'SET_PAIRED',
        token: message.sessionToken,
        title: message.conversationTitle,
        conversationId: message.conversationId
      })
      // Save token to sessionStorage
      sessionStorage.setItem('ws-session-token', message.sessionToken)
      break

    case 'pair-failed':
      dispatch({ type: 'SET_ERROR', error: message.reason })
      break

    case 'stream-start':
      dispatch({ type: 'STREAM_START' })
      break

    case 'text-delta':
      dispatch({ type: 'STREAM_TEXT_DELTA', content: message.content })
      break

    case 'reasoning-delta':
      dispatch({ type: 'STREAM_REASONING_DELTA', content: message.content })
      break

    case 'tool-approval-request':
      dispatch({
        type: 'ADD_TOOL_APPROVAL',
        approval: {
          toolCallId: message.toolCallId,
          toolName: message.toolName,
          args: message.args,
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      })
      break

    case 'tool-result':
      // Could display tool results inline
      break

    case 'stream-end':
      dispatch({ type: 'STREAM_END', fullText: message.fullText })
      break

    case 'error':
      dispatch({ type: 'SET_ERROR', error: message.message })
      break

    case 'conversations-list':
      dispatch({ type: 'SET_CONVERSATIONS', conversations: message.conversations })
      break

    case 'history':
      dispatch({
        type: 'SET_HISTORY',
        messages: message.messages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.createdAt
        }))
      })
      break

    case 'conversation-switched':
      dispatch({ type: 'SET_ACTIVE_CONVERSATION', id: message.conversationId, title: message.title })
      break

    case 'session-expired':
      dispatch({ type: 'SESSION_EXPIRED' })
      sessionStorage.removeItem('ws-session-token')
      break

    case 'pong':
      // Heartbeat response
      break
  }
}
