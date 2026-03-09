import { useEffect } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'

/**
 * Initializes the app by loading conversations and providers from the main process.
 * Called once at app startup.
 */
export function useInitApp() {
  const setConversations = useConversationsStore((s) => s.setConversations)
  const setProviders = useProvidersStore((s) => s.setProviders)
  const setModels = useProvidersStore((s) => s.setModels)

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
      } catch (error) {
        console.error('Failed to initialize app:', error)
      }
    }
    init()
  }, [setConversations, setProviders, setModels])
}
