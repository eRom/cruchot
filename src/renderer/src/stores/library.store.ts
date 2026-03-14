import { create } from 'zustand'
import type { LibraryInfo, LibrarySourceInfo, LibraryIndexingProgress } from '../../../preload/types'

interface LibraryState {
  libraries: LibraryInfo[]
  loading: boolean
  activeLibraryId: string | null
  indexingProgress: Map<string, LibraryIndexingProgress>

  loadLibraries: () => Promise<void>
  addLibrary: (lib: LibraryInfo) => void
  updateLibrary: (id: string, lib: LibraryInfo) => void
  removeLibrary: (id: string) => void
  setLibraries: (libraries: LibraryInfo[]) => void
  setActiveLibraryId: (id: string | null) => void
  setIndexingProgress: (progress: LibraryIndexingProgress) => void
  clearIndexingProgress: (libraryId: string) => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  libraries: [],
  loading: false,
  activeLibraryId: null,
  indexingProgress: new Map(),

  loadLibraries: async () => {
    set({ loading: true })
    try {
      const libraries = await window.api.libraryList()
      set({ libraries })
    } finally {
      set({ loading: false })
    }
  },

  addLibrary: (lib) => {
    set({ libraries: [...get().libraries, lib] })
  },

  updateLibrary: (id, lib) => {
    set({ libraries: get().libraries.map((l) => (l.id === id ? lib : l)) })
  },

  removeLibrary: (id) => {
    set({ libraries: get().libraries.filter((l) => l.id !== id) })
    if (get().activeLibraryId === id) set({ activeLibraryId: null })
  },

  setLibraries: (libraries) => set({ libraries }),

  setActiveLibraryId: (id) => set({ activeLibraryId: id }),

  setIndexingProgress: (progress) => {
    const map = new Map(get().indexingProgress)
    map.set(progress.sourceId, progress)
    set({ indexingProgress: map })
  },

  clearIndexingProgress: (libraryId) => {
    const map = new Map(get().indexingProgress)
    for (const [key, val] of map) {
      if (val.libraryId === libraryId) map.delete(key)
    }
    set({ indexingProgress: map })
  }
}))
