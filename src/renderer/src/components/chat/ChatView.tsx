import React, { useEffect } from 'react'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore, type Message } from '@/stores/messages.store'
import { useProvidersStore } from '@/stores/providers.store' // used via getState()
import MessageList from './MessageList'
import { InputZone } from './InputZone'
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

  // Load messages + restore model when switching conversations
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    // Restore model from conversation (read store snapshot, not reactive)
    const conv = useConversationsStore.getState().conversations.find((c) => c.id === activeConversationId)
    if (conv?.modelId?.includes('::')) {
      const [providerId, modelId] = conv.modelId.split('::')
      useProvidersStore.getState().selectModel(providerId, modelId)
    }

    async function loadMessages() {
      try {
        const msgs = await window.api.getMessages(activeConversationId!)
        setMessages(msgs.map((m): Message => ({
          ...m,
          isStreaming: false,
          reasoning: (m.contentData?.reasoning as string) || undefined
        })))
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
    <div className="flex h-full flex-col bg-background">
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
  )
}

/** Empty state — shown when no messages or no active conversation. */
function EmptyState({ hasConversation }: { hasConversation: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-5 text-center">
        {/* Icon cluster */}
        <div className="relative">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 shadow-sm ring-1 ring-violet-500/10 dark:from-violet-400/10 dark:to-fuchsia-400/10 dark:ring-violet-400/10">
            {hasConversation ? (
              <MessageSquare className="size-7 text-violet-500/60 dark:text-violet-400/60" />
            ) : (
              <Sparkles className="size-7 text-violet-500/60 dark:text-violet-400/60" />
            )}
          </div>
          {/* Decorative glow */}
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 blur-xl" />
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
