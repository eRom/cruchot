import { create } from 'zustand'
import type { VcrRecordingHeader, VcrRecording, ActiveRecordingInfo } from '../../../preload/types'

interface VcrState {
  // Recording state
  isRecording: boolean
  activeRecording: ActiveRecordingInfo | null

  // Recordings list
  recordings: VcrRecordingHeader[]
  listOpen: boolean

  // Player
  playerOpen: boolean
  playerRecordingId: string | null
  playerRecording: VcrRecording | null
  playerMode: 'timeline' | 'replay'

  // Actions — recording
  startRecording: (
    conversationId: string,
    options?: {
      fullCapture?: boolean
      modelId?: string
      providerId?: string
      workspacePath?: string
      roleId?: string
    }
  ) => Promise<void>
  stopRecording: () => Promise<void>
  refreshStatus: () => Promise<void>

  // Actions — list
  loadRecordings: () => Promise<void>
  openList: () => void
  closeList: () => void
  deleteRecording: (recordingId: string) => Promise<void>

  // Actions — player
  openPlayer: (recordingId: string) => Promise<void>
  closePlayer: () => void
  togglePlayerMode: () => void

  // Actions — export
  exportHtml: (recordingId: string, anonymize?: boolean) => Promise<void>
  exportVcr: (recordingId: string) => Promise<void>
}

export const useVcrStore = create<VcrState>((set, get) => ({
  isRecording: false,
  activeRecording: null,
  recordings: [],
  listOpen: false,
  playerOpen: false,
  playerRecordingId: null,
  playerRecording: null,
  playerMode: 'timeline',

  startRecording: async (conversationId, options) => {
    const result = await window.api.vcrStart({
      conversationId,
      fullCapture: options?.fullCapture,
      modelId: options?.modelId,
      providerId: options?.providerId,
      workspacePath: options?.workspacePath,
      roleId: options?.roleId
    })
    set({
      isRecording: true,
      activeRecording: {
        recordingId: result.recordingId,
        conversationId,
        startedAt: Date.now(),
        eventCount: 0,
        toolCallCount: 0,
        fullCapture: options?.fullCapture ?? false
      }
    })
  },

  stopRecording: async () => {
    await window.api.vcrStop()
    set({ isRecording: false, activeRecording: null })
  },

  refreshStatus: async () => {
    const status = await window.api.vcrStatus()
    set({ isRecording: status.recording, activeRecording: status.info ?? null })
  },

  loadRecordings: async () => {
    const recordings = await window.api.vcrList()
    set({ recordings })
  },

  openList: () => {
    get().loadRecordings()
    set({ listOpen: true })
  },

  closeList: () => set({ listOpen: false }),

  deleteRecording: async (recordingId) => {
    await window.api.vcrDelete(recordingId)
    set((state) => ({
      recordings: state.recordings.filter((r) => r.recordingId !== recordingId)
    }))
  },

  openPlayer: async (recordingId) => {
    const recording = await window.api.vcrGet(recordingId)
    set({
      playerOpen: true,
      playerRecordingId: recordingId,
      playerRecording: recording,
      playerMode: 'timeline',
      listOpen: false
    })
  },

  closePlayer: () =>
    set({
      playerOpen: false,
      playerRecordingId: null,
      playerRecording: null
    }),

  togglePlayerMode: () =>
    set((state) => ({
      playerMode: state.playerMode === 'timeline' ? 'replay' : 'timeline'
    })),

  exportHtml: async (recordingId, anonymize) => {
    await window.api.vcrExportHtml(recordingId, anonymize)
  },

  exportVcr: async (recordingId) => {
    await window.api.vcrExportVcr(recordingId)
  }
}))
