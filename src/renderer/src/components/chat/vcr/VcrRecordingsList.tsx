import * as React from 'react'
import { X, Play, Download, FileCode2, Trash2 } from 'lucide-react'
import { useVcrStore } from '@/stores/vcr.store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`
}

export function VcrRecordingsList(): React.ReactElement | null {
  const listOpen = useVcrStore((s) => s.listOpen)
  const closeList = useVcrStore((s) => s.closeList)
  const recordings = useVcrStore((s) => s.recordings)
  const openPlayer = useVcrStore((s) => s.openPlayer)
  const exportVcr = useVcrStore((s) => s.exportVcr)
  const exportHtml = useVcrStore((s) => s.exportHtml)
  const deleteRecording = useVcrStore((s) => s.deleteRecording)

  // Close on Escape
  React.useEffect(() => {
    if (!listOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeList()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [listOpen, closeList])

  if (!listOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={closeList}
        aria-hidden="true"
      />

      {/* Panel — slides in from the right */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recordings VCR"
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col',
          'bg-background border-l border-border shadow-xl',
          'animate-in slide-in-from-right duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recordings VCR</h2>
          <Button variant="ghost" size="icon" onClick={closeList} className="size-7">
            <X className="size-4" />
            <span className="sr-only">Fermer</span>
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {recordings.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun recording
            </p>
          ) : (
            recordings.map((rec) => (
              <div
                key={rec.recordingId}
                className={cn(
                  'rounded-lg border border-border/40 bg-sidebar p-3',
                  'flex flex-col gap-2'
                )}
              >
                {/* Meta */}
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] font-medium text-foreground">
                    {formatDate(rec.startedAt)}
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>Durée : {formatDuration(rec.duration)}</span>
                    <span>Modèle : {rec.modelId}</span>
                    <span>Outils : {rec.toolCallCount ?? 0}</span>
                    <span>Événements : {rec.eventCount ?? 0}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-6 px-2"
                    onClick={() => openPlayer(rec.recordingId)}
                  >
                    <Play className="size-3" />
                    Play
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-6 px-2"
                    onClick={() => exportVcr(rec.recordingId)}
                  >
                    <Download className="size-3" />
                    Export .vcr
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-6 px-2"
                    onClick={() => exportHtml(rec.recordingId)}
                  >
                    <FileCode2 className="size-3" />
                    Export HTML
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[11px] h-6 px-2 text-red-500 hover:text-red-600 hover:border-red-400"
                    onClick={() => deleteRecording(rec.recordingId)}
                  >
                    <Trash2 className="size-3" />
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
