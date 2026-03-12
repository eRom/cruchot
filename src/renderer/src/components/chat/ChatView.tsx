import React, { useEffect, useRef, useCallback } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore, type Message } from '@/stores/messages.store'
import { useProvidersStore } from '@/stores/providers.store' // used via getState()
import { useRolesStore } from '@/stores/roles.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import MessageList from './MessageList'
import { InputZone } from './InputZone'
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel'
import { MessageSquare, Sparkles } from 'lucide-react'

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

  // Auto-open/close workspace when project changes
  useEffect(() => {
    const activeProjectId = useProjectsStore.getState().activeProjectId
    const project = useProjectsStore.getState().projects.find((p) => p.id === activeProjectId)

    if (project?.workspacePath) {
      useWorkspaceStore.getState().openWorkspace(project.workspacePath, project.id)
    } else {
      const currentRoot = useWorkspaceStore.getState().rootPath
      if (currentRoot) {
        useWorkspaceStore.getState().closeWorkspace()
      }
    }
  }, [useProjectsStore((s) => s.activeProjectId)])

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

  // Load messages + restore model + restore role when switching conversations
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      useRolesStore.getState().setActiveRole(null)
      useRolesStore.getState().setActiveSystemPrompt(null)
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
        const msgs = await window.api.getMessages(activeConversationId!)
        const loadedMessages = msgs.map((m): Message => ({
          ...m,
          isStreaming: false,
          reasoning: (m.contentData?.reasoning as string) || undefined,
          toolCalls: (m.contentData?.toolCalls as Message['toolCalls']) || undefined
        }))
        setMessages(loadedMessages)

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

  // Filter messages for the active conversation
  const conversationMessages = activeConversationId
    ? messages.filter((m) => m.conversationId === activeConversationId)
    : []

  const hasMessages = conversationMessages.length > 0

  return (
    <div className="flex h-full">
      {/* Chat area */}
      <div className="flex flex-1 flex-col bg-background min-w-0">
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
          <InputZone />
        </div>
      </div>

      {/* Workspace panel — right side (always rendered when workspace is open, can be collapsed) */}
      {workspaceRootPath && <WorkspacePanel />}
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
