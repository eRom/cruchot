import { useState, useRef, useEffect } from 'react'
import type { Message, ToolApproval } from '../types/protocol'
import { ToolCallCard } from './ToolCallCard'
import { Markdown } from './Markdown'
import { ReasoningBlock } from './ReasoningBlock'

interface ChatViewProps {
  messages: Message[]
  isStreaming: boolean
  streamText: string
  reasoningText: string
  pendingApprovals: ToolApproval[]
  onSendMessage: (text: string) => void
  onToolApproval: (toolCallId: string, approved: boolean) => void
  onCancelStream: () => void
  error: string | null
}

/* ── Sparkles SVG (identique desktop MessageItem.tsx) ── */
function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
    </svg>
  )
}

/* ── Send icon SVG ─────────────────────────────────── */
function SendIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

/* ── Stop icon SVG ─────────────────────────────────── */
function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

export function ChatView({
  messages, isStreaming, streamText, reasoningText,
  pendingApprovals, onSendMessage, onToolApproval, onCancelStream, error
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isStreaming) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [streamText, isStreaming])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 300) + 'px'
    }
  }, [input])

  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100)
  }

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || isStreaming) return
    onSendMessage(text)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = '44px'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const canSend = input.trim().length > 0 && !isStreaming

  return (
    <div className="flex flex-1 flex-col overflow-hidden relative">
      {/* ── Messages ─────────────────────────────── */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-2">
          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center py-32 gap-3 select-none">
              <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 ring-1 ring-border/30">
                <SparklesIcon className="size-5 text-muted-foreground/50" />
              </div>
              <p className="text-xs text-muted-foreground/40">Envoyez un message pour commencer.</p>
            </div>
          )}

          {/* Messages — identique desktop MessageItem layout */}
          {messages.map((msg, idx) => (
            <MessageBubble key={msg.id} message={msg} animate={idx >= messages.length - 2} />
          ))}

          {/* Streaming assistant */}
          {isStreaming && (
            <div className="flex w-full gap-3 justify-start animate-fadeIn">
              {/* Avatar */}
              <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground ring-1 ring-border/30">
                <SparklesIcon className="size-4 text-sidebar-primary animate-pulse" />
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0 py-2">
                {reasoningText && <ReasoningBlock text={reasoningText} />}
                {streamText ? (
                  <div className="prose-msg">
                    <Markdown content={streamText} />
                    <span className="inline-block w-0.5 h-[18px] bg-sidebar-primary rounded-full animate-pulse ml-0.5 align-text-bottom" />
                  </div>
                ) : !reasoningText ? (
                  <div className="flex items-center gap-2 py-1 text-muted-foreground">
                    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    <span className="text-sm">Traitement en cours...</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Tool approvals */}
          {pendingApprovals.map((approval) => (
            <div key={approval.toolCallId} className="animate-slideIn">
              <ToolCallCard
                approval={approval}
                onApprove={() => onToolApproval(approval.toolCallId, true)}
                onDeny={() => onToolApproval(approval.toolCallId, false)}
              />
            </div>
          ))}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 animate-fadeIn">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Scroll to bottom ────────────────────── */}
      {showScrollBtn && (
        <button
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 rounded-full bg-card border border-border px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg hover:bg-accent transition-colors"
        >
          <svg viewBox="0 0 12 12" className="size-3 inline mr-1 -mt-px" fill="currentColor"><path d="M6 9L2 5h8z" /></svg>
          Bas
        </button>
      )}

      {/* ── Input area (identique desktop InputZone) ── */}
      <div className="relative flex w-full flex-col border-t border-border/40 bg-background/80 backdrop-blur-sm px-4 pb-6 pt-3 shrink-0
        before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6
        before:bg-gradient-to-t before:from-background/60 before:to-transparent">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
          {/* Cancel streaming button */}
          {isStreaming && (
            <button
              onClick={onCancelStream}
              className="flex items-center justify-center gap-2 w-full rounded-lg border border-destructive/20 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <StopIcon className="size-3.5" />
              Arreter la generation
            </button>
          )}

          {/* Zone de saisie — rounded-2xl card identique desktop */}
          <div className={`group relative flex flex-col rounded-2xl border bg-card shadow-sm transition-all duration-200 ease-out
            ${isStreaming ? 'border-sidebar-primary/30' : 'border-border/60'}
            focus-within:border-ring/40 focus-within:shadow-md`}>
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Envoyer un message..."
              rows={1}
              className="w-full resize-none border-none bg-transparent outline-none
                text-sm leading-relaxed text-foreground
                placeholder:text-muted-foreground/50
                px-4 pt-3 pb-0
                transition-[height] duration-150 ease-out"
              style={{ minHeight: '44px', maxHeight: '300px', lineHeight: '22px' }}
            />

            {/* Toolbar — identique desktop px-2 pb-2 pt-1 */}
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
              <div className="flex items-center gap-1.5">
                {/* Placeholder for future pills */}
              </div>
              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-all
                  ${canSend
                    ? 'bg-sidebar-primary text-white shadow-sm hover:shadow-md hover:scale-[1.03]'
                    : 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                  }`}
              >
                <SendIcon className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Message Bubble (identique desktop MessageItem) ──── */

function MessageBubble({ message, animate }: { message: Message; animate: boolean }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className={`flex w-full gap-3 px-0 justify-end ${animate ? 'animate-fadeIn' : ''}`}>
        <div className="max-w-[75%] rounded-2xl px-4 py-3 bg-sidebar text-sidebar-foreground shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap bubble-user">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex w-full gap-3 justify-start ${animate ? 'animate-fadeIn' : ''}`}>
      {/* Avatar — identique desktop: size-8 rounded-full bg-muted/60 ring-1 ring-border/30 */}
      <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground ring-1 ring-border/30">
        <SparklesIcon className="size-4" />
      </div>
      {/* Content — identique desktop: flex-1 min-w-0 py-2 */}
      <div className="flex-1 min-w-0 py-2 prose-msg">
        <Markdown content={message.content} />
      </div>
    </div>
  )
}
