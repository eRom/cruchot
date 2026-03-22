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
const StatsView = React.lazy(() => import('@/components/statistics/StatsView').then(m => ({ default: m.StatsView })))
const ImagesView = React.lazy(() => import('@/components/images/ImagesView').then(m => ({ default: m.ImagesView })))
const ProjectsView = React.lazy(() => import('@/components/projects/ProjectsView').then(m => ({ default: m.ProjectsView })))
const PromptsView = React.lazy(() => import('@/components/prompts/PromptsView').then(m => ({ default: m.PromptsView })))
const RolesView = React.lazy(() => import('@/components/roles/RolesView').then(m => ({ default: m.RolesView })))
const TasksView = React.lazy(() => import('@/components/tasks/TasksView').then(m => ({ default: m.TasksView })))
const McpView = React.lazy(() => import('@/components/mcp/McpView').then(m => ({ default: m.McpView })))
const MemoryView = React.lazy(() => import('@/components/memory/MemoryView').then(m => ({ default: m.MemoryView })))
const CommandsView = React.lazy(() => import('@/components/commands/CommandsView').then(m => ({ default: m.CommandsView })))
const LibrariesView = React.lazy(() => import('@/components/libraries/LibrariesView').then(m => ({ default: m.LibrariesView })))
const ArenaView = React.lazy(() => import('@/components/arena/ArenaView').then(m => ({ default: m.ArenaView })))
const BrigadeView = React.lazy(() => import('@/components/brigade/BrigadeView').then(m => ({ default: m.BrigadeView })))
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
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
    onEscape: handleEscape,
  })

  // ── Onboarding — show on first launch ───────────────
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    window.api.getSetting('onboarding_completed').then((val) => {
      if (val !== 'true') setShowOnboarding(true)
    })
  }, [])

  const handleOnboardingComplete = () => {
    window.api.setSetting('onboarding_completed', 'true')
    setShowOnboarding(false)
  }

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
              {currentView === 'statistics' && <StatsView />}
              {currentView === 'images' && <ImagesView />}
              {currentView === 'projects' && <ProjectsView />}
              {currentView === 'prompts' && <PromptsView />}
              {currentView === 'roles' && <RolesView />}
              {currentView === 'tasks' && <TasksView />}
              {currentView === 'mcp' && <McpView />}
              {currentView === 'memory' && <MemoryView />}
              {currentView === 'commands' && <CommandsView />}
              {currentView === 'libraries' && <LibrariesView />}
              {currentView === 'arena' && <ArenaView />}
              {currentView === 'brigade' && <BrigadeView />}
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
