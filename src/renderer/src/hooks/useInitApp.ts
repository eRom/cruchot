import { useEffect } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useMemoryStore } from '@/stores/memory.store'

/**
 * Initializes the app by loading conversations and providers from the main process.
 * Called once at app startup.
 */
export function useInitApp() {
  const setConversations = useConversationsStore((s) => s.setConversations)
  const setProviders = useProvidersStore((s) => s.setProviders)
  const setModels = useProvidersStore((s) => s.setModels)
  const loadMcpServers = useMcpStore((s) => s.loadServers)
  const loadMemoryFragments = useMemoryStore((s) => s.loadFragments)

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

        // Load MCP servers (non-blocking)
        loadMcpServers().catch((err) => console.warn('[Init] MCP load failed:', err))

        // Load memory fragments (non-blocking)
        loadMemoryFragments().catch((err) => console.warn('[Init] Memory load failed:', err))
      } catch (error) {
        console.error('Failed to initialize app:', error)
      }
    }
    init()
  }, [setConversations, setProviders, setModels, loadMcpServers, loadMemoryFragments])
}
