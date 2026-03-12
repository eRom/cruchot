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

      setDefaultModelId: (modelId) => set({ defaultModelId: modelId }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),
      setFontSize: (size) => set({ fontSize: size }),
      setFontSizePx: (px) => set({ fontSizePx: px }),
      setDensity: (density) => set({ density }),
      setMessageWidth: (percent) => set({ messageWidth: percent }),
      setTemperature: (value) => set({ temperature: value }),
      setMaxTokens: (value) => set({ maxTokens: value }),
      setTopP: (value) => set({ topP: value }),
      setThinkingEffort: (value) => set({ thinkingEffort: value }),
      setSummaryModelId: (modelId) => set({ summaryModelId: modelId }),
      setSummaryPrompt: (prompt) => set({ summaryPrompt: prompt.slice(0, 10_000) }),
      setTtsProvider: (provider) => set({ ttsProvider: provider }),
      setUserName: (name) => set({ userName: name.trim().slice(0, 50) }),
      setUserAvatarPath: (path) => set({ userAvatarPath: path }),
      setSearchEnabled: (value) => set({ searchEnabled: value }),
      toggleFavoriteModel: (modelId) =>
        set((state) => ({
          favoriteModelIds: state.favoriteModelIds.includes(modelId)
            ? state.favoriteModelIds.filter((id) => id !== modelId)
            : [...state.favoriteModelIds, modelId]
        })),
    }),
    {
      name: 'multi-llm-settings'
    }
  )
)
