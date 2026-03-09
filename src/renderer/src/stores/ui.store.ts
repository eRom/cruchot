import { create } from 'zustand'

export type ViewMode = 'chat' | 'settings' | 'statistics'

interface UiState {
  currentView: ViewMode
  isStreaming: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean

  setCurrentView: (view: ViewMode) => void
  setIsStreaming: (streaming: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentView: 'chat',
  isStreaming: false,
  commandPaletteOpen: false,
  searchOpen: false,

  setCurrentView: (view) => set({ currentView: view }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open })
}))
