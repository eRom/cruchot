import React, { useCallback, useState } from 'react'
import type { Message } from '@/stores/messages.store'
import { MessageContent } from './MessageContent'
import { AudioPlayer } from './AudioPlayer'
import { cn } from '@/lib/utils'
import { Check, Copy, Sparkles } from 'lucide-react'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
}

/** Format response time for display */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format cost for display */
function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

/** Format token counts */
function formatTokens(tokensIn?: number, tokensOut?: number): string | null {
  if (!tokensIn && !tokensOut) return null
  const parts: string[] = []
  if (tokensIn) parts.push(`${tokensIn.toLocaleString()} in`)
  if (tokensOut) parts.push(`${tokensOut.toLocaleString()} out`)
  return parts.join(' / ')
}

/** Humanized provider name */
function providerLabel(providerId?: string, modelId?: string): string | null {
  if (!modelId) return null
  const model = modelId.split('/').pop() ?? modelId
  if (providerId) {
    const provider = providerId.charAt(0).toUpperCase() + providerId.slice(1)
    return `${provider} - ${model}`
  }
  return model
}

/**
 * A single chat message — user or assistant.
 *
 * Design direction: refined, warm, conversational. User bubbles float right
 * with a soft blue accent. Assistant messages sit left with a subtle card
 * background, an AI avatar, and metadata underneath.
 */
function MessageItem({ message, isStreaming = false }: MessageItemProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [message.content])

  const label = providerLabel(message.providerId, message.modelId)
  const tokens = formatTokens(message.tokensIn, message.tokensOut)

  return (
    <div
      className={cn(
        'group flex w-full gap-3 px-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-600 ring-1 ring-violet-500/10 dark:from-violet-400/15 dark:to-fuchsia-400/15 dark:text-violet-400 dark:ring-violet-400/10">
          <Sparkles className="size-4" />
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          'relative max-w-[75%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm dark:from-blue-500 dark:to-blue-600'
            : 'bg-card text-card-foreground shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] ring-1 ring-border/60 dark:shadow-none'
        )}
      >
        {/* Content */}
        <MessageContent content={message.content} role={message.role} />


        {/* Streaming indicator */}
        {isStreaming && (
          <span className="mt-1 inline-flex gap-[3px]">
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '0ms' }} />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '150ms' }} />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '300ms' }} />
          </span>
        )}

        {/* Copy button — appears on hover */}
        {!isStreaming && message.content.length > 0 && (
          <button
            onClick={handleCopy}
            title={copied ? 'Copié !' : 'Copier'}
            className={cn(
              'absolute -bottom-3 right-2 flex size-6 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100',
              isUser
                ? 'bg-blue-500/30 text-white/70 hover:bg-blue-500/50 hover:text-white'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            aria-label="Copier le message"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        )}
      </div>

      {/* Metadata row — assistant only */}
      {!isUser && !isStreaming && (label || tokens || message.cost != null || message.responseTimeMs != null) && (
        <div className="mt-auto flex shrink-0 flex-col gap-0.5 self-end pb-1">
          {label && (
            <span className="text-[11px] font-medium text-muted-foreground/60">
              {label}
            </span>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            {tokens && <span>{tokens}</span>}
            {message.cost != null && message.cost > 0 && (
              <span>{formatCost(message.cost)}</span>
            )}
            {message.responseTimeMs != null && (
              <span>{formatTime(message.responseTimeMs)}</span>
            )}
          </div>
          {/* TTS — read message aloud */}
          {message.content.length > 0 && (
            <AudioPlayer text={message.content} compact />
          )}
        </div>
      )}
    </div>
  )
}

export default MessageItem
