import * as React from 'react'
import { Play, Pause, BarChart3, Film, FileDown, Globe, Shield, X } from 'lucide-react'
import { useVcrStore } from '@/stores/vcr.store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VcrTimeline } from './VcrTimeline'
import { VcrReplay } from './VcrReplay'
import { VcrProgressBar } from './VcrProgressBar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min > 0) return `${min}:${sec.toString().padStart(2, '0')}`
  return `0:${sec.toString().padStart(2, '0')}`
}

// ── VcrPlayer ─────────────────────────────────────────────────────────────────

export function VcrPlayer(): React.ReactElement | null {
  const playerOpen = useVcrStore((s) => s.playerOpen)
  const closePlayer = useVcrStore((s) => s.closePlayer)
  const playerRecording = useVcrStore((s) => s.playerRecording)
  const playerMode = useVcrStore((s) => s.playerMode)
  const togglePlayerMode = useVcrStore((s) => s.togglePlayerMode)
  const exportVcr = useVcrStore((s) => s.exportVcr)
  const exportHtml = useVcrStore((s) => s.exportHtml)
  const playerRecordingId = useVcrStore((s) => s.playerRecordingId)

  // Local playback state
  const [playing, setPlaying] = React.useState(false)
  const [speed, setSpeed] = React.useState(1)
  const [currentOffsetMs, setCurrentOffsetMs] = React.useState(0)
  const [currentIndex, setCurrentIndex] = React.useState(0)

  // Reset state when recording changes
  React.useEffect(() => {
    setPlaying(false)
    setCurrentOffsetMs(0)
    setCurrentIndex(0)
    setSpeed(1)
  }, [playerRecordingId])

  // Close on Escape
  React.useEffect(() => {
    if (!playerOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePlayer()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [playerOpen, closePlayer])

  if (!playerRecording) return null
  if (!playerOpen) return null

  const { header, events } = playerRecording
  const totalDuration = header.duration ?? (events.length > 0 ? events[events.length - 1].offsetMs : 0)

  function handleSeek(offsetMs: number): void {
    setCurrentOffsetMs(offsetMs)
    // Find the last event index whose offsetMs <= seeked offset
    let idx = 0
    for (let i = 0; i < events.length; i++) {
      if (events[i].offsetMs <= offsetMs) idx = i
      else break
    }
    setCurrentIndex(idx)
  }

  function handleSelectEvent(index: number): void {
    const event = events[index]
    if (event) {
      setCurrentIndex(index)
      setCurrentOffsetMs(event.offsetMs)
    }
  }

  function handleTogglePlay(): void {
    setPlaying((prev) => !prev)
  }

  function handleOffsetChange(offsetMs: number): void {
    setCurrentOffsetMs(offsetMs)
    // Stop at end
    if (offsetMs >= totalDuration) {
      setPlaying(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={closePlayer}
        aria-hidden="true"
      />

      {/* Player panel — 85vh from bottom */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="VCR Player"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 flex flex-col',
          'bg-zinc-900 border-t border-zinc-700 shadow-2xl',
          'animate-in slide-in-from-bottom duration-200'
        )}
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 px-4 py-3 shrink-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">
              VCR Recording — {formatDate(header.startedAt)}
            </h2>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
              <span>Modèle : <span className="text-zinc-300">{header.modelId}</span></span>
              <span>Événements : <span className="text-zinc-300">{header.eventCount ?? events.length}</span></span>
              <span>Durée : <span className="text-zinc-300">{formatMs(totalDuration)}</span></span>
              <span>Outils : <span className="text-zinc-300">{header.toolCallCount ?? 0}</span></span>
            </div>
          </div>

          {/* Export buttons + close */}
          <div className="flex items-center gap-1.5 ml-4 shrink-0">
            {playerRecordingId && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-6 px-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  onClick={() => exportVcr(playerRecordingId)}
                  title="Export .vcr"
                >
                  <FileDown className="size-3" />
                  .vcr
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-6 px-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  onClick={() => exportHtml(playerRecordingId, false)}
                  title="Export HTML"
                >
                  <Globe className="size-3" />
                  HTML
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-6 px-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  onClick={() => exportHtml(playerRecordingId, true)}
                  title="Export HTML Anonymisé"
                >
                  <Shield className="size-3" />
                  Anonymisé
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-400 hover:text-zinc-100"
              onClick={closePlayer}
            >
              <X className="size-4" />
              <span className="sr-only">Fermer</span>
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {playerMode === 'timeline' ? (
            <VcrTimeline
              events={events}
              currentIndex={currentIndex}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <VcrReplay
              events={events}
              playing={playing}
              speed={speed}
              currentOffsetMs={currentOffsetMs}
              onOffsetChange={handleOffsetChange}
            />
          )}
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2.5 shrink-0">
          {/* Play/Pause */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-300 hover:text-zinc-100 shrink-0"
            onClick={handleTogglePlay}
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>

          {/* Progress bar */}
          <div className="flex-1">
            <VcrProgressBar
              events={events}
              totalDuration={totalDuration}
              currentOffsetMs={currentOffsetMs}
              onSeek={handleSeek}
            />
          </div>

          {/* Time display */}
          <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
            {formatMs(currentOffsetMs)} / {formatMs(totalDuration)}
          </span>

          {/* Speed selector */}
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className={cn(
              'text-[11px] bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5',
              'text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-600 shrink-0'
            )}
            title="Vitesse de lecture"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
          </select>

          {/* Mode toggle */}
          <Button
            variant="outline"
            size="sm"
            className="text-[11px] h-6 px-2 border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 shrink-0"
            onClick={togglePlayerMode}
            title={playerMode === 'timeline' ? 'Passer en mode Replay' : 'Passer en mode Timeline'}
          >
            {playerMode === 'timeline' ? (
              <>
                <Film className="size-3" />
                Replay
              </>
            ) : (
              <>
                <BarChart3 className="size-3" />
                Timeline
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
