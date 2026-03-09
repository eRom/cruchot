import React, { useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Message } from '@/stores/messages.store'
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
 */
function MessageList({ messages, streamingMessageId }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const fontSizePx = useSettingsStore((s) => s.fontSizePx)
  const messageWidth = useSettingsStore((s) => s.messageWidth)
  const density = useSettingsStore((s) => s.density)

  const densityPy = density === 'compact' ? 'py-1.5' : density === 'comfortable' ? 'py-5' : 'py-3'

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  })

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [messages.length])

  // Auto-scroll during streaming
  const streamingMessage = streamingMessageId
    ? messages.find((m) => m.id === streamingMessageId)
    : null

  useEffect(() => {
    if (streamingMessage) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }, [streamingMessage?.content.length])

  const measureElement = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        virtualizer.measureElement(el)
      }
    },
    [virtualizer]
  )

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto scroll-smooth"
    >
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
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default React.memo(MessageList)
