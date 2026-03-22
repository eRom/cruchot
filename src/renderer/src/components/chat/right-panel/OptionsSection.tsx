import { useMemo } from 'react'
import { Sliders } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { PromptPicker } from '@/components/chat/PromptPicker'
import { LibraryPicker } from '@/components/chat/LibraryPicker'
import { YoloToggle } from '@/components/chat/YoloToggle'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'

interface OptionsSectionProps {
  onPromptInsert: (text: string) => void
}

export function OptionsSection({ onPromptInsert }: OptionsSectionProps) {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)

  const isBusy = isStreaming

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  return (
    <CollapsibleSection title="Options" icon={Sliders} defaultOpen>
      <div className="flex flex-col gap-3">
        <PromptPicker onInsert={onPromptInsert} disabled={isBusy} />
        <LibraryPicker disabled={isBusy} onLibraryChange={() => {}} />
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
