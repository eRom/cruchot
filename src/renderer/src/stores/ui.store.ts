import { create } from 'zustand'

export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'prompts' | 'roles' | 'tasks' | 'mcp' | 'memory'

export type SettingsTab = 'general' | 'appearance' | 'apikeys' | 'model' | 'audio' | 'keybindings' | 'data' | 'backup' | 'remote'

interface UiState {
  currentView: ViewMode
  isStreaming: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean
  settingsTab: SettingsTab | null

  setCurrentView: (view: ViewMode) => void
  setIsStreaming: (streaming: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setSettingsTab: (tab: SettingsTab | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentView: 'chat',
  isStreaming: false,
  commandPaletteOpen: false,
  searchOpen: false,
  settingsTab: null,

  setCurrentView: (view) => set({ currentView: view }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab })
}))
