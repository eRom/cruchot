import { create } from 'zustand'

export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'tasks' | 'arena' | 'customize'

export type SettingsTab = 'general' | 'appearance' | 'apikeys' | 'model' | 'audio' | 'keybindings' | 'data' | 'backup' | 'remote' | 'summary' | 'privacy' | 'permissions'

export type CustomizeTab = 'prompts' | 'roles' | 'mcp' | 'memory' | 'commands' | 'libraries' | 'skills' | 'brigade'

export type OpenPanel = 'workspace' | 'right' | null

interface UiState {
  currentView: ViewMode
  isStreaming: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean
  settingsTab: SettingsTab | null
  customizeTab: CustomizeTab | null
  openPanel: OpenPanel
  draftContent: string
  pendingApproval: { approvalId: string; toolName: string; toolArgs: Record<string, unknown> } | null

  setCurrentView: (view: ViewMode) => void
  setIsStreaming: (streaming: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setSettingsTab: (tab: SettingsTab | null) => void
  setCustomizeTab: (tab: CustomizeTab | null) => void
  setOpenPanel: (panel: OpenPanel) => void
  toggleRightPanel: () => void
  setDraftContent: (content: string) => void
  setPendingApproval: (approval: { approvalId: string; toolName: string; toolArgs: Record<string, unknown> } | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentView: 'chat',
  isStreaming: false,
  commandPaletteOpen: false,
  searchOpen: false,
  settingsTab: null,
  customizeTab: null,
  openPanel: null,
  draftContent: '',
  pendingApproval: null,

  setCurrentView: (view) => set({ currentView: view }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setCustomizeTab: (tab) => set({ customizeTab: tab }),
  setOpenPanel: (panel) => set({ openPanel: panel }),
  toggleRightPanel: () => set((s) => ({ openPanel: s.openPanel === 'right' ? null : 'right' })),
  setDraftContent: (content) => set({ draftContent: content }),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
}))
