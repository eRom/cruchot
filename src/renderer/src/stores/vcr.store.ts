import { create } from 'zustand'
import type { ActiveRecordingInfo } from '../../../preload/types'

interface VcrState {
  isRecording: boolean
  activeRecording: ActiveRecordingInfo | null

  startRecording: (
    conversationId: string,
    options?: {
      modelId?: string
      providerId?: string
      workspacePath?: string
      roleId?: string
    }
  ) => Promise<void>
  stopRecording: () => Promise<void>
  refreshStatus: () => Promise<void>
}

export const useVcrStore = create<VcrState>((set) => ({
  isRecording: false,
  activeRecording: null,

  startRecording: async (conversationId, options) => {
    const result = await window.api.vcrStart({
      conversationId,
      fullCapture: true, // always full capture
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
        fullCapture: true
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
  }
}))
