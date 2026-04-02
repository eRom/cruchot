import React, { useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import type { Message } from '@/stores/messages.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useSettingsStore } from '@/stores/settings.store'
import MessageItem from './MessageItem'

interface MessageListProps {
  messages: Message[]
  streamingMessageId: string | null
}

/**
 * Virtualized, scrollable list of chat messages.
 * Uses TanStack Virtual for efficient rendering of large conversations.
 * Automatically scrolls to the bottom when new messages arrive or during streaming.
 * Supports infinite scroll upward to load older messages.
 */
function MessageList({ messages, streamingMessageId }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const fontSizePx = useSettingsStore((s) => s.fontSizePx)
  const messageWidth = useSettingsStore((s) => s.messageWidth)
  const density = useSettingsStore((s) => s.density)

  const hasOlderMessages = useMessagesStore((s) => s.hasOlderMessages)
  const isLoadingOlder = useMessagesStore((s) => s.isLoadingOlder)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)

  // Prevent concurrent load requests
  const loadingRef = useRef(false)

  const densityPy = density === 'compact' ? 'py-1.5' : density === 'comfortable' ? 'py-5' : 'py-3'

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  // Auto-scroll to bottom on new messages (smooth for user-initiated, instant during streaming)
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: streamingMessageId ? 'auto' : 'smooth' })
    }
  }, [messages.length])

  // Auto-scroll during streaming — throttled via rAF to avoid stacking scroll calls per token
  const scrollRafRef = useRef<number>(0)
  const streamingMessage = streamingMessageId
    ? messages.find((m) => m.id === streamingMessageId)
    : null

  useEffect(() => {
    if (streamingMessage) {
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'auto' })
      })
    }
    return () => { if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current) }
  }, [streamingMessage?.content.length, streamingMessage?.reasoning?.length, streamingMessage?.streamPhase])

  const measureElement = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        virtualizer.measureElement(el)
      }
    },
    [virtualizer]
  )

  // Load older messages when scrolled near the top
  const loadOlderMessages = useCallback(async () => {
    if (loadingRef.current || !hasOlderMessages || !activeConversationId || messages.length === 0) return

    const oldestMessage = messages[0]
    const beforeDate = new Date(oldestMessage.createdAt).toISOString()

    loadingRef.current = true
    useMessagesStore.setState({ isLoadingOlder: true })

    try {
      const scrollEl = parentRef.current
      const prevScrollHeight = scrollEl?.scrollHeight ?? 0

      const result = await window.api.getMessagesPage({
        conversationId: activeConversationId,
        limit: 50,
        beforeDate,
      })

      const olderMessages = result.messages.map((m): Message => ({
        ...m,
        isStreaming: false,
        reasoning: (m.contentData?.reasoning as string) || undefined,
        toolCalls: (m.contentData?.toolCalls as Message['toolCalls']) || undefined,
      }))

      useMessagesStore.getState().prependMessages(olderMessages, result.hasMore)

      // Restore scroll position after prepend so the user stays at the same place
      requestAnimationFrame(() => {
        if (scrollEl) {
          const newScrollHeight = scrollEl.scrollHeight
          scrollEl.scrollTop = newScrollHeight - prevScrollHeight
        }
      })
    } finally {
      loadingRef.current = false
    }
  }, [hasOlderMessages, activeConversationId, messages])

  // Attach passive scroll listener to detect near-top scrolling
  useEffect(() => {
    const scrollEl = parentRef.current
    if (!scrollEl) return

    const handleScroll = () => {
      if (scrollEl.scrollTop < 200) {
        loadOlderMessages()
      }
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollEl.removeEventListener('scroll', handleScroll)
  }, [loadOlderMessages])

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto scroll-smooth"
    >
      {/* Loading skeleton shown at the top while fetching older messages */}
      {isLoadingOlder && (
        <div className="flex items-center justify-center py-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">Chargement des messages...</span>
        </div>
      )}
      <div
        className="relative mx-auto"
        style={{ height: `${virtualizer.getTotalSize()}px`, maxWidth: `${messageWidth}%`, fontSize: `${fontSizePx}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = messages[virtualItem.index]
          return (
            <div
              key={message.id}
              ref={measureElement}
              data-index={virtualItem.index}
              className={`absolute left-0 w-full ${densityPy}`}
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <MessageItem
                message={message}
                isStreaming={message.id === streamingMessageId}
                conversationId={activeConversationId ?? undefined}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(MessageList)
