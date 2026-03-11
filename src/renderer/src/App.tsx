import React, { useCallback, useEffect, useState } from 'react'
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
import { SettingsView } from '@/components/settings/SettingsView'
import { StatsView } from '@/components/statistics/StatsView'
import { ImagesView } from '@/components/images/ImagesView'
import { ProjectsView } from '@/components/projects/ProjectsView'
import { PromptsView } from '@/components/prompts/PromptsView'
import { RolesView } from '@/components/roles/RolesView'
import { TasksView } from '@/components/tasks/TasksView'
import { McpView } from '@/components/mcp/McpView'
import { MemoryView } from '@/components/memory/MemoryView'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
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
    setCurrentView('settings')
  }, [setCurrentView])

  const handleModelList = useCallback(() => {
    setSettingsTab('model')
    setCurrentView('settings')
  }, [setSettingsTab, setCurrentView])

  const handleToggleWorkspace = useCallback(() => {
    useWorkspaceStore.getState().togglePanel()
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
    onToggleWorkspace: handleToggleWorkspace,
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
            {currentView === 'settings' && <SettingsView />}
            {currentView === 'statistics' && <StatsView />}
            {currentView === 'images' && <ImagesView />}
            {currentView === 'projects' && <ProjectsView />}
            {currentView === 'prompts' && <PromptsView />}
            {currentView === 'roles' && <RolesView />}
            {currentView === 'tasks' && <TasksView />}
            {currentView === 'mcp' && <McpView />}
            {currentView === 'memory' && <MemoryView />}
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
