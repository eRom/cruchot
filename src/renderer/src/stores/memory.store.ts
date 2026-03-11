import { create } from 'zustand'
import type { MemoryFragment } from '../../../preload/types'

interface MemoryState {
  fragments: MemoryFragment[]
  isLoaded: boolean

  loadFragments: () => Promise<void>
  createFragment: (content: string, isActive?: boolean) => Promise<void>
  updateFragment: (id: string, updates: { content?: string; isActive?: boolean }) => Promise<void>
  deleteFragment: (id: string) => Promise<void>
  toggleFragment: (id: string) => Promise<void>
  reorderFragments: (orderedIds: string[]) => Promise<void>
}

export const useMemoryStore = create<MemoryState>((set) => ({
  fragments: [],
  isLoaded: false,

  loadFragments: async () => {
    const fragments = await window.api.listMemoryFragments()
    set({ fragments, isLoaded: true })
  },

  createFragment: async (content, isActive) => {
    await window.api.createMemoryFragment({ content, isActive })
    const fragments = await window.api.listMemoryFragments()
    set({ fragments })
  },

  updateFragment: async (id, updates) => {
    await window.api.updateMemoryFragment({ id, ...updates })
    const fragments = await window.api.listMemoryFragments()
    set({ fragments })
  },

  deleteFragment: async (id) => {
    await window.api.deleteMemoryFragment({ id })
    const fragments = await window.api.listMemoryFragments()
    set({ fragments })
  },

  toggleFragment: async (id) => {
    await window.api.toggleMemoryFragment({ id })
    const fragments = await window.api.listMemoryFragments()
    set({ fragments })
  },

  reorderFragments: async (orderedIds) => {
    // Optimistic update
    set((state) => {
      const ordered = orderedIds
        .map(id => state.fragments.find(f => f.id === id))
        .filter(Boolean) as MemoryFragment[]
      return { fragments: ordered }
    })
    await window.api.reorderMemoryFragments({ orderedIds })
  }
}))
