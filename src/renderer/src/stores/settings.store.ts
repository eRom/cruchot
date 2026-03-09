import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ViewMode = 'chat' | 'settings' | 'statistics'

interface SettingsState {
  theme: ThemeMode
  language: 'fr' | 'en'
  sidebarCollapsed: boolean
  fontSize: 'small' | 'medium' | 'large'

  setTheme: (theme: ThemeMode) => void
  setLanguage: (language: 'fr' | 'en') => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setFontSize: (size: 'small' | 'medium' | 'large') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      language: 'fr',
      sidebarCollapsed: false,
      fontSize: 'medium',

      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),
      setFontSize: (size) => set({ fontSize: size })
    }),
    {
      name: 'multi-llm-settings'
    }
  )
)
