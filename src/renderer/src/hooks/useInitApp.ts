import { useEffect, useRef, useCallback } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore, type Model } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useRemoteStore } from '@/stores/remote.store'
import { useRemoteServerStore } from '@/stores/remote-server.store'

const LOCAL_PROVIDERS_POLL_MS = 30_000

/**
 * Initializes the app by loading conversations and providers from the main process.
 * Called once at app startup.
 */
export function useInitApp() {
  const setConversations = useConversationsStore((s) => s.setConversations)
  const setProviders = useProvidersStore((s) => s.setProviders)
  const setModels = useProvidersStore((s) => s.setModels)
  const setProviderOnline = useProvidersStore((s) => s.setProviderOnline)
  const setLocalModels = useProvidersStore((s) => s.setLocalModels)
  const loadMcpServers = useMcpStore((s) => s.loadServers)
  const loadMemoryFragments = useMemoryStore((s) => s.loadFragments)
  const loadRemoteConfig = useRemoteStore((s) => s.loadConfig)
  const handleRemoteStatusChange = useRemoteStore((s) => s.handleStatusChange)
  const loadRemoteServerConfig = useRemoteServerStore((s) => s.loadConfig)
  const handleRemoteServerStatusChange = useRemoteServerStore((s) => s.handleStatusChange)

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const pollLocalProviders = useCallback(async () => {
    try {
      const status = await window.api.detectLocalProviders()

      setProviderOnline('lmstudio', status.lmstudio)
      setProviderOnline('ollama', status.ollama)

      if (status.lmstudio) {
        const models = await window.api.getLocalModels('lmstudio')
        setLocalModels('lmstudio', models as Model[])
      } else {
        setLocalModels('lmstudio', [])
      }

      if (status.ollama) {
        const models = await window.api.getLocalModels('ollama')
        setLocalModels('ollama', models as Model[])
      } else {
        setLocalModels('ollama', [])
      }
    } catch {
      // Silent fail — local providers are optional
    }
  }, [setProviderOnline, setLocalModels])

  useEffect(() => {
    async function init() {
      try {
        const [conversations, providers, models] = await Promise.all([
          window.api.getConversations(),
          window.api.getProviders(),
          window.api.getModels()
        ])
        setConversations(conversations)
        setProviders(providers)
        setModels(models)

        // Restore default model from persisted settings
        const defaultModelId = useSettingsStore.getState().defaultModelId ?? ''
        if (defaultModelId.includes('::')) {
          const [providerId, modelId] = defaultModelId.split('::')
          if (providerId && modelId) {
            useProvidersStore.getState().selectModel(providerId, modelId)
          }
        }

        // Initial detection + start polling for local providers
        pollLocalProviders()
        pollRef.current = setInterval(pollLocalProviders, LOCAL_PROVIDERS_POLL_MS)

        // Load MCP servers (non-blocking)
        loadMcpServers().catch((err) => console.warn('[Init] MCP load failed:', err))

        // Load memory fragments (non-blocking)
        loadMemoryFragments().catch((err) => console.warn('[Init] Memory load failed:', err))

        // Load remote config (non-blocking)
        loadRemoteConfig().catch((err) => console.warn('[Init] Remote load failed:', err))

        // Load remote server config (non-blocking)
        loadRemoteServerConfig().catch((err) => console.warn('[Init] Remote Server load failed:', err))

        // Listen for remote status changes
        window.api.onRemoteStatusChanged(handleRemoteStatusChange)

        // Listen for remote server status changes
        window.api.onRemoteServerStatusChanged(handleRemoteServerStatusChange)
      } catch (error) {
        console.error('Failed to initialize app:', error)
      }
    }
    init()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      window.api.offRemoteStatusChanged()
      window.api.offRemoteServerStatusChanged()
    }
  }, [setConversations, setProviders, setModels, pollLocalProviders, loadMcpServers, loadMemoryFragments, loadRemoteConfig, handleRemoteStatusChange, loadRemoteServerConfig, handleRemoteServerStatusChange])
}
