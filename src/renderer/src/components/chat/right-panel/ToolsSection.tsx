import { useMemo } from 'react'
import { Wrench, Send, FileText, Sparkles, GitFork } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useRemoteStore } from '@/stores/remote.store'
import { toast } from 'sonner'

interface ToolsSectionProps {
  inputContent: string
  onOptimizedPrompt: (text: string) => void
}

export function ToolsSection({ inputContent, onOptimizedPrompt }: ToolsSectionProps) {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const addConversation = useConversationsStore((s) => s.addConversation)
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation)
  const { selectedModelId, selectedProviderId } = useProvidersStore()
  const messages = useMessagesStore((s) => s.messages)
  const summaryModelId = useSettingsStore((s) => s.summaryModelId)
  const summaryPrompt = useSettingsStore((s) => s.summaryPrompt)
  const remoteConfig = useRemoteStore((s) => s.config)
  const remoteStatus = useRemoteStore((s) => s.status)
  const remoteStart = useRemoteStore((s) => s.start)
  const remoteStop = useRemoteStore((s) => s.stop)

  const isBusy = isStreaming

  const conversationMessages = useMemo(
    () => messages.filter((m) => m.conversationId === activeConversationId),
    [messages, activeConversationId]
  )

  const hasMessages = conversationMessages.length > 0
  const hasRemoteConfig = !!remoteConfig?.hasToken
  const isRemoteActive = remoteStatus === 'connected' || remoteStatus === 'pairing'

  // ── Remote toggle ──
  const handleRemoteToggle = async () => {
    try {
      if (isRemoteActive) {
        await remoteStop()
        toast.success('Remote deconnecte')
      } else {
        const code = await remoteStart(activeConversationId ?? undefined)
        toast.success(`Remote actif — code: ${code}`)
      }
    } catch {
      toast.error('Erreur remote')
    }
  }

  // ── Resume ──
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

  // ── Optimize ──
  const handleOptimize = async () => {
    const modelId = `${selectedProviderId}::${selectedModelId}`
    try {
      const result = await window.api.optimizePrompt({
        text: inputContent,
        modelId
      })
      onOptimizedPrompt(result.optimizedText)
      toast.success('Prompt optimise')
    } catch {
      toast.error('Erreur optimisation')
    }
  }

  // ── Fork ──
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
      <div className="grid grid-cols-2 gap-2">
        {/* Remote */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`h-10 w-full border border-border/40 gap-2 ${isRemoteActive ? 'text-emerald-500' : ''}`}
              disabled={!hasRemoteConfig || isBusy}
              onClick={handleRemoteToggle}
            >
              <Send className="size-4" />
              <span className="text-xs">Remote</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Activer/desactiver le remote Telegram</TooltipContent>
        </Tooltip>

        {/* Resume */}
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
              <span className="text-xs">Resume</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Generer un resume de la conversation</TooltipContent>
        </Tooltip>

        {/* Optimiser */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-full border border-border/40 gap-2"
              disabled={inputContent.trim() === '' || isBusy}
              onClick={handleOptimize}
            >
              <Sparkles className="size-4" />
              <span className="text-xs">Optimiser</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Optimiser le prompt actuel</TooltipContent>
        </Tooltip>

        {/* Fork */}
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
              <span className="text-xs">Fork</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Dupliquer la conversation</TooltipContent>
        </Tooltip>
      </div>
    </CollapsibleSection>
  )
}
