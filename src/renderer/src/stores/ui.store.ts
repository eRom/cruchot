import { create } from 'zustand'

export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'prompts' | 'roles' | 'tasks' | 'mcp' | 'memory' | 'commands' | 'libraries' | 'arena' | 'brigade'

export type SettingsTab = 'general' | 'appearance' | 'apikeys' | 'model' | 'audio' | 'keybindings' | 'data' | 'backup' | 'remote' | 'summary' | 'privacy'

export type OpenPanel = 'workspace' | 'right' | null

interface UiState {
  currentView: ViewMode
  isStreaming: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean
  settingsTab: SettingsTab | null
  openPanel: OpenPanel
  draftContent: string

  setCurrentView: (view: ViewMode) => void
  setIsStreaming: (streaming: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setSettingsTab: (tab: SettingsTab | null) => void
  setOpenPanel: (panel: OpenPanel) => void
  toggleRightPanel: () => void
  setDraftContent: (content: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentView: 'chat',
  isStreaming: false,
  commandPaletteOpen: false,
  searchOpen: false,
  settingsTab: null,
  openPanel: null,
  draftContent: '',

  setCurrentView: (view) => set({ currentView: view }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setOpenPanel: (panel) => set({ openPanel: panel }),
  toggleRightPanel: () => set((s) => ({ openPanel: s.openPanel === 'right' ? null : 'right' })),
  setDraftContent: (content) => set({ draftContent: content })
}))
