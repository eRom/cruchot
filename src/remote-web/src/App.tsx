import { useReducer, useEffect, useRef } from 'react'
import type { AppState, AppAction } from './types/protocol'
import { useWebSocket } from './hooks/useWebSocket'
import { PairingScreen } from './components/PairingScreen'
import { ChatView } from './components/ChatView'
import { StatusBar } from './components/StatusBar'

const initialState: AppState = {
  screen: 'pairing',
  connectionStatus: 'disconnected',
  sessionToken: null,
  wsUrl: null,
  messages: [],
  isStreaming: false,
  streamText: '',
  reasoningText: '',
  pendingApprovals: [],
  conversations: [],
  activeConversation: null,
  error: null
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_WS_URL':
      return { ...state, wsUrl: action.url }
    case 'SET_SCREEN':
      return { ...state, screen: action.screen }
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.status }
    case 'SET_SESSION_TOKEN':
      return { ...state, sessionToken: action.token }
    case 'SET_PAIRED':
      return {
        ...state,
        screen: 'chat',
        sessionToken: action.token,
        activeConversation: action.conversationId
          ? { id: action.conversationId, title: action.title }
          : null,
        error: null
      }
    case 'SET_ERROR':
      return { ...state, error: action.error }
    case 'ADD_USER_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, {
          id: Date.now().toString(),
          role: 'user',
          content: action.text,
          createdAt: new Date().toISOString()
        }],
        error: null
      }
    case 'STREAM_START':
      return { ...state, isStreaming: true, streamText: '', reasoningText: '' }
    case 'STREAM_TEXT_DELTA':
      return { ...state, streamText: state.streamText + action.content }
    case 'STREAM_REASONING_DELTA':
      return { ...state, reasoningText: state.reasoningText + action.content }
    case 'STREAM_END':
      return {
        ...state,
        isStreaming: false,
        messages: [...state.messages, {
          id: Date.now().toString(),
          role: 'assistant',
          content: action.fullText,
          createdAt: new Date().toISOString()
        }],
        streamText: '',
        reasoningText: ''
      }
    case 'ADD_TOOL_APPROVAL':
      return {
        ...state,
        pendingApprovals: [...state.pendingApprovals, action.approval]
      }
    case 'REMOVE_TOOL_APPROVAL':
      return {
        ...state,
        pendingApprovals: state.pendingApprovals.filter((a) => a.toolCallId !== action.toolCallId)
      }
    case 'SET_CONVERSATIONS':
      return { ...state, conversations: action.conversations }
    case 'SET_ACTIVE_CONVERSATION':
      return {
        ...state,
        activeConversation: { id: action.id, title: action.title },
        messages: []
      }
    case 'SET_HISTORY':
      return { ...state, messages: action.messages }
    case 'SESSION_EXPIRED':
      return {
        ...initialState,
        wsUrl: state.wsUrl,
        screen: 'pairing',
        error: 'Session expiree. Refaites le pairing.'
      }
    default:
      return state
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { send, isConnected } = useWebSocket({ wsUrl: state.wsUrl, dispatch })
  const pendingPairRef = useRef<string | null>(null)

  // Parse URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ws = params.get('ws')
    if (ws) {
      dispatch({ type: 'SET_WS_URL', url: ws })
    }
  }, [])

  // Send pending pair message when connection opens
  useEffect(() => {
    if (state.connectionStatus === 'connected' && pendingPairRef.current) {
      const code = pendingPairRef.current
      pendingPairRef.current = null
      send({ type: 'pair', code })
    }
  }, [state.connectionStatus, send])

  // Load conversation history after pairing
  useEffect(() => {
    if (state.activeConversation && state.sessionToken) {
      send({
        type: 'get-history',
        conversationId: state.activeConversation.id,
        sessionToken: state.sessionToken
      })
    }
  }, [state.activeConversation?.id, state.sessionToken, send])

  const handlePair = (code: string, wsUrl?: string) => {
    if (wsUrl && wsUrl !== state.wsUrl) {
      // New URL — set it and queue the pair message for when connection opens
      pendingPairRef.current = code
      dispatch({ type: 'SET_WS_URL', url: wsUrl })
    } else if (isConnected()) {
      // Already connected — send immediately
      send({ type: 'pair', code })
    } else if (state.wsUrl) {
      // URL set but not connected yet — queue for when connection opens
      pendingPairRef.current = code
    }
  }

  const handleSendMessage = (text: string) => {
    if (!state.sessionToken) return
    dispatch({ type: 'ADD_USER_MESSAGE', text })
    send({ type: 'user-message', text, sessionToken: state.sessionToken })
  }

  const handleToolApproval = (toolCallId: string, approved: boolean) => {
    if (!state.sessionToken) return
    send({ type: 'tool-approval-response', toolCallId, approved, sessionToken: state.sessionToken })
    dispatch({ type: 'REMOVE_TOOL_APPROVAL', toolCallId })
  }

  const handleCancelStream = () => {
    if (!state.sessionToken) return
    send({ type: 'cancel-stream', sessionToken: state.sessionToken })
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar
        connectionStatus={state.connectionStatus}
        activeConversation={state.activeConversation}
      />

      {state.screen === 'pairing' ? (
        <PairingScreen
          onPair={handlePair}
          error={state.error}
          connectionStatus={state.connectionStatus}
          wsUrl={state.wsUrl}
        />
      ) : (
        <ChatView
          messages={state.messages}
          isStreaming={state.isStreaming}
          streamText={state.streamText}
          reasoningText={state.reasoningText}
          pendingApprovals={state.pendingApprovals}
          onSendMessage={handleSendMessage}
          onToolApproval={handleToolApproval}
          onCancelStream={handleCancelStream}
          error={state.error}
        />
      )}
    </div>
  )
}
