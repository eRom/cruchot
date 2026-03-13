import { cn } from '@/lib/utils'
import { useUiStore, type SettingsTab } from '@/stores/ui.store'
import { Archive, ArrowLeft, Blocks, Database, FileText, Keyboard, Palette, Settings, SlidersHorizontal, Smartphone, Volume2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { AppearanceSettings } from './AppearanceSettings'
import { AudioSettings } from './AudioSettings'
import { BackupSettings } from './BackupSettings'
import { DataSettings } from './DataSettings'
import { GeneralSettings } from './GeneralSettings'
import { KeybindingsSettings } from './KeybindingsSettings'
import { ProvidersSection } from './ProvidersSection'
import { ModelSettings } from './ModelSettings'
import { RemoteTab } from './RemoteTab'
import { SummaryTab } from './SummaryTab'

type TabItem =
  | { type: 'tab'; id: SettingsTab; label: string; icon: React.ReactNode }
  | { type: 'separator' }

const TABS: TabItem[] = [
  { type: 'tab', id: 'general', label: 'General', icon: <Settings className="size-4" /> },
  { type: 'tab', id: 'appearance', label: 'Apparence', icon: <Palette className="size-4" /> },
  { type: 'tab', id: 'keybindings', label: 'Raccourcis', icon: <Keyboard className="size-4" /> },
  { type: 'separator' },
  { type: 'tab', id: 'apikeys', label: 'Providers', icon: <Blocks className="size-4" /> },
  { type: 'tab', id: 'model', label: 'Modele', icon: <SlidersHorizontal className="size-4" /> },
  { type: 'tab', id: 'audio', label: 'Audio', icon: <Volume2 className="size-4" /> },
  { type: 'tab', id: 'summary', label: 'Resume', icon: <FileText className="size-4" /> },
  { type: 'separator' },
  { type: 'tab', id: 'remote', label: 'Remote', icon: <Smartphone className="size-4" /> },
  { type: 'tab', id: 'data', label: 'Donnees', icon: <Database className="size-4" /> },
  { type: 'tab', id: 'backup', label: 'Sauvegardes', icon: <Archive className="size-4" /> },
]

export function SettingsView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const settingsTab = useUiStore((s) => s.settingsTab)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)
  const [activeTab, setActiveTab] = useState<SettingsTab>(settingsTab ?? 'general')

  // Consume settingsTab from ui store (set by CommandPalette) then clear it
  useEffect(() => {
    if (settingsTab) {
      setActiveTab(settingsTab)
      setSettingsTab(null)
    }
  }, [settingsTab, setSettingsTab])

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
        <h1 className="text-lg font-semibold text-foreground">Parametres</h1>
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
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl pb-8">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'apikeys' && <ProvidersSection />}
            {activeTab === 'model' && <ModelSettings />}
            {activeTab === 'audio' && <AudioSettings />}
            {activeTab === 'summary' && <SummaryTab />}
            {activeTab === 'keybindings' && <KeybindingsSettings />}
            {activeTab === 'remote' && <RemoteTab />}
            {activeTab === 'backup' && <BackupSettings />}
            {activeTab === 'data' && <DataSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}
