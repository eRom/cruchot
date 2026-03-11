import React, { useEffect, useState } from 'react'
import { ArrowLeft, Settings, Palette, Keyboard, Database, Archive, Key, SlidersHorizontal, Volume2 } from 'lucide-react'
import { useUiStore, type SettingsTab } from '@/stores/ui.store'
import { GeneralSettings } from './GeneralSettings'
import { AppearanceSettings } from './AppearanceSettings'
import { KeybindingsSettings } from './KeybindingsSettings'
import { DataSettings } from './DataSettings'
import { BackupSettings } from './BackupSettings'
import { ApiKeysSection } from './ApiKeysSection'
import { ModelSettings } from './ModelSettings'
import { AudioSettings } from './AudioSettings'
import { LocalProvidersSection } from './LocalProvidersSection'
import { cn } from '@/lib/utils'

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'General', icon: <Settings className="size-4" /> },
  { id: 'appearance', label: 'Apparence', icon: <Palette className="size-4" /> },
  { id: 'apikeys', label: 'Cles API', icon: <Key className="size-4" /> },
  { id: 'model', label: 'Modele', icon: <SlidersHorizontal className="size-4" /> },
  { id: 'audio', label: 'Audio', icon: <Volume2 className="size-4" /> },
  { id: 'keybindings', label: 'Raccourcis', icon: <Keyboard className="size-4" /> },
  { id: 'data', label: 'Donnees', icon: <Database className="size-4" /> },
  { id: 'backup', label: 'Sauvegardes', icon: <Archive className="size-4" /> },
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
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl">
            {activeTab === 'general' && <GeneralSettings />}
            {activeTab === 'appearance' && <AppearanceSettings />}
            {activeTab === 'apikeys' && (
              <div className="space-y-8">
                <ApiKeysSection />
                <LocalProvidersSection />
              </div>
            )}
            {activeTab === 'model' && <ModelSettings />}
            {activeTab === 'audio' && <AudioSettings />}
            {activeTab === 'keybindings' && <KeybindingsSettings />}
            {activeTab === 'data' && <DataSettings />}
            {activeTab === 'backup' && <BackupSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}
