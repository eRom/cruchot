import { create } from 'zustand'

export interface Message {
  id: string
  conversationId: string
  parentMessageId?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  providerId?: string
  tokensIn?: number
  tokensOut?: number
  cost?: number
  responseTimeMs?: number
  createdAt: Date
  isStreaming?: boolean
}

interface MessagesState {
  messages: Message[]
  streamingMessageId: string | null

  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendToMessage: (id: string, content: string) => void
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

  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id)
    })),

  clearMessages: () => set({ messages: [], streamingMessageId: null }),

  setStreamingMessageId: (id) => set({ streamingMessageId: id })
}))
