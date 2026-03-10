import { create } from 'zustand'

export type StreamPhase = 'processing' | 'reasoning' | 'generating' | null

export interface ToolCallDisplay {
  toolName: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  error?: string
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
  contentData?: Record<string, unknown>
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

  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendToMessage: (id: string, content: string) => void
  appendReasoning: (id: string, text: string) => void
  addToolCall: (id: string, toolCall: ToolCallDisplay) => void
  updateLastToolCallStatus: (id: string, status: 'success' | 'error') => void
  removeMessage: (id: string) => void
  clearMessages: () => void
  setStreamingMessageId: (id: string | null) => void
}

export const useMessagesStore = create<MessagesState>((set) => ({
  messages: [],
  streamingMessageId: null,

  setMessages: (messages) => set({ messages }),

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

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id)
    })),

  clearMessages: () => set({ messages: [], streamingMessageId: null }),

  setStreamingMessageId: (id) => set({ streamingMessageId: id })
}))
