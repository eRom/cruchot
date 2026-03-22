import { FileText, Sparkles, GitFork } from 'lucide-react'
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
  const hasDraftContent = useUiStore((s) => s.draftContent.trim().length > 0)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const addConversation = useConversationsStore((s) => s.addConversation)
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation)
  const { selectedModelId, selectedProviderId } = useProvidersStore()
  const summaryModelId = useSettingsStore((s) => s.summaryModelId)
  const summaryPrompt = useSettingsStore((s) => s.summaryPrompt)

  const isBusy = isStreaming
  const hasMessages = useMessagesStore((s) => s.getConversationMessages(activeConversationId).length > 0)

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
        text: useUiStore.getState().draftContent,
        modelId
      })
      if (result.optimizedText) {
        onOptimizedPrompt(result.optimizedText)
        toast.success('Prompt optimise')
      } else {
        toast.error('Aucun resultat')
      }
    } catch {
      toast.error('Erreur optimisation')
    }
  }

  const handleFork = async () => {
    if (!activeConversationId) return
    try {
      const forked = await window.api.forkConversation(activeConversationId)
      addConversation(forked)
      setActiveConversation(forked.id)
      toast.success('Conversation dupliquee')
    } catch {
      toast.error('Erreur fork')
    }
  }

  return (
    <CollapsibleSection title="Outils" defaultOpen>
      <div className="grid grid-cols-2 gap-2">
        <div className="[&_button]:h-10 [&_button]:w-full [&_button]:rounded-lg [&_button]:border [&_button]:border-border/40 [&_button]:gap-2 [&_button]:px-2 [&_button]:text-xs [&_button]:font-normal [&_button]:justify-center">
          <PromptPicker onInsert={onPromptInsert} disabled={isBusy} />
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-full border border-border/40 gap-2"
              disabled={!hasMessages || isBusy}
              onClick={handleResume}
            >
              <FileText className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Generer un resume</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-full border border-border/40 gap-2"
              disabled={!hasDraftContent || !selectedModelId || !selectedProviderId || isBusy}
              onClick={handleOptimize}
            >
              <Sparkles className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Ameliorer le prompt</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-full border border-border/40 gap-2"
              disabled={!activeConversationId}
              onClick={handleFork}
            >
              <GitFork className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Dupliquer la conversation</TooltipContent>
        </Tooltip>
      </div>
    </CollapsibleSection>
  )
}
