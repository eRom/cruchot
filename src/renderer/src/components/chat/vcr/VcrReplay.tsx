import * as React from 'react'
import { useRef } from 'react'
import { cn } from '@/lib/utils'
import type { VcrEvent } from '../../../../../preload/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface VcrReplayProps {
  events: VcrEvent[]
  playing: boolean
  speed: number
  currentOffsetMs: number
  onOffsetChange: (offsetMs: number) => void
}

interface ToolCard {
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  result?: string
  error?: string
  durationMs?: number
  startOffsetMs: number
  decision?: 'auto-allow' | 'allow' | 'deny' | 'ask'
  permissionResponse?: 'allow' | 'deny' | 'allow-session'
}

interface ReplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCards: ToolCard[]
  finished: boolean
}

// ── rebuildState ───────────────────────────────────────────────────────────────

function rebuildState(events: VcrEvent[], upToMs: number): ReplayMessage[] {
  const messages: ReplayMessage[] = []
  let currentAssistant: ReplayMessage | null = null
  let msgCounter = 0

  for (const event of events) {
    if (event.offsetMs > upToMs) break

    switch (event.type) {
      case 'user-message': {
        // Close any open assistant message
        if (currentAssistant) {
          currentAssistant.finished = true
          currentAssistant = null
        }
        const content = (event.data.content as string | undefined) ?? ''
        messages.push({
          id: `user-${msgCounter++}`,
          role: 'user',
          content,
          toolCards: [],
          finished: true,
        })
        break
      }

      case 'text-delta': {
        if (!currentAssistant) {
          currentAssistant = {
            id: `assistant-${msgCounter++}`,
            role: 'assistant',
            content: '',
            toolCards: [],
            finished: false,
          }
          messages.push(currentAssistant)
        }
        const text = (event.data.text as string | undefined) ?? ''
        currentAssistant.content += text
        break
      }

      case 'tool-call': {
        if (!currentAssistant) {
          currentAssistant = {
            id: `assistant-${msgCounter++}`,
            role: 'assistant',
            content: '',
            toolCards: [],
            finished: false,
          }
          messages.push(currentAssistant)
        }
        const toolCallId = (event.data.toolCallId as string | undefined) ?? `tool-${msgCounter++}`
        const toolName = (event.data.toolName as string | undefined) ?? 'unknown'
        const args = event.data.args as Record<string, unknown> | undefined
        currentAssistant.toolCards.push({
          toolCallId,
          toolName,
          args,
          status: 'running',
          startOffsetMs: event.offsetMs,
        })
        break
      }

      case 'tool-result': {
        if (currentAssistant) {
          const toolCallId = event.data.toolCallId as string | undefined
          const card = currentAssistant.toolCards.find((c) => c.toolCallId === toolCallId)
          if (card) {
            const status = (event.data.status as 'success' | 'error') ?? 'success'
            card.status = status
            card.result = event.data.result as string | undefined
            card.error = event.data.error as string | undefined
            card.durationMs = event.offsetMs - card.startOffsetMs
          }
        }
        break
      }

      case 'permission-decision': {
        if (currentAssistant) {
          const toolCallId = event.data.toolCallId as string | undefined
          const card = currentAssistant.toolCards.find((c) => c.toolCallId === toolCallId)
          if (card) {
            card.decision = event.data.decision as ToolCard['decision']
          }
        }
        break
      }

      case 'permission-response': {
        if (currentAssistant) {
          const toolCallId = event.data.toolCallId as string | undefined
          const card = currentAssistant.toolCards.find((c) => c.toolCallId === toolCallId)
          if (card) {
            card.permissionResponse = event.data.response as ToolCard['permissionResponse']
          }
        }
        break
      }

      case 'finish': {
        if (currentAssistant) {
          currentAssistant.finished = true
          currentAssistant = null
        }
        break
      }

      default:
        break
    }
  }

  return messages
}

// ── ToolCardView ───────────────────────────────────────────────────────────────

