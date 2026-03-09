import React, { useEffect, useRef } from 'react'
import type { Message } from '@/stores/messages.store'
import MessageItem from './MessageItem'

interface MessageListProps {
  messages: Message[]
  streamingMessageId: string | null
}

/**
 * Scrollable list of chat messages.
 * Automatically scrolls to the bottom when new messages arrive
 * or when a streaming message is being appended to.
 */
function MessageList({ messages, streamingMessageId }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll: on new messages or streaming content changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingMessageId])

  // Also scroll on streaming content updates
  // We watch the last message's content length when streaming
  const streamingMessage = streamingMessageId
    ? messages.find((m) => m.id === streamingMessageId)
    : null

  useEffect(() => {
    if (streamingMessage) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingMessage?.content.length])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto scroll-smooth"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-6 py-8">
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={message.id === streamingMessageId}
          />
        ))}
        {/* Invisible anchor for auto-scroll */}
        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}

export default React.memo(MessageList)
