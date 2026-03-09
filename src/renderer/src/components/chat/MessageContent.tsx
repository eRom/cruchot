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
function MessageContent({ content, role }: MessageContentProps) {
  if (role === 'user') {
    // User messages: preserve whitespace/line breaks, no heavy Markdown
    return (
      <div className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">
        {content}
      </div>
    )
  }

  // Assistant (and system) messages: full Markdown rendering
  return <MarkdownRenderer content={content} />
}

export default React.memo(MessageContent)
