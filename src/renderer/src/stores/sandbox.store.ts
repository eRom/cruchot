import { create } from 'zustand'
import type { SandboxProcessInfo } from '../../../preload/types'

interface SandboxState {
  isActive: boolean
  sessionId: string | null
  sandboxPath: string | null
  processes: SandboxProcessInfo[]
}

interface SandboxActions {
  activate: (conversationId: string, workspacePath?: string) => Promise<void>
  deactivate: () => Promise<void>
  stop: () => Promise<void>
  refreshProcesses: () => Promise<void>
  reset: () => void
}

export const useSandboxStore = create<SandboxState & SandboxActions>((set, get) => ({
  // State
  isActive: false,
  sessionId: null,
  sandboxPath: null,
  processes: [],

  // Actions
  activate: async (conversationId: string, workspacePath?: string) => {
    try {
      const result = await window.api.sandboxActivate(conversationId, workspacePath)
      set({
        isActive: true,
        sessionId: result.sessionId,
        sandboxPath: result.sandboxPath,
        processes: []
      })
    } catch (err) {
      console.error('[Sandbox] Activate failed:', err)
      throw err
    }
  },

  deactivate: async () => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      await window.api.sandboxDeactivate(sessionId)
    } catch (err) {
      console.error('[Sandbox] Deactivate failed:', err)
    }
    set({ isActive: false, sessionId: null, sandboxPath: null, processes: [] })
  },

  stop: async () => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      await window.api.sandboxStop(sessionId)
      set({ processes: [] })
    } catch (err) {
      console.error('[Sandbox] Stop failed:', err)
    }
  },

  refreshProcesses: async () => {
    const { sessionId } = get()
    if (!sessionId) return
    try {
      const processes = await window.api.sandboxGetProcesses(sessionId)
      set({ processes })
    } catch (err) {
      console.error('[Sandbox] Refresh processes failed:', err)
    }
  },

  reset: () => {
    set({ isActive: false, sessionId: null, sandboxPath: null, processes: [] })
  }
}))
