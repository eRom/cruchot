import { create } from 'zustand'
import type { McpServerInfo, McpServerStatus, McpStatusEvent } from '../../../preload/types'

interface McpState {
  servers: McpServerInfo[]
  loading: boolean

  loadServers: () => Promise<void>
  createServer: (data: Parameters<typeof window.api.mcpCreate>[0]) => Promise<McpServerInfo>
  updateServer: (id: string, data: Parameters<typeof window.api.mcpUpdate>[1]) => Promise<void>
  deleteServer: (id: string) => Promise<void>
  toggleServer: (id: string) => Promise<void>
  startServer: (id: string) => Promise<void>
  stopServer: (id: string) => Promise<void>
  restartServer: (id: string) => Promise<void>
  testConnection: (data: Parameters<typeof window.api.mcpTest>[0]) => Promise<{ success: boolean; toolCount: number; toolNames: string[]; error?: string }>
  handleStatusChange: (event: McpStatusEvent) => void
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  loading: false,

  loadServers: async () => {
    set({ loading: true })
    try {
      const servers = await window.api.mcpList()
      set({ servers })
    } finally {
      set({ loading: false })
    }
  },

  createServer: async (data) => {
    const server = await window.api.mcpCreate(data)
    await get().loadServers()
    return server
  },

  updateServer: async (id, data) => {
    await window.api.mcpUpdate(id, data)
    await get().loadServers()
  },

  deleteServer: async (id) => {
    await window.api.mcpDelete(id)
    set({ servers: get().servers.filter((s) => s.id !== id) })
  },

  toggleServer: async (id) => {
    await window.api.mcpToggle(id)
    await get().loadServers()
  },

  startServer: async (id) => {
    await window.api.mcpStart(id)
    await get().loadServers()
  },

  stopServer: async (id) => {
    await window.api.mcpStop(id)
    await get().loadServers()
  },

  restartServer: async (id) => {
    await window.api.mcpRestart(id)
    await get().loadServers()
  },

  testConnection: async (data) => {
    return await window.api.mcpTest(data)
  },

  handleStatusChange: (event: McpStatusEvent) => {
    set({
      servers: get().servers.map((s) =>
        s.id === event.serverId
          ? { ...s, status: event.status, error: event.error, toolCount: event.toolCount }
          : s
      )
    })
  }
}))
