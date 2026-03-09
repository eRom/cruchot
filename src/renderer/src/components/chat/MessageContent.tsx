import React from 'react'
import MarkdownRenderer from './MarkdownRenderer'

interface MessageContentProps {
  content: string
  role: 'user' | 'assistant' | 'system'
}

/**
 * Renders the text content of a message.
 * Uses MarkdownRenderer for assistant messages (richer formatting),
 * and a simpler rendering for user messages (preserves line breaks).
 */
export function MessageContent({ content, role }: MessageContentProps): React.JSX.Element {
  if (role === 'user') {
    return (
      <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
        {content}
      </div>
    )
  }

  return (
    <div className="text-[14.5px]">
      <MarkdownRenderer content={content} />
    </div>
  )
}
