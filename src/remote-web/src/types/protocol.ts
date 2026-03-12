// ── Client → Server messages ────────────────────────

export type ClientMessage =
  | { type: 'pair'; code: string }
  | { type: 'user-message'; text: string; sessionToken: string }
  | { type: 'tool-approval-response'; toolCallId: string; approved: boolean; sessionToken: string }
  | { type: 'cancel-stream'; sessionToken: string }
  | { type: 'ping' }
  | { type: 'switch-conversation'; conversationId: string; sessionToken: string }
  | { type: 'get-conversations'; sessionToken: string }
  | { type: 'get-history'; conversationId: string; sessionToken: string }

// ── Server → Client messages ────────────────────────

export type ServerMessage =
  | { type: 'auth-required' }
  | { type: 'paired'; sessionToken: string; conversationTitle: string; conversationId: string | null }
  | { type: 'pair-failed'; reason: string }
  | { type: 'stream-start' }
  | { type: 'text-delta'; content: string }
  | { type: 'reasoning-delta'; content: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolName: string; output: string }
  | { type: 'tool-approval-request'; toolCallId: string; toolName: string; args: string }
  | { type: 'stream-end'; fullText: string }
  | { type: 'error'; message: string }
  | { type: 'pong' }
  | { type: 'conversations-list'; conversations: Array<{ id: string; title: string; updatedAt: string }> }
  | { type: 'history'; conversationId: string; messages: Array<{ id: string; role: string; content: string; createdAt: string }> }
  | { type: 'conversation-switched'; conversationId: string; title: string }
  | { type: 'session-expired'; reason: string }

// ── App State ────────────────────────────────────────

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface ToolApproval {
  toolCallId: string
  toolName: string
  args: string
  expiresAt: number
}

export interface ConversationSummary {
  id: string
  title: string
  updatedAt: string
}

export interface AppState {
  screen: 'pairing' | 'chat'
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
  sessionToken: string | null
  wsUrl: string | null
  messages: Message[]
  isStreaming: boolean
  streamText: string
  reasoningText: string
  pendingApprovals: ToolApproval[]
  conversations: ConversationSummary[]
  activeConversation: { id: string; title: string } | null
  error: string | null
}

export type AppAction =
  | { type: 'SET_WS_URL'; url: string }
  | { type: 'SET_SCREEN'; screen: 'pairing' | 'chat' }
  | { type: 'SET_CONNECTION_STATUS'; status: 'connecting' | 'connected' | 'disconnected' }
  | { type: 'SET_SESSION_TOKEN'; token: string }
  | { type: 'SET_PAIRED'; token: string; title: string; conversationId: string | null }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'ADD_USER_MESSAGE'; text: string }
  | { type: 'STREAM_START' }
  | { type: 'STREAM_TEXT_DELTA'; content: string }
  | { type: 'STREAM_REASONING_DELTA'; content: string }
  | { type: 'STREAM_END'; fullText: string }
  | { type: 'ADD_TOOL_APPROVAL'; approval: ToolApproval }
  | { type: 'REMOVE_TOOL_APPROVAL'; toolCallId: string }
  | { type: 'SET_CONVERSATIONS'; conversations: ConversationSummary[] }
  | { type: 'SET_ACTIVE_CONVERSATION'; id: string; title: string }
  | { type: 'SET_HISTORY'; messages: Message[] }
  | { type: 'SESSION_EXPIRED' }
