import { create } from 'zustand'

export type StreamPhase = 'processing' | 'reasoning' | 'generating' | null

export interface ToolCallResultMeta {
  duration?: number      // ms
  exitCode?: number      // bash
  lineCount?: number     // readFile
  byteSize?: number      // readFile/writeFile
  matchCount?: number    // GrepTool
  fileCount?: number     // listFiles, GlobTool
}

export interface ToolCallDisplay {
  toolName: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  error?: string
  result?: string                // résultat brut (tronqué ~10KB)
  resultMeta?: ToolCallResultMeta
}

export interface Message {
  id: string
  conversationId: string
  parentMessageId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  toolCalls?: ToolCallDisplay[]
  modelId?: string
  providerId?: string
  tokensIn?: number
  tokensOut?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contentData?: Record<string, any>
  cost?: number
  responseTimeMs?: number
  createdAt: Date
  isStreaming?: boolean
  streamPhase?: StreamPhase
  toolCall?: string // Current tool call label during streaming (e.g. "Lecture du fichier : README.md")
}

interface MessagesState {
  messages: Message[]
  streamingMessageId: string | null

  // Pagination
  hasOlderMessages: boolean
  isLoadingOlder: boolean
  totalCount: number

  setMessages: (messages: Message[]) => void
  setMessagesPage: (messages: Message[], totalCount: number, hasMore: boolean) => void
  prependMessages: (olderMessages: Message[], hasMore: boolean) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendToMessage: (id: string, content: string) => void
  appendReasoning: (id: string, text: string) => void
  addToolCall: (id: string, toolCall: ToolCallDisplay) => void
  updateLastToolCallStatus: (id: string, status: 'success' | 'error') => void
  updateLastToolCallResult: (id: string, status: 'success' | 'error', result?: string, resultMeta?: ToolCallResultMeta) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
  setStreamingMessageId: (id: string | null) => void
  getConversationMessages: (conversationId: string | null) => Message[]
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  messages: [],
  streamingMessageId: null,

  // Pagination
  hasOlderMessages: false,
  isLoadingOlder: false,
  totalCount: 0,

  setMessages: (messages) => set({ messages }),

  setMessagesPage: (messages, totalCount, hasMore) =>
    set({ messages, totalCount, hasOlderMessages: hasMore }),

  prependMessages: (olderMessages, hasMore) =>
    set((state) => ({
      messages: [...olderMessages, ...state.messages],
      hasOlderMessages: hasMore,
      isLoadingOlder: false
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message]
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      )
    })),

  appendToMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content: m.content + content } : m
      )
    })),

  appendReasoning: (id, text) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, reasoning: (m.reasoning ?? '') + text } : m
      )
    })),

  addToolCall: (id, toolCall) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, toolCalls: [...(m.toolCalls ?? []), toolCall] } : m
      )
    })),

  updateLastToolCallStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || !m.toolCalls?.length) return m
        const updated = [...m.toolCalls]
        // Find last running tool call with matching name and update it
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].status === 'running') {
            updated[i] = { ...updated[i], status }
            break
          }
        }
        return { ...m, toolCalls: updated }
      })
    })),

  updateLastToolCallResult: (id, status, result, resultMeta) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || !m.toolCalls?.length) return m
        const updated = [...m.toolCalls]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].status === 'running') {
            updated[i] = { ...updated[i], status, result, resultMeta }
            break
          }
        }
        return { ...m, toolCalls: updated }
      })
    })),

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id)
    })),

  clearMessages: () => set({
    messages: [],
    streamingMessageId: null,
    hasOlderMessages: false,
    isLoadingOlder: false,
    totalCount: 0
  }),

  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  getConversationMessages: (conversationId) =>
    conversationId ? get().messages.filter((m) => m.conversationId === conversationId) : []
}))
