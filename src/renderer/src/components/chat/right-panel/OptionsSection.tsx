import { useMemo } from 'react'
import { Sliders, Search } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { LibraryPicker } from '@/components/chat/LibraryPicker'
import { YoloToggle } from '@/components/chat/YoloToggle'
import { Switch } from '@/components/ui/switch'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSettingsStore } from '@/stores/settings.store'

export function OptionsSection() {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)

  const isBusy = isStreaming

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  return (
    <CollapsibleSection title="Options" icon={Sliders} defaultOpen>
      <div className="flex flex-col gap-2.5">
        {/* Web Search toggle */}
        <div className="flex items-center justify-between gap-2 px-1">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="size-4" />
            Recherche web
          </label>
          <Switch
            checked={searchEnabled}
            onCheckedChange={setSearchEnabled}
            disabled={isBusy}
          />
        </div>

        {/* Library picker — full-width style */}
        <div className="[&>div]:w-full [&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm [&_button]:justify-start [&_button]:gap-2 [&_.flex.items-center]:w-full [&_.flex.items-center]:max-w-none">
          <LibraryPicker disabled={isBusy} onLibraryChange={() => {}} />
        </div>

        {/* YOLO toggle */}
        {activeConversationId && (
          <YoloToggle
            conversationId={activeConversationId}
            modelSupportsYolo={selectedModel?.supportsYolo ?? false}
            workspacePath={workspaceRootPath ?? undefined}
            disabled={isBusy}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}
