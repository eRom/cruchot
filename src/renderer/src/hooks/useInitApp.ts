import { useEffect, useRef, useCallback } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore, type Model } from '@/stores/providers.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useMemoryStore } from '@/stores/memory.store'

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

        // Initial detection + start polling for local providers
        pollLocalProviders()
        pollRef.current = setInterval(pollLocalProviders, LOCAL_PROVIDERS_POLL_MS)

        // Load MCP servers (non-blocking)
        loadMcpServers().catch((err) => console.warn('[Init] MCP load failed:', err))

        // Load memory fragments (non-blocking)
        loadMemoryFragments().catch((err) => console.warn('[Init] Memory load failed:', err))
      } catch (error) {
        console.error('Failed to initialize app:', error)
      }
    }
    init()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [setConversations, setProviders, setModels, pollLocalProviders, loadMcpServers, loadMemoryFragments])
}
