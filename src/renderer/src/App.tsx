import React, { Suspense, useCallback, useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/common/ThemeProvider'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { AppLayout } from '@/components/layout/AppLayout'
import { UpdateNotification } from '@/components/common/UpdateNotification'
import { OfflineIndicator } from '@/components/common/OfflineIndicator'
import CommandPalette from '@/components/common/CommandPalette'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import ChatView from '@/components/chat/ChatView'

// Lazy-load non-chat views — reduces initial bundle by ~2MB
const SettingsView = React.lazy(() => import('@/components/settings/SettingsView').then(m => ({ default: m.SettingsView })))
const CustomizeView = React.lazy(() => import('@/components/customize/CustomizeView').then(m => ({ default: m.CustomizeView })))
const StatsView = React.lazy(() => import('@/components/statistics/StatsView').then(m => ({ default: m.StatsView })))
const ImagesView = React.lazy(() => import('@/components/images/ImagesView').then(m => ({ default: m.ImagesView })))
const ProjectsView = React.lazy(() => import('@/components/projects/ProjectsView').then(m => ({ default: m.ProjectsView })))
const TasksView = React.lazy(() => import('@/components/tasks/TasksView').then(m => ({ default: m.TasksView })))
const ArenaView = React.lazy(() => import('@/components/arena/ArenaView').then(m => ({ default: m.ArenaView })))
const SearchView = React.lazy(() => import('@/components/search/SearchView').then(m => ({ default: m.SearchView })))
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useLiveStore } from '@/stores/live.store'
import { useInitApp } from '@/hooks/useInitApp'
import { useStreaming } from '@/hooks/useStreaming'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

