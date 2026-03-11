import { create } from 'zustand'
import type {
  RemoteServerStatus,
  RemoteServerConfig,
  RemoteServerClientInfo,
  RemoteServerStatusEvent,
  RemoteServerPairingResult,
  AutoApproveSettings
} from '../../../preload/types'

interface RemoteServerState {
  status: RemoteServerStatus
  config: RemoteServerConfig | null
  clients: RemoteServerClientInfo[]
  pairingCode: string | null
  pairingUrl: string | null
  pairingWsUrl: string | null
  pairingQrDataUrl: string | null
  loading: boolean

  loadConfig: () => Promise<void>
  start: (conversationId?: string) => Promise<void>
  stop: () => Promise<void>
  setConfig: (data: { port?: number; cfToken?: string | null; cfHostname?: string | null }) => Promise<void>
  generatePairing: (conversationId?: string) => Promise<RemoteServerPairingResult>
  disconnectClient: (clientId: string) => Promise<void>
  loadClients: () => Promise<void>
  setAutoApprove: (data: AutoApproveSettings) => Promise<void>
  handleStatusChange: (event: RemoteServerStatusEvent) => void
}

export const useRemoteServerStore = create<RemoteServerState>((set, get) => ({
  status: 'stopped',
  config: null,
  clients: [],
  pairingCode: null,
  pairingUrl: null,
  pairingWsUrl: null,
  pairingQrDataUrl: null,
  loading: false,

  loadConfig: async () => {
    set({ loading: true })
    try {
      const config = await window.api.remoteServerGetConfig()
      set({
        config,
        status: config.isRunning ? 'running' : 'stopped'
      })
    } finally {
      set({ loading: false })
    }
  },

  start: async (conversationId?: string) => {
    set({ loading: true })
    try {
      await window.api.remoteServerStart(conversationId ? { conversationId } : undefined)
      await get().loadConfig()
    } finally {
      set({ loading: false })
    }
  },

  stop: async () => {
    set({ loading: true })
    try {
      await window.api.remoteServerStop()
      set({
        status: 'stopped',
        pairingCode: null,
        pairingUrl: null,
        pairingWsUrl: null,
        pairingQrDataUrl: null,
        clients: []
      })
      await get().loadConfig()
    } finally {
      set({ loading: false })
    }
  },

  setConfig: async (data) => {
    set({ loading: true })
    try {
      const config = await window.api.remoteServerSetConfig(data)
      set({ config })
    } finally {
      set({ loading: false })
    }
  },

  generatePairing: async (conversationId?: string) => {
    const result = await window.api.remoteServerGeneratePairing(
      conversationId ? { conversationId } : undefined
    )
    set({
      pairingCode: result.code,
      pairingUrl: result.url,
      pairingWsUrl: result.wsUrl,
      pairingQrDataUrl: result.qrDataUrl
    })
    return result
  },

  disconnectClient: async (clientId: string) => {
    await window.api.remoteServerDisconnectClient(clientId)
    await get().loadClients()
  },

  loadClients: async () => {
    const clients = await window.api.remoteServerGetClients()
    set({ clients })
  },

  setAutoApprove: async (data: AutoApproveSettings) => {
    await window.api.remoteServerSetAutoApprove(data)
  },

  handleStatusChange: (event: RemoteServerStatusEvent) => {
    set({ status: event.status })
    get().loadConfig().catch(() => {})
    get().loadClients().catch(() => {})
  }
}))
