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
  ttsProvider: TtsProvider
  favoriteModelIds: string[]

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
  setTtsProvider: (provider: TtsProvider) => void
  toggleFavoriteModel: (modelId: string) => void
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
      favoriteModelIds: [],

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
      setTtsProvider: (provider) => set({ ttsProvider: provider }),
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
