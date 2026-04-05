import { create } from 'zustand'
import type { GeminiLiveStatus } from '../../../preload/types'

interface GeminiLiveState {
  isAvailable: boolean
  status: GeminiLiveStatus
  micLevel: number     // 0-1
  speakerLevel: number // 0-1
  isPlaybackActive: boolean // true while worklet ring buffer has audio
  error: string | null
  isScreenSharing: boolean

  // Actions
  setAvailable: (available: boolean) => void
  setStatus: (status: GeminiLiveStatus, error?: string) => void
  setMicLevel: (level: number) => void
  setSpeakerLevel: (level: number) => void
  setPlaybackActive: (active: boolean) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  refreshAvailability: () => Promise<void>
  setScreenSharing: (active: boolean) => void
}

export const useGeminiLiveStore = create<GeminiLiveState>((set, get) => ({
  isAvailable: false,
  status: 'off',
  micLevel: 0,
  speakerLevel: 0,
  isPlaybackActive: false,
  error: null,
  isScreenSharing: false,

  setAvailable: (available) => set({ isAvailable: available }),
  setStatus: (status, error) => set({ status, error: error ?? null }),
  setMicLevel: (level) => set({ micLevel: level }),
  setSpeakerLevel: (level) => set({ speakerLevel: level }),
  setPlaybackActive: (active) => set({ isPlaybackActive: active }),
  setScreenSharing: (active) => set({ isScreenSharing: active }),

  connect: async () => {
    try {
      set({ status: 'connecting', error: null })
      await window.api.geminiLiveConnect()
    } catch (err: any) {
      set({ status: 'error', error: err.message || String(err) })
    }
  },

  disconnect: async () => {
    try {
      await window.api.geminiLiveDisconnect()
      set({ status: 'off', error: null, micLevel: 0, speakerLevel: 0, isPlaybackActive: false, isScreenSharing: false })
    } catch (err: any) {
      console.error('[GeminiLive] Disconnect error:', err)
    }
  },

  refreshAvailability: async () => {
    try {
      const available = await window.api.geminiLiveIsAvailable()
      set({ isAvailable: available })
    } catch {
      set({ isAvailable: false })
    }
  },
}))
