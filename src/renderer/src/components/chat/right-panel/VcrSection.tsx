import { useEffect, useRef, useState } from 'react'
import { Video, Square } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { Button } from '@/components/ui/button'
import { useVcrStore } from '@/stores/vcr.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useUiStore } from '@/stores/ui.store'
import { useProvidersStore } from '@/stores/providers.store'
import { toast } from 'sonner'

export function VcrSection() {
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const isStreaming = useUiStore((s) => s.isStreaming)

  const isRecording = useVcrStore((s) => s.isRecording)
  const activeRecording = useVcrStore((s) => s.activeRecording)
  const startRecording = useVcrStore((s) => s.startRecording)
  const stopRecording = useVcrStore((s) => s.stopRecording)
  const refreshStatus = useVcrStore((s) => s.refreshStatus)

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Timer: update elapsed time every second when recording
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isRecording && activeRecording) {
      setElapsedSeconds(Math.floor((Date.now() - activeRecording.startedAt) / 1000))

      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - activeRecording.startedAt) / 1000))
      }, 1000)
    } else {
      setElapsedSeconds(0)
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording, activeRecording])

  // Poll vcrStatus every 2s during recording to update event/tool counts
  useEffect(() => {
    if (!isRecording) return

    const pollRef = setInterval(() => {
      refreshStatus().catch(() => {})
    }, 2000)

    return () => clearInterval(pollRef)
  }, [isRecording, refreshStatus])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const handleRecord = async () => {
    if (!activeConversationId) return

    try {
      const fullModelId = useProvidersStore.getState().getSelectedModelId()
      const [providerId, modelId] = fullModelId ? fullModelId.split('::') : [undefined, undefined]

      await startRecording(activeConversationId, {
        modelId,
        providerId
      })
      toast.success('Enregistrement VCR demarre')
    } catch {
      toast.error('Erreur au demarrage du VCR')
    }
  }

  const handleStop = async () => {
    try {
      await stopRecording()
      toast.success('Enregistrement sauvegarde')
    } catch {
      toast.error('Erreur a l\'arret du VCR')
    }
  }

  const isRecordDisabled = !activeConversationId || isStreaming

  return (
    <CollapsibleSection title="VCR Recording" defaultOpen={false}>
      <div className="flex flex-col gap-3">
        {!isRecording ? (
          /* Idle state: single Record button */
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-red-500 border-red-500/30 hover:bg-red-500/10 hover:text-red-500"
            disabled={isRecordDisabled}
            onClick={handleRecord}
          >
            <Video className="size-3.5" />
            Record
          </Button>
        ) : (
          <>
            {/* Recording state: stats card */}
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Duree</span>
                <span className="font-mono font-medium tabular-nums">{formatDuration(elapsedSeconds)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Evenements</span>
                <span className="font-mono font-medium">{activeRecording?.eventCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Outils</span>
                <span className="font-mono font-medium">{activeRecording?.toolCallCount ?? 0}</span>
              </div>
            </div>

            {/* Stop button */}
            <Button
              variant="destructive"
              size="sm"
              className="w-full gap-1.5"
              onClick={handleStop}
            >
              <Square className="size-3.5" />
              Stop Recording
            </Button>
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}