function App(): React.JSX.Element {
  useInitApp()
  useStreaming()

  const currentView = useUiStore((s) => s.currentView)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const isStreaming = useUiStore((s) => s.isStreaming)
  const theme = useSettingsStore((s) => s.theme)
  const addConversation = useConversationsStore((s) => s.addConversation)
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const setActiveProject = useProjectsStore((s) => s.setActiveProject)
  const projects = useProjectsStore((s) => s.projects)
  const selectModel = useProvidersStore((s) => s.selectModel)

  // ── Keyboard shortcuts ──────────────────────────────
  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await window.api.createConversation(undefined, activeProjectId ?? undefined)
      if (conv) {
        addConversation(conv)
        setActiveConversation(conv.id)
        setCurrentView('chat')
      }
    } catch (err) {
      console.error('Failed to create conversation:', err)
    }
  }, [addConversation, setActiveConversation, setCurrentView, activeProjectId])

  const handleCommandPalette = useCallback(() => {
    setCommandPaletteOpen(!commandPaletteOpen)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  const setSettingsTab = useUiStore((s) => s.setSettingsTab)

  const handleSettings = useCallback(() => {
    setSettingsTab('general')
    setCurrentView('settings')
  }, [setSettingsTab, setCurrentView])

  const handleModelList = useCallback(() => {
    setSettingsTab('model')
    setCurrentView('settings')
  }, [setSettingsTab, setCurrentView])

  const handleToggleSidebar = useCallback(() => {
    useSettingsStore.getState().toggleSidebar()
  }, [])

  const handleToggleRightPanel = useCallback(() => {
    useUiStore.getState().toggleRightPanel()
  }, [])

  const handleCustomize = useCallback(() => {
    setCurrentView('customize')
  }, [setCurrentView])

  const handleSearch = useCallback(() => {
    setCurrentView('search')
  }, [setCurrentView])

  const handleEscape = useCallback(async () => {
    if (commandPaletteOpen) {
      setCommandPaletteOpen(false)
      return
    }
    if (isStreaming) {
      try { await window.api.cancelStream() } catch { /* silent */ }
    }
  }, [commandPaletteOpen, setCommandPaletteOpen, isStreaming])

  useKeyboardShortcuts({
    onNewConversation: handleNewConversation,
    onCommandPalette: handleCommandPalette,
    onSettings: handleSettings,
    onModelList: handleModelList,
    onToggleSidebar: handleToggleSidebar,
    onToggleRightPanel: handleToggleRightPanel,
    onCustomize: handleCustomize,
    onSearch: handleSearch,
    onEscape: handleEscape,
  })

  // ── Onboarding — show on first launch ───────────────
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    window.api.getSetting('multi-llm:onboarding_completed').then((val) => {
      if (val !== 'true') setShowOnboarding(true)
    })
  }, [])

  const handleOnboardingComplete = () => {
    window.api.setSetting('multi-llm:onboarding_completed', 'true')
    setShowOnboarding(false)
  }

  // ── Gemini Live — check availability on startup (retry to handle lazy init race)
  useEffect(() => {
    const check = () => useLiveStore.getState().refreshAvailability()
    check()
    // Retry after lazy init completes (lazyInitServices is async, no await)
    const timer = setTimeout(check, 3000)
    return () => clearTimeout(timer)
  }, [])

  // ── Gemini Live — wire CruchotCommandHandler events ──
  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail.view) {
        useUiStore.getState().setCurrentView(detail.view)
        // Navigate to a specific customize tab if provided
        if (detail.tab) {
          useUiStore.getState().setCustomizeTab(detail.tab)
        }
      } else if (detail.conversationId) {
        useConversationsStore.getState().setActiveConversation(detail.conversationId)
        useUiStore.getState().setCurrentView('chat')
      }
    }

    const handleToggleUi = (e: Event) => {
      const { element, state } = (e as CustomEvent).detail
      if (element === 'sidebar') {
        const store = useSettingsStore.getState()
        if (state === 'on') store.setSidebarCollapsed(false)
        else if (state === 'off') store.setSidebarCollapsed(true)
        else store.toggleSidebar()
      } else if (element === 'right-panel') {
        const store = useUiStore.getState()
        if (state === 'on') store.setOpenPanel('right')
        else if (state === 'off') store.setOpenPanel(null)
        else store.toggleRightPanel()
      } else if (element === 'yolo') {
        const convId = useConversationsStore.getState().activeConversationId
        if (convId) {
          const enable = state === 'on' ? true : state === 'off' ? false : true
          window.api.setYoloMode(convId, enable)
        }
      }
    }

    const handleChangeModel = (e: Event) => {
      const { modelId } = (e as CustomEvent).detail
      const [providerId, id] = modelId.split('::')
      useProvidersStore.getState().selectModel(providerId, id)
    }

    const handleChangeThinking = (e: Event) => {
      const { level } = (e as CustomEvent).detail
      useSettingsStore.getState().setThinkingEffort(level)
    }

    const handleSendPrompt = (e: Event) => {
      const { text } = (e as CustomEvent).detail
      useUiStore.getState().setDraftContent(text)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cruchot:submit-draft'))
      }, 100)
    }

    const handleSummarize = async () => {
      const convId = useConversationsStore.getState().activeConversationId
      if (!convId) return
      try {
        const store = useProvidersStore.getState()
        const modelId = useSettingsStore.getState().summaryModelId || `${store.selectedProviderId}::${store.selectedModelId}`
        const result = await window.api.summarizeConversation({
          conversationId: convId,
          modelId,
          prompt: useSettingsStore.getState().summaryPrompt
        })
        await navigator.clipboard.writeText(result.text)
      } catch { /* silencieux */ }
    }

    const handleFork = async () => {
      const convId = useConversationsStore.getState().activeConversationId
      if (!convId) return
      try {
        const forked = await window.api.forkConversation(convId)
        useConversationsStore.getState().addConversation(forked)
        useConversationsStore.getState().setActiveConversation(forked.id)
      } catch { /* silencieux */ }
    }

    window.addEventListener('cruchot:navigate', handleNavigate)
    window.addEventListener('cruchot:toggle-ui', handleToggleUi)
    window.addEventListener('cruchot:change-model', handleChangeModel)
    window.addEventListener('cruchot:change-thinking', handleChangeThinking)
    window.addEventListener('cruchot:send-prompt', handleSendPrompt)
    window.addEventListener('cruchot:summarize', handleSummarize)
    window.addEventListener('cruchot:fork', handleFork)

    return () => {
      window.removeEventListener('cruchot:navigate', handleNavigate)
      window.removeEventListener('cruchot:toggle-ui', handleToggleUi)
      window.removeEventListener('cruchot:change-model', handleChangeModel)
      window.removeEventListener('cruchot:change-thinking', handleChangeThinking)
      window.removeEventListener('cruchot:send-prompt', handleSendPrompt)
      window.removeEventListener('cruchot:summarize', handleSummarize)
      window.removeEventListener('cruchot:fork', handleFork)
    }
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          {/* Global banners */}
          <UpdateNotification />
          <OfflineIndicator />

          {/* Onboarding overlay */}
          {showOnboarding && (
            <OnboardingWizard onComplete={handleOnboardingComplete} />
          )}

          {/* Main app */}
          <AppLayout>
            {currentView === 'chat' && <ChatView />}
            <Suspense fallback={null}>
              {currentView === 'settings' && <SettingsView />}
              {currentView === 'customize' && <CustomizeView />}
              {currentView === 'statistics' && <StatsView />}
              {currentView === 'images' && <ImagesView />}
              {currentView === 'projects' && <ProjectsView />}
              {currentView === 'tasks' && <TasksView />}
              {currentView === 'arena' && <ArenaView />}
              {currentView === 'search' && <SearchView />}
            </Suspense>
          </AppLayout>

          {/* Command palette (Cmd+K) */}
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            onNewConversation={handleNewConversation}
            onOpenSettings={handleSettings}
            onSelectConversation={(id, projectId) => {
              const targetProject = projectId ?? null
              if (targetProject !== activeProjectId) {
                setActiveProject(targetProject)
              }
              setActiveConversation(id)
              setCurrentView('chat')
            }}
            onSelectProject={(id) => {
              setActiveProject(id)
              const project = projects.find((p) => p.id === id)
              if (project?.defaultModelId) {
                const [providerId, modelId] = project.defaultModelId.split('::')
                if (providerId && modelId) selectModel(providerId, modelId)
              }
              setCurrentView('chat')
            }}
          />

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
