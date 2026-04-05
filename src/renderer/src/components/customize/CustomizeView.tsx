import React, { Suspense, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useUiStore, type CustomizeTab } from '@/stores/ui.store'
import { AppWindow, ArrowLeft, AudioLines, BookOpen, Brain, Dumbbell, Library, Network, Shield, TerminalSquare, UserCircle } from 'lucide-react'

const PromptsView = React.lazy(() => import('@/components/prompts/PromptsView').then(m => ({ default: m.PromptsView })))
const RolesView = React.lazy(() => import('@/components/roles/RolesView').then(m => ({ default: m.RolesView })))
const McpView = React.lazy(() => import('@/components/mcp/McpView').then(m => ({ default: m.McpView })))
const MemoryView = React.lazy(() => import('@/components/memory/MemoryView').then(m => ({ default: m.MemoryView })))
const CommandsView = React.lazy(() => import('@/components/commands/CommandsView').then(m => ({ default: m.CommandsView })))
const LibrariesView = React.lazy(() => import('@/components/libraries/LibrariesView').then(m => ({ default: m.LibrariesView })))
const BrigadeView = React.lazy(() => import('@/components/brigade/BrigadeView').then(m => ({ default: m.BrigadeView })))
const SkillsView = React.lazy(() => import('@/components/skills/SkillsView').then(m => ({ default: m.SkillsView })))
const ApplicationsView = React.lazy(() => import('@/components/applications/ApplicationsView').then(m => ({ default: m.ApplicationsView })))
const AudioLiveView = React.lazy(() => import('@/components/audio-live/AudioLiveView').then(m => ({ default: m.AudioLiveView })))

type TabItem =
  | { type: 'tab'; id: CustomizeTab; label: string; icon: React.ReactNode }
  | { type: 'separator' }

const TABS: TabItem[] = [
  { type: 'tab', id: 'prompts', label: 'Prompts', icon: <BookOpen className="size-4" /> },
  { type: 'tab', id: 'roles', label: 'Roles', icon: <UserCircle className="size-4" /> },
  { type: 'tab', id: 'commands', label: 'Commandes', icon: <TerminalSquare className="size-4" /> },
  { type: 'separator' },
  { type: 'tab', id: 'memory', label: 'Memoire', icon: <Brain className="size-4" /> },
  { type: 'tab', id: 'libraries', label: 'Referentiels', icon: <Library className="size-4" /> },
  { type: 'separator' },
  { type: 'tab', id: 'skills' as CustomizeTab, label: 'Skills', icon: <Dumbbell className="size-4" /> },
  { type: 'tab', id: 'mcp', label: 'MCP', icon: <Network className="size-4" /> },
  { type: 'tab', id: 'brigade', label: 'Brigade', icon: <Shield className="size-4" /> },
  { type: 'tab', id: 'applications' as CustomizeTab, label: 'Applications', icon: <AppWindow className="size-4" /> },
  { type: 'separator' },
  { type: 'tab', id: 'audio-live' as CustomizeTab, label: 'Audio Live', icon: <AudioLines className="size-4" /> },
]

export function CustomizeView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const customizeTab = useUiStore((s) => s.customizeTab)
  const setCustomizeTab = useUiStore((s) => s.setCustomizeTab)
  const [activeTab, setActiveTab] = useState<CustomizeTab>(customizeTab ?? 'prompts')

  useEffect(() => {
    if (customizeTab) {
      setActiveTab(customizeTab)
      setCustomizeTab(null)
    }
  }, [customizeTab, setCustomizeTab])

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <button
          onClick={() => setCurrentView('chat')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Personnaliser</h1>
      </div>

      {/* Tabs + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Tab navigation */}
        <nav className="w-48 shrink-0 border-r border-border/40 bg-muted/20 p-3">
          <div className="flex flex-col gap-0.5">
            {TABS.map((item, i) =>
              item.type === 'separator' ? (
                <div key={`sep-${i}`} className="my-1.5 h-px bg-border/40" />
              ) : (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                    activeTab === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            )}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={null}>
            {activeTab === 'prompts' && <PromptsView />}
            {activeTab === 'roles' && <RolesView />}
            {activeTab === 'mcp' && <McpView />}
            {activeTab === 'memory' && <MemoryView />}
            {activeTab === 'commands' && <CommandsView />}
            {activeTab === 'libraries' && <LibrariesView />}
            {activeTab === 'skills' && <SkillsView />}
            {activeTab === 'brigade' && <BrigadeView />}
            {activeTab === 'applications' && <ApplicationsView />}
            {activeTab === 'audio-live' && <AudioLiveView />}
          </Suspense>
        </div>
      </div>
    </div>
  )
}
