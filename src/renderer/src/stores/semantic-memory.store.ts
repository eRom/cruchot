import { create } from 'zustand'
import type { SemanticMemorySearchResult, SemanticMemoryStats } from '../../../../src/preload/types'

interface SemanticMemoryState {
  stats: SemanticMemoryStats | null
  searchResults: SemanticMemorySearchResult[]
  isSearching: boolean
  lastRecallCount: number

  fetchStats: () => Promise<void>
  search: (query: string, options?: { topK?: number; projectId?: string }) => Promise<void>
  clearSearch: () => void
  forget: (pointIds: string[]) => Promise<void>
  forgetConversation: (conversationId: string) => Promise<void>
  forgetAll: () => Promise<void>
  reindex: () => Promise<void>
  setLastRecallCount: (count: number) => void
}

export const useSemanticMemoryStore = create<SemanticMemoryState>((set) => ({
  stats: null,
  searchResults: [],
  isSearching: false,
  lastRecallCount: 0,

  fetchStats: async () => {
    try {
      const stats = await window.api.semanticMemoryStats()
      set({ stats })
    } catch {
      // Service not ready
    }
  },

  search: async (query, options) => {
    set({ isSearching: true })
    try {
      const results = await window.api.semanticMemorySearch({
        query,
        topK: options?.topK ?? 10,
        projectId: options?.projectId
      })
      set({ searchResults: results, isSearching: false })
    } catch {
      set({ searchResults: [], isSearching: false })
    }
  },

  clearSearch: () => set({ searchResults: [] }),

  forget: async (pointIds) => {
    await window.api.semanticMemoryForget({ pointIds })
    set((s) => ({
      searchResults: s.searchResults.filter(r => !pointIds.includes(r.id))
    }))
  },

  forgetConversation: async (conversationId) => {
    await window.api.semanticMemoryForgetConversation({ conversationId })
    set((s) => ({
      searchResults: s.searchResults.filter(r => r.conversationId !== conversationId)
    }))
  },

  forgetAll: async () => {
    await window.api.semanticMemoryForgetAll()
    set({ searchResults: [], stats: null })
  },

  reindex: async () => {
    await window.api.semanticMemoryReindex()
  },

  setLastRecallCount: (count) => set({ lastRecallCount: count })
}))
