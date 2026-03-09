import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI, SendMessagePayload, StreamChunk } from './types'

// Expose une API securisee au renderer — JAMAIS ipcRenderer directement
const api: ElectronAPI = {
  // ── Chat ──────────────────────────────────────────────
  sendMessage: (payload: SendMessagePayload): Promise<void> =>
    ipcRenderer.invoke('chat:send', payload),

  cancelStream: (): Promise<void> =>
    ipcRenderer.invoke('chat:cancel'),

  onChunk: (callback: (chunk: StreamChunk) => void): void => {
    ipcRenderer.on('chat:chunk', (_event, chunk: StreamChunk) => callback(chunk))
  },

  offChunk: (): void => {
    ipcRenderer.removeAllListeners('chat:chunk')
  },

  // ── Conversations ─────────────────────────────────────
  getConversations: (): Promise<ReturnType<ElectronAPI['getConversations']>> =>
    ipcRenderer.invoke('conversations:list'),

  createConversation: (title?: string): Promise<ReturnType<ElectronAPI['createConversation']>> =>
    ipcRenderer.invoke('conversations:create', title),

  deleteConversation: (id: string): Promise<void> =>
    ipcRenderer.invoke('conversations:delete', id),

  renameConversation: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('conversations:rename', id, title),

  getMessages: (conversationId: string): Promise<ReturnType<ElectronAPI['getMessages']>> =>
    ipcRenderer.invoke('conversations:messages', conversationId),

  // ── Providers ─────────────────────────────────────────
  getProviders: (): Promise<ReturnType<ElectronAPI['getProviders']>> =>
    ipcRenderer.invoke('providers:list'),

  getModels: (providerId?: string): Promise<ReturnType<ElectronAPI['getModels']>> =>
    ipcRenderer.invoke('providers:models', providerId),

  setApiKey: (providerId: string, apiKey: string): Promise<void> =>
    ipcRenderer.invoke('providers:setApiKey', providerId, apiKey),

  validateApiKey: (providerId: string, apiKey: string): Promise<boolean> =>
    ipcRenderer.invoke('providers:validateApiKey', providerId, apiKey),

  hasApiKey: (providerId: string): Promise<boolean> =>
    ipcRenderer.invoke('providers:hasApiKey', providerId),

  getApiKeyMasked: (providerId: string): Promise<string | null> =>
    ipcRenderer.invoke('providers:getApiKeyMasked', providerId),

  // ── Events ────────────────────────────────────────────
  onConversationUpdated: (callback: (data: { id: string; title: string }) => void): void => {
    ipcRenderer.on('conversation:updated', (_event, data) => callback(data))
  },

  offConversationUpdated: (): void => {
    ipcRenderer.removeAllListeners('conversation:updated')
  },

  // ── Settings ──────────────────────────────────────────
  getSetting: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('settings:get', key),

  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value)
}

contextBridge.exposeInMainWorld('api', api)
