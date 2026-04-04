import { create } from 'zustand'
import type { OneiricRun, OneiricSchedule } from '../../../preload/types'

interface OneiricState {
  isRunning: boolean
  currentPhase: number | null
  runs: OneiricRun[]
  isLoaded: boolean
  modelId: string | null
  schedule: OneiricSchedule | null

  loadRuns: () => Promise<void>
  loadStatus: () => Promise<void>
  consolidateNow: () => Promise<void>
  cancel: () => Promise<void>
  setModel: (modelId: string) => Promise<void>
  clearModel: () => Promise<void>
  setSchedule: (schedule: OneiricSchedule) => Promise<void>
  setCurrentPhase: (phase: number | null) => void
}

export const useOneiricStore = create<OneiricState>((set) => ({
  isRunning: false,
  currentPhase: null,
  runs: [],
  isLoaded: false,
  modelId: null,
  schedule: null,

  loadRuns: async () => {
    const runs = await window.api.oneiricListRuns()
    set({ runs, isLoaded: true })
  },

  loadStatus: async () => {
    const status = await window.api.oneiricStatus()
    set({ isRunning: status.isRunning })

    const modelId = await window.api.getSetting('multi-llm:oneiric-model-id')
    const scheduleRaw = await window.api.getSetting('multi-llm:oneiric-schedule')
    const schedule = scheduleRaw ? (JSON.parse(scheduleRaw) as OneiricSchedule) : null
    set({ modelId, schedule })
  },

  consolidateNow: async () => {
    set({ isRunning: true, currentPhase: null })
    try {
      await window.api.oneiricConsolidateNow()
    } finally {
      const runs = await window.api.oneiricListRuns()
      const status = await window.api.oneiricStatus()
      set({ runs, isRunning: status.isRunning, currentPhase: null })
    }
  },

  cancel: async () => {
    await window.api.oneiricCancel()
    set({ isRunning: false, currentPhase: null })
  },

  setModel: async (modelId) => {
    await window.api.oneiricSetModel({ modelId })
    set({ modelId })
  },

  clearModel: async () => {
    await window.api.oneiricSetModel({ modelId: '' })
    set({ modelId: null })
  },

  setSchedule: async (schedule) => {
    await window.api.oneiricSetSchedule(schedule)
    set({ schedule })
  },

  setCurrentPhase: (phase) => set({ currentPhase: phase })
}))
