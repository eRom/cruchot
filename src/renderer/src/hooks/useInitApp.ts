import { useEffect, useRef, useCallback } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore, type Model } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useMemoryStore } from '@/stores/memory.store'
import { useRemoteStore } from '@/stores/remote.store'
import { useRemoteServerStore } from '@/stores/remote-server.store'
import { useSlashCommandsStore } from '@/stores/slash-commands.store'

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
  const loadSlashCommands = useSlashCommandsStore((s) => s.loadCommands)

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

        // Restore all settings from DB (survives localStorage flush)
        try {
          const keys = [
            'multi-llm:user-name',
            'multi-llm:user-avatar-path',
            'multi-llm:search-enabled',
            'multi-llm:theme',
            'multi-llm:language',
            'multi-llm:sidebar-collapsed',
            'multi-llm:font-size',
            'multi-llm:font-size-px',
            'multi-llm:density',
            'multi-llm:message-width',
            'multi-llm:temperature',
            'multi-llm:max-tokens',
            'multi-llm:top-p',
            'multi-llm:thinking-effort',
            'multi-llm:default-model-id',
            'multi-llm:summary-model-id',
            'multi-llm:summary-prompt',
            'multi-llm:tts-provider',
            'multi-llm:favorite-model-ids'
          ] as const

          const values = await Promise.all(keys.map((k) => window.api.getSetting(k)))
          const map = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<string, string | null>

          const patch: Record<string, unknown> = {}
          if (map['multi-llm:user-name'] !== null) patch.userName = map['multi-llm:user-name']
          if (map['multi-llm:user-avatar-path'] !== null) patch.userAvatarPath = map['multi-llm:user-avatar-path']
          if (map['multi-llm:search-enabled'] !== null) patch.searchEnabled = map['multi-llm:search-enabled'] === 'true'
          if (map['multi-llm:theme'] !== null) patch.theme = map['multi-llm:theme']
          if (map['multi-llm:language'] !== null) patch.language = map['multi-llm:language']
          if (map['multi-llm:sidebar-collapsed'] !== null) patch.sidebarCollapsed = map['multi-llm:sidebar-collapsed'] === 'true'
          if (map['multi-llm:font-size'] !== null) patch.fontSize = map['multi-llm:font-size']
          if (map['multi-llm:font-size-px'] !== null) patch.fontSizePx = Number(map['multi-llm:font-size-px'])
          if (map['multi-llm:density'] !== null) patch.density = map['multi-llm:density']
          if (map['multi-llm:message-width'] !== null) patch.messageWidth = Number(map['multi-llm:message-width'])
          if (map['multi-llm:temperature'] !== null) patch.temperature = Number(map['multi-llm:temperature'])
          if (map['multi-llm:max-tokens'] !== null) patch.maxTokens = Number(map['multi-llm:max-tokens'])
          if (map['multi-llm:top-p'] !== null) patch.topP = Number(map['multi-llm:top-p'])
          if (map['multi-llm:thinking-effort'] !== null) patch.thinkingEffort = map['multi-llm:thinking-effort']
          if (map['multi-llm:default-model-id'] !== null) patch.defaultModelId = map['multi-llm:default-model-id']
          if (map['multi-llm:summary-model-id'] !== null) patch.summaryModelId = map['multi-llm:summary-model-id']
          if (map['multi-llm:summary-prompt'] !== null) patch.summaryPrompt = map['multi-llm:summary-prompt']
          if (map['multi-llm:tts-provider'] !== null) patch.ttsProvider = map['multi-llm:tts-provider']
          if (map['multi-llm:favorite-model-ids'] !== null) {
            try { patch.favoriteModelIds = JSON.parse(map['multi-llm:favorite-model-ids']!) } catch { /* ignore */ }
          }

          if (Object.keys(patch).length > 0) {
            useSettingsStore.setState(patch)
          }
        } catch { /* ignore */ }

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

        // Load slash commands (non-blocking)
        loadSlashCommands().catch((err) => console.warn('[Init] Slash commands load failed:', err))

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
  }, [setConversations, setProviders, setModels, pollLocalProviders, loadMcpServers, loadMemoryFragments, loadRemoteConfig, handleRemoteStatusChange, loadRemoteServerConfig, handleRemoteServerStatusChange, loadSlashCommands])
}
