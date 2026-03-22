import { create } from 'zustand'
import type { FileNode, WorkspaceInfo, FileContent, WorkspaceFileContext } from '../../../preload/types'
import { useUiStore } from './ui.store'

interface WorkspaceState {
  rootPath: string | null
  tree: FileNode | null
  selectedFilePath: string | null
  isPanelOpen: boolean // internal expand/collapse state (w-60 vs w-10)
  isLoading: boolean
  attachedFiles: string[] // relative paths of files attached to current message

  openWorkspace: (rootPath: string, projectId?: string) => Promise<void>
  closeWorkspace: () => Promise<void>
  refreshTree: () => Promise<void>
  selectFile: (path: string) => void
  togglePanel: () => void
  attachFile: (path: string) => void
  detachFile: (path: string) => void
  clearAttachedFiles: () => void
  getAttachedFileContexts: () => Promise<WorkspaceFileContext[]>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  tree: null,
  selectedFilePath: null,
  isPanelOpen: true,
  isLoading: false,
  attachedFiles: [],

  openWorkspace: async (rootPath, projectId) => {
    set({ isLoading: true })
    try {
      await window.api.workspaceOpen({ rootPath, projectId })
      const tree = await window.api.workspaceGetTree() as FileNode
      set({ rootPath, tree, isLoading: false })
    } catch (error) {
      console.error('[Workspace] Failed to open:', error)
      set({ isLoading: false })
    }
  },

  closeWorkspace: async () => {
    try {
      await window.api.workspaceClose()
    } catch { /* ignore */ }
    if (useUiStore.getState().openPanel === 'workspace') {
      useUiStore.getState().setOpenPanel(null)
    }
    set({
      rootPath: null,
      tree: null,
      selectedFilePath: null,
      isPanelOpen: true,
      attachedFiles: []
    })
  },

  refreshTree: async () => {
    if (!get().rootPath) return
    try {
      const tree = await window.api.workspaceGetTree() as FileNode
      set({ tree })
    } catch (error) {
      console.error('[Workspace] Failed to refresh tree:', error)
    }
  },

  selectFile: (path) => {
    set({ selectedFilePath: path })
  },

  togglePanel: () => {
    set((s) => ({ isPanelOpen: !s.isPanelOpen }))
  },

  attachFile: (path) => {
    set((s) => {
      if (s.attachedFiles.includes(path)) return s
      return { attachedFiles: [...s.attachedFiles, path] }
    })
  },

  detachFile: (path) => {
    set((s) => ({
      attachedFiles: s.attachedFiles.filter((p) => p !== path)
    }))
  },

  clearAttachedFiles: () => {
    set({ attachedFiles: [] })
  },

  getAttachedFileContexts: async () => {
    const { attachedFiles } = get()
    const contexts: WorkspaceFileContext[] = []

    for (const filePath of attachedFiles) {
      try {
        const file = await window.api.workspaceReadFile(filePath)
        contexts.push({
          path: file.path,
          content: file.content,
          language: file.language
        })
      } catch {
        // Skip files that can't be read
      }
    }

    return contexts
  }
}))
