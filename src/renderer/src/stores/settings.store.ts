import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Density = 'compact' | 'normal' | 'comfortable'
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high'
export type TtsProvider = 'browser' | 'openai' | 'google'

interface SettingsState {
  theme: ThemeMode
  language: 'fr' | 'en'
  sidebarCollapsed: boolean
  fontSize: 'small' | 'medium' | 'large'
  fontSizePx: number
  density: Density
  messageWidth: number
  temperature: number
  maxTokens: number
  topP: number
  thinkingEffort: ThinkingEffort
  defaultModelId: string
  summaryModelId: string
  summaryPrompt: string
  ttsProvider: TtsProvider
  favoriteModelIds: string[]
  userName: string
  userAvatarPath: string
  searchEnabled: boolean
  semanticMemoryEnabled: boolean
  yoloMode: boolean
  liveModelId: string
  liveIdentityPrompt: string
  hasShownScreenShareNotice: boolean

  setDefaultModelId: (modelId: string) => void
  setTheme: (theme: ThemeMode) => void
  setLanguage: (language: 'fr' | 'en') => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setFontSize: (size: 'small' | 'medium' | 'large') => void
  setFontSizePx: (px: number) => void
  setDensity: (density: Density) => void
  setMessageWidth: (percent: number) => void
  setTemperature: (value: number) => void
  setMaxTokens: (value: number) => void
  setTopP: (value: number) => void
  setThinkingEffort: (value: ThinkingEffort) => void
  setSummaryModelId: (modelId: string) => void
  setSummaryPrompt: (prompt: string) => void
  setTtsProvider: (provider: TtsProvider) => void
  toggleFavoriteModel: (modelId: string) => void
  setUserName: (name: string) => void
  setUserAvatarPath: (path: string) => void
  setSearchEnabled: (value: boolean) => void
  setSemanticMemoryEnabled: (value: boolean) => void
  setYoloMode: (value: boolean) => void
  setLiveModelId: (modelId: string) => void
  setLiveIdentityPrompt: (prompt: string) => void
  setHasShownScreenShareNotice: (shown: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'fr',
      sidebarCollapsed: false,
      fontSize: 'medium',
      fontSizePx: 14,
      density: 'normal',
      messageWidth: 75,
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.5,
      thinkingEffort: 'medium' as ThinkingEffort,
      ttsProvider: 'browser' as TtsProvider,
      defaultModelId: '',
      summaryModelId: '',
      summaryPrompt: `Tu es un assistant specialise dans la synthese de conversations. Genere un resume structure et concis de la conversation suivante.

Le resume doit inclure :
- Les sujets principaux abordes
- Les decisions prises ou conclusions atteintes
- Les actions ou taches mentionnees
- Les points cles a retenir

Format : sections avec titres, bullet points. Sois concis mais complet.`,
      favoriteModelIds: [],
      userName: '',
      userAvatarPath: '',
      searchEnabled: false,
      semanticMemoryEnabled: true,
      yoloMode: false,
      liveModelId: 'gemini-3.1-flash-live-preview',
      liveIdentityPrompt: `- Communication en temps réel via audio (live)\n- Langue : Français par défaut.\n- Personnalité : Concis, efficace, ton chaleureux.`,
      hasShownScreenShareNotice: false,

      setDefaultModelId: (modelId) => {
        set({ defaultModelId: modelId })
        window.api.setSetting('multi-llm:default-model-id', modelId).catch(() => {})
      },
      setTheme: (theme) => {
        set({ theme })
        window.api.setSetting('multi-llm:theme', theme).catch(() => {})
      },
      setLanguage: (language) => {
        set({ language })
        window.api.setSetting('multi-llm:language', language).catch(() => {})
      },
      toggleSidebar: () =>
        set((state) => {
          const collapsed = !state.sidebarCollapsed
          window.api.setSetting('multi-llm:sidebar-collapsed', String(collapsed)).catch(() => {})
          return { sidebarCollapsed: collapsed }
        }),
      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed })
        window.api.setSetting('multi-llm:sidebar-collapsed', String(collapsed)).catch(() => {})
      },
      setFontSize: (size) => {
        set({ fontSize: size })
        window.api.setSetting('multi-llm:font-size', size).catch(() => {})
      },
      setFontSizePx: (px) => {
        set({ fontSizePx: px })
        window.api.setSetting('multi-llm:font-size-px', String(px)).catch(() => {})
      },
      setDensity: (density) => {
        set({ density })
        window.api.setSetting('multi-llm:density', density).catch(() => {})
      },
      setMessageWidth: (percent) => {
        set({ messageWidth: percent })
        window.api.setSetting('multi-llm:message-width', String(percent)).catch(() => {})
      },
      setTemperature: (value) => {
        set({ temperature: value })
        window.api.setSetting('multi-llm:temperature', String(value)).catch(() => {})
      },
      setMaxTokens: (value) => {
        set({ maxTokens: value })
        window.api.setSetting('multi-llm:max-tokens', String(value)).catch(() => {})
      },
      setTopP: (value) => {
        set({ topP: value })
        window.api.setSetting('multi-llm:top-p', String(value)).catch(() => {})
      },
      setThinkingEffort: (value) => {
        set({ thinkingEffort: value })
        window.api.setSetting('multi-llm:thinking-effort', value).catch(() => {})
      },
      setSummaryModelId: (modelId) => {
        set({ summaryModelId: modelId })
        window.api.setSetting('multi-llm:summary-model-id', modelId).catch(() => {})
      },
      setSummaryPrompt: (prompt) => {
        const trimmed = prompt.slice(0, 10_000)
        set({ summaryPrompt: trimmed })
        window.api.setSetting('multi-llm:summary-prompt', trimmed).catch(() => {})
      },
      setTtsProvider: (provider) => {
        set({ ttsProvider: provider })
        window.api.setSetting('multi-llm:tts-provider', provider).catch(() => {})
      },
      setUserName: (name) => {
        const trimmed = name.trim().slice(0, 50)
        set({ userName: trimmed })
        window.api.setSetting('multi-llm:user-name', trimmed).catch(() => {})
      },
      setUserAvatarPath: (path) => {
        set({ userAvatarPath: path })
        window.api.setSetting('multi-llm:user-avatar-path', path).catch(() => {})
      },
      setSearchEnabled: (value) => {
        set({ searchEnabled: value })
        window.api.setSetting('multi-llm:search-enabled', String(value)).catch(() => {})
      },
      setSemanticMemoryEnabled: (value) => {
        set({ semanticMemoryEnabled: value })
        window.api.setSetting('multi-llm:semantic-memory-enabled', String(value)).catch(() => {})
        window.api.semanticMemoryToggle({ enabled: value }).catch(() => {})
      },
      setYoloMode: (value) => set({ yoloMode: value }),
      setLiveModelId: (modelId) => {
        set({ liveModelId: modelId })
        window.api.setSetting('multi-llm:live-model-id', modelId).catch(() => {})
      },
      setLiveIdentityPrompt: (prompt) => {
        const trimmed = prompt.slice(0, 5_000)
        set({ liveIdentityPrompt: trimmed })
        window.api.setSetting('multi-llm:live-identity-prompt', trimmed).catch(() => {})
      },
      setHasShownScreenShareNotice: (shown) => set({ hasShownScreenShareNotice: shown }),
      toggleFavoriteModel: (modelId) =>
        set((state) => {
          const updated = state.favoriteModelIds.includes(modelId)
            ? state.favoriteModelIds.filter((id) => id !== modelId)
            : [...state.favoriteModelIds, modelId]
          window.api.setSetting('multi-llm:favorite-model-ids', JSON.stringify(updated)).catch(() => {})
          return { favoriteModelIds: updated }
        }),
    }),
    {
      name: 'multi-llm-settings'
    }
  )
)
