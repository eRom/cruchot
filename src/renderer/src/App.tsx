import React from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/common/ThemeProvider'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AppLayout } from '@/components/layout/AppLayout'
import ChatView from '@/components/chat/ChatView'
import { SettingsView } from '@/components/settings/SettingsView'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useInitApp } from '@/hooks/useInitApp'
import { useStreaming } from '@/hooks/useStreaming'

function App(): React.JSX.Element {
  useInitApp()
  useStreaming()
  const currentView = useUiStore((s) => s.currentView)
  const theme = useSettingsStore((s) => s.theme)

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <AppLayout>
            {currentView === 'chat' && <ChatView />}
            {currentView === 'settings' && <SettingsView />}
            {currentView === 'statistics' && (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-muted-foreground text-sm">Statistiques</p>
              </div>
            )}
          </AppLayout>
          <Toaster
            theme={theme === 'system' ? 'system' : theme}
            position="bottom-right"
            richColors
            closeButton
          />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
