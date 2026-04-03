import React, { Suspense, useEffect, useRef, useCallback, useMemo } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore, type Message } from '@/stores/messages.store'
import { useProvidersStore } from '@/stores/providers.store' // used via getState()
import { useRolesStore } from '@/stores/roles.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useUiStore } from '@/stores/ui.store'
import MessageList from './MessageList'
import { InputZone } from './InputZone'
import { PlanErrorBanner } from './PlanErrorBanner'
import { PlanStickyIndicator } from './PlanStickyIndicator'
import { ToolApprovalBanner } from './ToolApprovalBanner'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'
import { useLibraryStore } from '@/stores/library.store'
import { useVcrStore } from '@/stores/vcr.store'
import { MessageSquare, Sparkles } from 'lucide-react'
import { EVENTS } from '@/lib/utils'
import { VcrPlayer } from './vcr/VcrPlayer'
import { VcrRecordingsList } from './vcr/VcrRecordingsList'

const RightPanel = React.lazy(() => import('./right-panel/RightPanel').then(m => ({ default: m.RightPanel })))

/**
 * Main chat view container — Zone A.
 *
 * Shows the message list when a conversation is active,
 * or an elegant empty state when no conversation is selected.
 */
export default function ChatView() {
  const activeConversationId = useConversationsStore(
    (s) => s.activeConversationId
  )
  const messages = useMessagesStore((s) => s.messages)
  const streamingMessageId = useMessagesStore((s) => s.streamingMessageId)
  const setMessages = useMessagesStore((s) => s.setMessages)

  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const openPanel = useUiStore((s) => s.openPanel)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)

  // Sync workspace from conversation's workspacePath
  useEffect(() => {
    if (!activeConversationId) return
    const loadWorkspacePath = async () => {
      try {
        const convs = await window.api.getConversations()
        const conv = convs?.find((c: { id: string }) => c.id === activeConversationId)
        const wsPath = (conv as { workspacePath?: string })?.workspacePath
        if (wsPath && wsPath !== '~/.cruchot/sandbox/') {
          useWorkspaceStore.getState().openWorkspace(wsPath)
        } else {
          useWorkspaceStore.getState().setRootPath(null)
        }
      } catch { /* silent */ }
    }
    loadWorkspacePath()
  }, [activeConversationId])

  // VCR recording state sync
  useEffect(() => {
    window.api.onVcrRecordingState(() => {
      useVcrStore.getState().refreshStatus()
    })
    return () => window.api.offVcrRecordingState()
  }, [])

  // File watcher sync
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>

    window.api.onWorkspaceFileChanged(() => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        useWorkspaceStore.getState().refreshTree()
      }, 300)
    })

    return () => {
      clearTimeout(debounceTimer)
      window.api.offWorkspaceFileChanged()
    }
  }, [])

  // Sync active library from DB when conversation changes (always mounted, race-safe)
  useEffect(() => {
    let cancelled = false
    if (!activeConversationId) {
      useLibraryStore.getState().setActiveLibraryId(null)
      return
    }
    window.api.libraryGetAttached({ conversationId: activeConversationId })
      .then((id) => { if (!cancelled) useLibraryStore.getState().setActiveLibraryId(id ?? null) })
      .catch(() => { if (!cancelled) useLibraryStore.getState().setActiveLibraryId(null) })
    return () => { cancelled = true }
  }, [activeConversationId])

  // Load messages + restore model + restore role when switching conversations
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      useRolesStore.getState().setActiveRole(null)
      useRolesStore.getState().setActiveSystemPrompt(null)
      if (useUiStore.getState().openPanel === 'right') {
        useUiStore.getState().setOpenPanel(null)
      }
      return
    }

    // Restore model from conversation, or fallback to default model
    const conv = useConversationsStore.getState().conversations.find((c) => c.id === activeConversationId)
    const modelSource = conv?.modelId ?? useSettingsStore.getState().defaultModelId ?? ''
    if (modelSource.includes('::')) {
      const [providerId, modelId] = modelSource.split('::')
      if (providerId && modelId) {
        useProvidersStore.getState().selectModel(providerId, modelId)
      }
    }

    async function loadMessages() {
      try {
        const PAGE_SIZE = 50
        const result = await window.api.getMessagesPage({
          conversationId: activeConversationId!,
          limit: PAGE_SIZE
        })
        const loadedMessages = result.messages.map((m): Message => ({
          ...m,
          isStreaming: false,
          reasoning: (m.contentData?.reasoning as string) || undefined,
          toolCalls: (m.contentData?.toolCalls as Message['toolCalls']) || undefined
        }))
        useMessagesStore.getState().setMessagesPage(
          loadedMessages,
          result.totalCount,
          result.hasMore
        )

        if (loadedMessages.length > 0 && useUiStore.getState().openPanel === 'right') {
          useUiStore.getState().setOpenPanel(null)
        }

        // Restore role from conversation
        const roleId = conv?.roleId
        if (roleId) {
          // Conversation has a persisted role — restore it
          try {
            const role = await window.api.getRole(roleId)
            if (role) {
              useRolesStore.getState().setActiveRole(roleId)
              useRolesStore.getState().setActiveSystemPrompt(role.systemPrompt ?? null)
            } else {
              useRolesStore.getState().setActiveRole(null)
              useRolesStore.getState().setActiveSystemPrompt(null)
            }
          } catch {
            useRolesStore.getState().setActiveRole(null)
            useRolesStore.getState().setActiveSystemPrompt(null)
          }
        } else if (loadedMessages.length === 0) {
          // New conversation without role — check if project has a systemPrompt
          const activeProjectId = useProjectsStore.getState().activeProjectId
          const project = useProjectsStore.getState().projects.find((p) => p.id === activeProjectId)
          if (project?.systemPrompt) {
            useRolesStore.getState().setActiveRole('__project__')
            useRolesStore.getState().setActiveSystemPrompt(project.systemPrompt)
          } else {
            useRolesStore.getState().setActiveRole(null)
            useRolesStore.getState().setActiveSystemPrompt(null)
          }
        } else {
          // Existing conversation without role — clear
          useRolesStore.getState().setActiveRole(null)
          useRolesStore.getState().setActiveSystemPrompt(null)
        }
      } catch (error) {
        console.error('Failed to load messages:', error)
      }
    }
    loadMessages()
  }, [activeConversationId, setMessages])

  // Filter messages for the active conversation (memoized — avoids O(n) filter on every streaming token)
  const conversationMessages = useMemo(
    () => activeConversationId ? messages.filter((m) => m.conversationId === activeConversationId) : [],
    [messages, activeConversationId]
  )

  const hasMessages = conversationMessages.length > 0

  // Find the most recent active plan (running or proposed)
  const activePlan = useMemo(() => {
    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const plan = conversationMessages[i].contentData?.plan as any
      if (plan && (plan.status === 'running' || plan.status === 'proposed')) {
        return { plan, messageId: conversationMessages[i].id }
      }
    }
    return null
  }, [conversationMessages])

  // Find the first failed step in the active plan
  const failedStep = useMemo(() => {
    if (!activePlan) return null
    const step = activePlan.plan.steps?.find((s: any) => s.status === 'failed')
    return step ?? null
  }, [activePlan])

  return (
    <div className="flex flex-1 min-h-0">
      {/* Chat area */}
      <div className="flex flex-1 flex-col bg-background min-w-0 min-h-0">
        {/* Plan sticky indicator — shown when a plan is running */}
        {activePlan && activeConversationId && (
          <PlanStickyIndicator
            plan={activePlan.plan}
            visible={true}
            onScrollToPlan={() => {
              // Dispatch a custom event that MessageList can pick up to scroll to the plan message
              window.dispatchEvent(new CustomEvent('plan:scroll', { detail: activePlan.messageId }))
            }}
          />
        )}

        {/* Plan error banner — shown when a step has failed */}
        {failedStep && activePlan && activeConversationId && (
          <PlanErrorBanner
            step={failedStep}
            conversationId={activeConversationId}
            messageId={activePlan.messageId}
          />
        )}

        {/* Messages area */}
        {activeConversationId && hasMessages ? (
          <MessageList
            messages={conversationMessages}
            streamingMessageId={streamingMessageId}
          />
        ) : (
          <EmptyState hasConversation={!!activeConversationId} />
        )}

        {/* Zone B — Input */}
        <div className="shrink-0">
          <ToolApprovalBanner />
          <InputZone />
        </div>
      </div>

      {/* Workspace panel */}
      {openPanel === 'workspace' && workspaceRootPath && <WorkspacePanel />}

      {/* Right panel — always rendered, collapsed/expanded */}
      {openPanel !== 'workspace' && (
        <Suspense fallback={null}>
          <RightPanel
            onPromptInsert={(text) => window.dispatchEvent(new CustomEvent(EVENTS.PROMPT_INSERT, { detail: text }))}
            onOptimizedPrompt={(text) => window.dispatchEvent(new CustomEvent(EVENTS.PROMPT_OPTIMIZED, { detail: text }))}
          />
        </Suspense>
      )}

      <VcrPlayer />
      <VcrRecordingsList />
    </div>
  )
}

/** Empty state — shown when no messages or no active conversation. */
function EmptyState({ hasConversation }: { hasConversation: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Icon cluster */}
        <div className="relative">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/60 shadow-sm ring-1 ring-border/30">
            {hasConversation ? (
              <MessageSquare className="size-7 text-muted-foreground/60" />
            ) : (
              <Sparkles className="size-7 text-muted-foreground/60" />
            )}
          </div>
          {/* Decorative glow */}
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-muted/5 blur-xl" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-foreground/80">
            {hasConversation
              ? 'Aucun message'
              : 'Commencez une nouvelle conversation'}
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground/60">
            {hasConversation
              ? 'Ecrivez votre premier message pour demarrer la discussion.'
              : 'Selectionnez ou creez une conversation pour echanger avec vos modeles preferes.'}
          </p>
        </div>
      </div>
    </div>
  )
}
