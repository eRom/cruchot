import { useMemo } from 'react'
import { Wrench, FileText, Sparkles, GitFork } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { PromptPicker } from '@/components/chat/PromptPicker'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { toast } from 'sonner'

interface ToolsSectionProps {
  onOptimizedPrompt: (text: string) => void
  onPromptInsert: (text: string) => void
}

export function ToolsSection({ onOptimizedPrompt, onPromptInsert }: ToolsSectionProps) {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const draftContent = useUiStore((s) => s.draftContent)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const addConversation = useConversationsStore((s) => s.addConversation)
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation)
  const { selectedModelId, selectedProviderId } = useProvidersStore()
  const messages = useMessagesStore((s) => s.messages)
  const summaryModelId = useSettingsStore((s) => s.summaryModelId)
  const summaryPrompt = useSettingsStore((s) => s.summaryPrompt)

  const isBusy = isStreaming

  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const hasMessages = conversationMessages.length > 0

  const handleResume = async () => {
    if (!activeConversationId) return
    const modelId = summaryModelId || `${selectedProviderId}::${selectedModelId}`
    try {
      const result = await window.api.summarizeConversation({
        conversationId: activeConversationId,
        modelId,
        prompt: summaryPrompt
      })
      await navigator.clipboard.writeText(result.text)
      toast.success('Resume copie dans le presse-papier')
    } catch {
      toast.error('Erreur lors du resume')
    }
  }

  const handleOptimize = async () => {
    const modelId = `${selectedProviderId}::${selectedModelId}`
    try {
      const result = await window.api.optimizePrompt({
        text: draftContent,
        modelId
      })
      onOptimizedPrompt(result.optimizedText)
      toast.success('Prompt optimise')
    } catch {
      toast.error('Erreur optimisation')
    }
  }

  const handleFork = async () => {
    if (!activeConversationId) return
    try {
      const forked = await window.api.forkConversation(activeConversationId)
      addConversation({
        id: forked.id,
        title: forked.title,
        projectId: forked.projectId,
        modelId: forked.modelId,
        roleId: forked.roleId,
        isFavorite: forked.isFavorite,
        isArena: forked.isArena,
        createdAt: new Date(forked.createdAt),
        updatedAt: new Date(forked.updatedAt)
      })
      setActiveConversation(forked.id)
      toast.success('Conversation dupliquee')
    } catch {
      toast.error('Erreur fork')
    }
  }

  return (
    <CollapsibleSection title="Outils" icon={Wrench} defaultOpen>
      <div className="flex flex-col gap-2.5">
        {/* Prompt picker */}
        <div className="[&_button]:w-full [&_button]:max-w-none [&_button]:h-auto [&_button]:rounded-lg [&_button]:py-1.5 [&_button]:px-3 [&_button]:text-sm [&_button]:justify-start [&_button]:gap-2">
          <PromptPicker onInsert={onPromptInsert} disabled={isBusy} />
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-full border border-border/40 gap-1.5 px-2"
                disabled={!hasMessages || isBusy}
                onClick={handleResume}
              >
                <FileText className="size-4" />
                <span className="text-xs">Resume</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Generer un resume</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-full border border-border/40 gap-1.5 px-2"
                disabled={draftContent.trim() === '' || isBusy}
                onClick={handleOptimize}
              >
                <Sparkles className="size-4" />
                <span className="text-xs">Optimiser</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Optimiser le prompt</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-full border border-border/40 gap-1.5 px-2"
                disabled={!activeConversationId}
                onClick={handleFork}
              >
                <GitFork className="size-4" />
                <span className="text-xs">Fork</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Dupliquer la conversation</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </CollapsibleSection>
  )
}
