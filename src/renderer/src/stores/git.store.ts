import { create } from 'zustand'
import type { GitInfo, GitFileStatus } from '../../../preload/types'
import { useProvidersStore } from './providers.store'

interface GitState {
  info: GitInfo | null
  status: GitFileStatus[] | null
  diffContent: string | null
  selectedDiffPath: string | null
  commitMessage: string
  isGeneratingMessage: boolean
  isCommitting: boolean
  activeTab: 'files' | 'changes'

  refreshInfo: () => Promise<void>
  refreshStatus: () => Promise<void>
  loadDiff: (path: string, staged?: boolean) => Promise<void>
  clearDiff: () => void
  setCommitMessage: (msg: string) => void
  generateCommitMessage: () => Promise<void>
  stageFiles: (paths: string[]) => Promise<void>
  stageAll: () => Promise<void>
  unstageFiles: (paths: string[]) => Promise<void>
  commit: () => Promise<boolean>
  setActiveTab: (tab: 'files' | 'changes') => void
  reset: () => void
}

export const useGitStore = create<GitState>((set, get) => ({
  info: null,
  status: null,
  diffContent: null,
  selectedDiffPath: null,
  commitMessage: '',
  isGeneratingMessage: false,
  isCommitting: false,
  activeTab: 'files',

  refreshInfo: async () => {
    try {
      const info = await window.api.gitGetInfo()
      set({ info })
    } catch {
      set({ info: null })
    }
  },

  refreshStatus: async () => {
    try {
      const status = await window.api.gitGetStatus()
      set({ status })
    } catch {
      set({ status: null })
    }
  },

  loadDiff: async (path, staged) => {
    try {
      const diffContent = await window.api.gitGetDiff({ path, staged })
      set({ diffContent, selectedDiffPath: path })
    } catch {
      set({ diffContent: null, selectedDiffPath: null })
    }
  },

  clearDiff: () => set({ diffContent: null, selectedDiffPath: null }),

  setCommitMessage: (msg) => set({ commitMessage: msg }),

  generateCommitMessage: async () => {
    const { selectedProviderId, selectedModelId } = useProvidersStore.getState()
    if (!selectedProviderId || !selectedModelId) return

    set({ isGeneratingMessage: true })
    try {
      const result = await window.api.gitGenerateCommitMessage({
        providerId: selectedProviderId,
        modelId: selectedModelId
      })
      set({ commitMessage: result.message, isGeneratingMessage: false })
    } catch (error) {
      console.error('[Git] Failed to generate commit message:', error)
      set({ isGeneratingMessage: false })
    }
  },

  stageFiles: async (paths) => {
    try {
      await window.api.gitStageFiles({ paths })
      await get().refreshStatus()
      await get().refreshInfo()
    } catch (error) {
      console.error('[Git] Failed to stage files:', error)
    }
  },

  stageAll: async () => {
    try {
      await window.api.gitStageAll()
      await get().refreshStatus()
      await get().refreshInfo()
    } catch (error) {
      console.error('[Git] Failed to stage all:', error)
    }
  },

  unstageFiles: async (paths) => {
    try {
      await window.api.gitUnstageFiles({ paths })
      await get().refreshStatus()
      await get().refreshInfo()
    } catch (error) {
      console.error('[Git] Failed to unstage files:', error)
    }
  },

  commit: async () => {
    const { commitMessage } = get()
    if (!commitMessage.trim()) return false

    set({ isCommitting: true })
    try {
      const result = await window.api.gitCommit({ message: commitMessage })
      set({ commitMessage: '', isCommitting: false })
      // Refresh after commit
      await get().refreshStatus()
      await get().refreshInfo()
      return result.hash !== 'unknown'
    } catch (error) {
      console.error('[Git] Failed to commit:', error)
      set({ isCommitting: false })
      return false
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  reset: () => set({
    info: null,
    status: null,
    diffContent: null,
    selectedDiffPath: null,
    commitMessage: '',
    isGeneratingMessage: false,
    isCommitting: false,
    activeTab: 'files'
  })
}))
