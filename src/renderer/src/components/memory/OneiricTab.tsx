import { useCallback, useEffect, useMemo, useState } from 'react'
import { Moon, Play, Square, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useOneiricStore } from '@/stores/oneiric.store'
import { useProvidersStore } from '@/stores/providers.store'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { OneiricRun } from '../../../../preload/types'

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
  running: Loader2
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-amber-400',
  running: 'text-blue-400'
}

const PHASE_LABELS: Record<number, string> = {
  1: 'Semantique',
  2: 'Episodique',
  3: 'Croisee'
}

export function OneiricTab() {
  const isRunning = useOneiricStore((s) => s.isRunning)
  const currentPhase = useOneiricStore((s) => s.currentPhase)
  const runs = useOneiricStore((s) => s.runs)
  const isLoaded = useOneiricStore((s) => s.isLoaded)
  const modelId = useOneiricStore((s) => s.modelId)
  const schedule = useOneiricStore((s) => s.schedule)
  const loadRuns = useOneiricStore((s) => s.loadRuns)
  const loadStatus = useOneiricStore((s) => s.loadStatus)
  const consolidateNow = useOneiricStore((s) => s.consolidateNow)
  const cancel = useOneiricStore((s) => s.cancel)
  const setCurrentPhase = useOneiricStore((s) => s.setCurrentPhase)
  const setModel = useOneiricStore((s) => s.setModel)
  const clearModel = useOneiricStore((s) => s.clearModel)
  const setSchedule = useOneiricStore((s) => s.setSchedule)

  const models = useProvidersStore((s) => s.models)
  const [selectedModelId, setSelectedModelId] = useState<string>('')

  const isEnabled = !!modelId

  useEffect(() => {
    if (!isLoaded) loadRuns()
    loadStatus()
  }, [isLoaded, loadRuns, loadStatus])

  useEffect(() => {
    if (modelId) setSelectedModelId(modelId)
  }, [modelId])

  // Listen for progress events
  useEffect(() => {
    const handler = (data: { phase: number; label: string }) => {
      setCurrentPhase(data.phase)
    }
    window.api.onOneiricProgress(handler)
    return () => {
      window.api.offOneiricProgress()
    }
  }, [setCurrentPhase])

  const handleToggleEnabled = useCallback(async () => {
    if (isEnabled) {
      try {
        await clearModel()
        setSelectedModelId('')
        toast.success('Consolidation desactivee')
      } catch {
        toast.error('Erreur')
      }
    } else {
      if (models.length > 0) {
        const first = `${models[0].providerId}::${models[0].id}`
        setSelectedModelId(first)
        try {
          await setModel(first)
          toast.success('Consolidation activee')
        } catch {
          toast.error('Erreur')
        }
      }
    }
  }, [isEnabled, clearModel, setModel, models])

  const handleModelChange = useCallback(async (value: string) => {
    setSelectedModelId(value)
    try {
      await setModel(value)
      toast.success('Modele de consolidation mis a jour')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }, [setModel])

  const handleConsolidate = useCallback(async () => {
    try {
      await consolidateNow()
      toast.success('Consolidation terminee')
    } catch {
      toast.error('Erreur lors de la consolidation')
    }
  }, [consolidateNow])

  const handleCancel = useCallback(async () => {
    try {
      await cancel()
      toast.success('Consolidation annulee')
    } catch {
      toast.error('Erreur')
    }
  }, [cancel])

  const handleScheduleChange = useCallback(async (type: string) => {
    const newSchedule = {
      enabled: type !== 'disabled',
      type: type === 'interval' ? 'interval' as const : 'daily' as const,
      time: schedule?.time ?? '03:00',
      intervalHours: schedule?.intervalHours ?? 12
    }
    try {
      await setSchedule(newSchedule)
    } catch {
      toast.error('Erreur')
    }
  }, [setSchedule, schedule])

  const handleTimeChange = useCallback(async (time: string) => {
    if (!schedule) return
    try {
      await setSchedule({ ...schedule, time })
    } catch {
      toast.error('Erreur')
    }
  }, [setSchedule, schedule])

  const lastRun = useMemo(() => runs[0] ?? null, [runs])

  return (
    <div className="space-y-6">
      {/* Enable/disable + model selector */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Consolidation onirique</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consolide et nettoie la memoire automatiquement
            </p>
          </div>
          <button
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          >
            <span
              className={`inline-block size-3.5 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`}
            />
          </button>
        </div>

        {isEnabled && (
          <>
            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Modele</p>
              <Select value={selectedModelId} onValueChange={handleModelChange}>
                <SelectTrigger className="w-[220px] h-8 text-xs">
                  <SelectValue placeholder="Choisir un modele" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem
                      key={`${m.providerId}::${m.id}`}
                      value={`${m.providerId}::${m.id}`}
                      className="text-xs"
                    >
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <p className="text-xs text-muted-foreground">Planification</p>
              <Select
                value={schedule?.enabled ? schedule.type : 'disabled'}
                onValueChange={handleScheduleChange}
              >
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled" className="text-xs">Desactivee</SelectItem>
                  <SelectItem value="daily" className="text-xs">Quotidienne</SelectItem>
                  <SelectItem value="interval" className="text-xs">Par intervalle</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {schedule?.enabled && schedule.type === 'daily' && (
              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <p className="text-xs text-muted-foreground">Heure</p>
                <input
                  type="time"
                  value={schedule.time ?? '03:00'}
                  onChange={(e) => handleTimeChange(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Action button */}
      {isEnabled && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          {isRunning ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-xs text-foreground">
                  Phase {currentPhase ?? '?'}/3 — {currentPhase ? PHASE_LABELS[currentPhase] : '...'}
                </span>
              </div>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg bg-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/30"
              >
                <Square className="size-3" />
                Annuler
              </button>
            </div>
          ) : (
            <button
              onClick={handleConsolidate}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Play className="size-3.5" />
              Consolider maintenant
            </button>
          )}
        </div>
      )}

      {/* Last run summary */}
      {lastRun && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = STATUS_ICONS[lastRun.status] ?? Clock
              return <Icon className={`size-4 ${STATUS_COLORS[lastRun.status] ?? 'text-muted-foreground'} ${lastRun.status === 'running' ? 'animate-spin' : ''}`} />
            })()}
            <span className="text-sm text-foreground capitalize">{lastRun.status}</span>
            <span className="text-xs text-muted-foreground">
              — {formatRelativeTime(lastRun.startedAt)}
            </span>
          </div>

          {lastRun.status === 'completed' && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {lastRun.chunksAnalyzed > 0 && (
                <p>{lastRun.chunksAnalyzed} chunks analyses, {lastRun.chunksMerged} merges, {lastRun.chunksDeleted} supprimes</p>
              )}
              {lastRun.episodesAnalyzed > 0 && (
                <p>{lastRun.episodesAnalyzed} episodes analyses, {lastRun.episodesStaled} perimes</p>
              )}
              {lastRun.episodesCreated > 0 && (
                <p>{lastRun.episodesCreated} nouveaux episodes crees</p>
              )}
              <p>Cout : ${lastRun.cost.toFixed(4)} | Duree : {formatDuration(lastRun.durationMs)}</p>
            </div>
          )}

          {lastRun.status === 'failed' && lastRun.errorMessage && (
            <p className="text-xs text-red-400">{lastRun.errorMessage}</p>
          )}
        </div>
      )}

      {/* History */}
      {runs.length > 1 && (
        <div className="rounded-xl border border-border/60 bg-card p-4">
          <p className="text-xs font-medium text-foreground mb-3">Historique</p>
          <div className="space-y-1.5">
            {runs.slice(1, 11).map((run) => (
              <RunHistoryRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {runs.length === 0 && isEnabled && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
          <Moon className="size-10 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Aucune consolidation effectuee</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Lance une consolidation manuelle ou configure un horaire
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function RunHistoryRow({ run }: { run: OneiricRun }) {
  const Icon = STATUS_ICONS[run.status] ?? Clock
  const date = new Date(run.startedAt)

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className={`size-3 ${STATUS_COLORS[run.status] ?? ''} ${run.status === 'running' ? 'animate-spin' : ''}`} />
      <span className="w-[80px]">{date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      <span className="capitalize">{run.status}</span>
      {run.status === 'completed' && <span>${run.cost.toFixed(3)}</span>}
    </div>
  )
}

function formatRelativeTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return "a l'instant"
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days}j`
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}
