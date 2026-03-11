import { create } from 'zustand'
import type { RemoteStatus, RemoteConfig, RemoteStatusEvent, AutoApproveSettings } from '../../../preload/types'

interface RemoteState {
  status: RemoteStatus
  config: RemoteConfig | null
  pairingCode: string | null
  loading: boolean

  loadConfig: () => Promise<void>
  configure: (token: string) => Promise<{ botUsername: string }>
  start: (conversationId?: string) => Promise<string>
  stop: () => Promise<void>
  setAutoApprove: (data: AutoApproveSettings) => Promise<void>
  deleteToken: () => Promise<void>
  handleStatusChange: (event: RemoteStatusEvent) => void
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
  status: 'disconnected',
  config: null,
  pairingCode: null,
  loading: false,

  loadConfig: async () => {
    set({ loading: true })
    try {
      const config = await window.api.remoteGetConfig()
      set({ config, status: config.status })
    } finally {
      set({ loading: false })
    }
  },

  configure: async (token: string) => {
    set({ loading: true })
    try {
      const result = await window.api.remoteConfigure(token)
      await get().loadConfig()
      return result
    } finally {
      set({ loading: false })
    }
  },

  start: async (conversationId?: string) => {
    set({ loading: true })
    try {
      const { pairingCode } = await window.api.remoteStart(conversationId)
      set({ pairingCode, status: 'pairing' })
      return pairingCode
    } finally {
      set({ loading: false })
    }
  },

  stop: async () => {
    set({ loading: true })
    try {
      await window.api.remoteStop()
      set({ status: 'disconnected', pairingCode: null })
      await get().loadConfig()
    } finally {
      set({ loading: false })
    }
  },

  setAutoApprove: async (data: AutoApproveSettings) => {
    await window.api.remoteSetAutoApprove(data)
    await get().loadConfig()
  },

  deleteToken: async () => {
    set({ loading: true })
    try {
      await window.api.remoteDeleteToken()
      set({ status: 'disconnected', config: null, pairingCode: null })
    } finally {
      set({ loading: false })
    }
  },

  handleStatusChange: (event: RemoteStatusEvent) => {
    set({ status: event.status })
    // Reload full config to get updated session info
    get().loadConfig().catch(() => {})
  }
}))
