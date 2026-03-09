import { useEffect } from 'react'
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store'

/**
 * Applies the selected theme (dark/light/system) to the document.
 * Listens for system preference changes when in 'system' mode.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement

    function applyTheme(mode: ThemeMode) {
      if (mode === 'dark') {
        root.classList.add('dark')
      } else if (mode === 'light') {
        root.classList.remove('dark')
      } else {
        // System mode — follow OS preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
    }

    applyTheme(theme)

    // Listen for system preference changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [theme])

  return <>{children}</>
}