function ToolCardView({ card }: { card: ToolCard }): React.ReactElement {
  const statusColor =
    card.status === 'success'
      ? 'border-green-500/40 bg-green-500/5'
      : card.status === 'error'
        ? 'border-red-500/40 bg-red-500/5'
        : 'border-amber-500/40 bg-amber-500/5'

  const statusLabel =
    card.status === 'success' ? 'OK' : card.status === 'error' ? 'ERR' : '...'

  const statusTextColor =
    card.status === 'success'
      ? 'text-green-500'
      : card.status === 'error'
        ? 'text-red-500'
        : 'text-amber-500'

  return (
    <div className={cn('my-1 rounded border px-3 py-2 text-[11px]', statusColor)}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-foreground">{card.toolName}</span>
        <span className={cn('font-semibold', statusTextColor)}>{statusLabel}</span>
        {card.durationMs !== undefined && (
          <span className="text-muted-foreground">{card.durationMs}ms</span>
        )}
        {card.decision && (
          <span className="text-muted-foreground">
            decision: <span className="text-foreground">{card.decision}</span>
          </span>
        )}
        {card.permissionResponse && (
          <span className="text-muted-foreground">
            response: <span className="text-foreground">{card.permissionResponse}</span>
          </span>
        )}
      </div>
      {card.args && Object.keys(card.args).length > 0 && (
        <div className="mt-1 text-muted-foreground truncate">
          {JSON.stringify(card.args).slice(0, 120)}
        </div>
      )}
      {card.error && (
        <div className="mt-1 text-red-400 truncate">{card.error}</div>
      )}
    </div>
  )
}

// ── Cursor ─────────────────────────────────────────────────────────────────────

function Cursor(): React.ReactElement {
  return (
    <span
      className="inline-block w-[0.5px] h-[1em] bg-blue-500 align-middle animate-[opacity_1s_ease-in-out_infinite]"
      style={{
        animation: 'vcr-blink 1s ease-in-out infinite',
        opacity: 1,
      }}
    />
  )
}

// ── VcrReplay ──────────────────────────────────────────────────────────────────

export function VcrReplay({
  events,
  playing,
  speed,
  currentOffsetMs,
  onOffsetChange,
}: VcrReplayProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const startWallRef = useRef<number | null>(null)
  const startOffsetRef = useRef<number>(0)

  // Compute max offset for clamping
  const maxOffsetMs = React.useMemo(() => {
    if (events.length === 0) return 0
    return events[events.length - 1].offsetMs
  }, [events])

  // Rebuild state from events up to currentOffsetMs
  const rebuildStateCb = React.useCallback(
    (upToMs: number): ReplayMessage[] => rebuildState(events, upToMs),
    [events]
  )

  const [messages, setMessages] = React.useState<ReplayMessage[]>(() =>
    rebuildStateCb(currentOffsetMs)
  )

  // RAF loop when playing
  React.useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      startWallRef.current = null
      return
    }

    startWallRef.current = performance.now()
    startOffsetRef.current = currentOffsetMs

    const tick = (): void => {
      if (startWallRef.current === null) return

      const elapsed = (performance.now() - startWallRef.current) * speed
      const newOffset = Math.min(startOffsetRef.current + elapsed, maxOffsetMs)

      const rebuilt = rebuildStateCb(newOffset)
      setMessages(rebuilt)
      onOffsetChange(newOffset)

      if (newOffset < maxOffsetMs) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, maxOffsetMs])

  // When not playing, rebuild on seek (currentOffsetMs change)
  React.useEffect(() => {
    if (playing) return
    setMessages(rebuildStateCb(currentOffsetMs))
  }, [playing, currentOffsetMs, rebuildStateCb])

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 overflow-y-auto h-full px-4 py-4"
    >
      {messages.map((msg) =>
        msg.role === 'user' ? (
          <div key={msg.id} className="flex justify-end">
            <div className="max-w-[80%] rounded-lg bg-blue-500/10 px-4 py-2.5 text-sm text-foreground">
              {msg.content}
            </div>
          </div>
        ) : (
          <div key={msg.id} className="flex flex-col gap-1">
            {msg.toolCards.map((card) => (
              <ToolCardView key={card.toolCallId} card={card} />
            ))}
            {msg.content && (
              <div className="rounded-lg px-1 py-1 text-sm text-foreground">
                {msg.content}
                {!msg.finished && playing && <Cursor />}
              </div>
            )}
            {!msg.content && !msg.finished && playing && (
              <div className="px-1 py-1">
                <Cursor />
              </div>
            )}
          </div>
        )
      )}

      {/* Blink keyframe via inline style tag */}
      <style>{`
        @keyframes vcr-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
