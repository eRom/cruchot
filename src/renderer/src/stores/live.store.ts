import { create } from 'zustand'
import type { LiveStatus } from '../../../preload/types'

interface LiveState {
  isAvailable: boolean
  status: LiveStatus
  micLevel: number
  speakerLevel: number
  isPlaybackActive: boolean
  error: string | null
  isScreenSharing: boolean
  activeProviderId: string | null
  supportsScreenShare: boolean

  // Actions
  setAvailable: (available: boolean) => void
  setStatus: (status: LiveStatus, error?: string) => void
  setMicLevel: (level: number) => void
  setSpeakerLevel: (level: number) => void
  setPlaybackActive: (active: boolean) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refreshAvailability: () => Promise<void>
  setScreenSharing: (active: boolean) => void
}

export const useLiveStore = create<LiveState>((set, get) => ({
  isAvailable: false,
  status: 'off',
  micLevel: 0,
  speakerLevel: 0,
  isPlaybackActive: false,
  error: null,
  isScreenSharing: false,
  activeProviderId: null,
  supportsScreenShare: false,

  setAvailable: (available) => set({ isAvailable: available }),
  setStatus: (status, error) => set({ status, error: error ?? null }),
  setMicLevel: (level) => set({ micLevel: level }),
  setSpeakerLevel: (level) => set({ speakerLevel: level }),
  setPlaybackActive: (active) => set({ isPlaybackActive: active }),
  setScreenSharing: (active) => set({ isScreenSharing: active }),

  connect: async () => {
    try {
      set({ status: 'connecting', error: null })
      await window.api.liveConnect()
      // Resolve which plugin is active to know its capabilities
      const activeId = await window.api.liveGetActiveProvider()
      if (activeId) {
        const plugins = await window.api.liveGetPlugins()
        const active = plugins.find(p => p.providerId === activeId)
        set({
          activeProviderId: activeId,
          supportsScreenShare: active?.supportsScreenShare ?? false,
        })
      }
    } catch (err: any) {
      set({ status: 'error', error: err.message || String(err) })
    }
  },

  disconnect: async () => {
    try {
      await window.api.liveDisconnect()
      set({ status: 'off', error: null, micLevel: 0, speakerLevel: 0, isPlaybackActive: false, isScreenSharing: false, activeProviderId: null, supportsScreenShare: false })
    } catch (err: any) {
      console.error('[Live] Disconnect error:', err)
    }
  },

  refreshAvailability: async () => {
    try {
      const available = await window.api.liveIsAvailable()
      set({ isAvailable: available })
    } catch {
      set({ isAvailable: false })
    }
  },
}))
