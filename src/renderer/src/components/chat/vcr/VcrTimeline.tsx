import * as React from 'react'
import type { VcrEvent, VcrEventType } from '../../../../../preload/types'
import { cn } from '@/lib/utils'

interface VcrTimelineProps {
  events: VcrEvent[]
  currentIndex: number
  onSelectEvent: (index: number) => void
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/** A display item: either a single event or a collapsed group of events */
interface TimelineItem {
  /** Index of the first event in this item (used as key + selection target) */
  firstIndex: number
  /** All event indices included (>1 means collapsed group) */
  indices: number[]
  type: VcrEventType
  label: string
  summary: string
  offsetMs: number
}

function groupEvents(events: VcrEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  let i = 0

  while (i < events.length) {
    const event = events[i]

    // Collapse consecutive text-delta events
    if (event.type === 'text-delta') {
      const indices: number[] = [i]
      let j = i + 1
      while (j < events.length && events[j].type === 'text-delta') {
        indices.push(j)
        j++
      }
      const combined = indices
        .map((idx) => (events[idx].data as { text?: string }).text ?? '')
        .join('')
      items.push({
        firstIndex: i,
        indices,
        type: 'text-delta',
        label: `Texte (${indices.length})`,
        summary: combined.length > 80 ? combined.slice(0, 80) + '…' : combined,
        offsetMs: event.offsetMs
      })
      i = j
      continue
    }

    // Collapse consecutive reasoning-delta events
    if (event.type === 'reasoning-delta') {
      const indices: number[] = [i]
      let j = i + 1
      while (j < events.length && events[j].type === 'reasoning-delta') {
        indices.push(j)
        j++
      }
      const combined = indices
        .map((idx) => (events[idx].data as { text?: string }).text ?? '')
        .join('')
      items.push({
        firstIndex: i,
        indices,
        type: 'reasoning-delta',
        label: `Reasoning (${indices.length})`,
        summary: combined.length > 80 ? combined.slice(0, 80) + '…' : combined,
        offsetMs: event.offsetMs
      })
      i = j
      continue
    }

    // All other events — one item each
    items.push({
      firstIndex: i,
      indices: [i],
      type: event.type,
      label: labelForType(event.type),
      summary: summaryForEvent(event),
      offsetMs: event.offsetMs
    })
    i++
  }

  return items
}

function labelForType(type: VcrEventType): string {
  switch (type) {
    case 'session-start':    return 'Session démarrée'
    case 'session-stop':     return 'Session arrêtée'
    case 'user-message':     return 'Message utilisateur'
    case 'text-delta':       return 'Texte'
    case 'reasoning-delta':  return 'Reasoning'
    case 'tool-call':        return 'Outil appelé'
    case 'tool-result':      return 'Résultat outil'
    case 'permission-decision': return 'Permission'
    case 'permission-response': return 'Réponse permission'
    case 'plan-proposed':    return 'Plan proposé'
    case 'plan-approved':    return 'Plan approuvé'
    case 'plan-step':        return 'Étape plan'
    case 'file-diff':        return 'Fichier modifié'
    case 'finish':           return 'Fin'
    default:                 return type
  }
}

function summaryForEvent(event: VcrEvent): string {
  const d = event.data as Record<string, unknown>
  switch (event.type) {
    case 'user-message':
      return truncate(String(d.content ?? ''), 80)
    case 'tool-call':
      return truncate(`${d.toolName ?? ''}(${JSON.stringify(d.args ?? {})})`, 80)
    case 'tool-result':
      return truncate(String(d.content ?? d.output ?? ''), 80)
    case 'permission-decision':
    case 'permission-response':
      return `${d.toolName ?? ''} → ${d.decision ?? d.behavior ?? ''}`
    case 'plan-proposed':
      return truncate(String((d.plan as Record<string, unknown>)?.title ?? ''), 80)
    case 'plan-step':
      return `Étape ${d.stepIndex ?? ''}: ${d.stepStatus ?? ''}`
    case 'file-diff':
      return truncate(String(d.path ?? ''), 80)
    case 'finish':
      return `tokens: ${d.inputTokens ?? 0}↑ ${d.outputTokens ?? 0}↓`
    default:
      return ''
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function formatOffsetMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}`
  return `${sec}s`
}

// ── Color coding ─────────────────────────────────────────────────────────────

function itemColors(type: VcrEventType): { icon: string; border: string } {
  switch (type) {
    case 'user-message':
      return { icon: 'text-blue-400', border: 'border-blue-500' }
    case 'tool-call':
    case 'tool-result':
      return { icon: 'text-green-400', border: 'border-green-500' }
    case 'permission-decision':
    case 'permission-response':
      return { icon: 'text-amber-400', border: 'border-amber-500' }
    case 'reasoning-delta':
      return { icon: 'text-purple-400', border: 'border-purple-500' }
    default:
      return { icon: 'text-zinc-400', border: 'border-zinc-500' }
  }
}

// ── Icon ─────────────────────────────────────────────────────────────────────

function ItemIcon({ type }: { type: VcrEventType }) {
  const { icon } = itemColors(type)
  const base = `shrink-0 size-3 rounded-full ${icon}`

  switch (type) {
    case 'user-message':
      return (
        <svg className={`${base} fill-current`} viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="4" />
        </svg>
      )
    case 'tool-call':
    case 'tool-result':
      return (
        <svg className={`${base} fill-current`} viewBox="0 0 8 8">
          <rect x="1" y="1" width="6" height="6" rx="1" />
        </svg>
      )
    case 'permission-decision':
    case 'permission-response':
      return (
        <svg className={`${base} fill-current`} viewBox="0 0 8 8">
          <polygon points="4,0 8,8 0,8" />
        </svg>
      )
    case 'reasoning-delta':
      return (
        <svg className={`${base} fill-current`} viewBox="0 0 8 8">
          <ellipse cx="4" cy="4" rx="4" ry="3" />
        </svg>
      )
    default:
      return <span className={`${base} opacity-50 bg-current`} />
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function VcrTimeline({ events, currentIndex, onSelectEvent }: VcrTimelineProps) {
  const items = React.useMemo(() => groupEvents(events), [events])

  // Find the item that contains the currentIndex
  const activeItemIdx = React.useMemo(
    () => items.findIndex((item) => item.indices.includes(currentIndex)),
    [items, currentIndex]
  )

  const selectedItem = activeItemIdx >= 0 ? items[activeItemIdx] : null
  const selectedEvent = selectedItem ? events[selectedItem.firstIndex] : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <div className="w-[260px] shrink-0 flex flex-col border-r border-zinc-800 overflow-y-auto">
        {items.length === 0 && (
          <p className="p-4 text-xs text-zinc-500 italic">Aucun événement</p>
        )}
        {items.map((item, idx) => {
          const isActive = idx === activeItemIdx
          const { border } = itemColors(item.type)
          return (
            <button
              key={item.firstIndex}
              type="button"
              onClick={() => onSelectEvent(item.firstIndex)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-start gap-2 border-l-2 transition-colors',
                isActive
                  ? `${border} bg-zinc-800/60`
                  : 'border-transparent hover:bg-zinc-800/30'
              )}
            >
              <div className="mt-0.5">
                <ItemIcon type={item.type} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-500 tabular-nums">
                    {formatOffsetMs(item.offsetMs)}
                  </span>
                </div>
                {item.summary && (
                  <p className="text-[10px] text-zinc-500 truncate mt-0.5">{item.summary}</p>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Right detail pane */}
      <div className="flex-1 overflow-auto p-4">
        {selectedEvent ? (
          <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-all font-mono leading-relaxed">
            {JSON.stringify(selectedEvent, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-zinc-500 italic">
            Sélectionne un événement pour voir les détails.
          </p>
        )}
      </div>
    </div>
  )
}
