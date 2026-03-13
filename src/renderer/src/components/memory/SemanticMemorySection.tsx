import { useEffect, useState } from 'react'
import { Brain, RefreshCw, Trash2, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSettingsStore } from '@/stores/settings.store'
import { useSemanticMemoryStore } from '@/stores/semantic-memory.store'
import { MemoryExplorer } from './MemoryExplorer'

export function SemanticMemorySection() {
  const semanticMemoryEnabled = useSettingsStore((s) => s.semanticMemoryEnabled) ?? true
  const setSemanticMemoryEnabled = useSettingsStore((s) => s.setSemanticMemoryEnabled)
  const stats = useSemanticMemoryStore((s) => s.stats)
  const fetchStats = useSemanticMemoryStore((s) => s.fetchStats)
  const forgetAll = useSemanticMemoryStore((s) => s.forgetAll)
  const reindex = useSemanticMemoryStore((s) => s.reindex)
  const [showExplorer, setShowExplorer] = useState(false)
  const [reindexing, setReindexing] = useState(false)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 10_000)
    return () => clearInterval(interval)
  }, [fetchStats])

  const handleReindex = async () => {
    setReindexing(true)
    try {
      await reindex()
      toast.success('Re-indexation lancee')
      setTimeout(fetchStats, 3000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setReindexing(false)
    }
  }

  const handleForgetAll = async () => {
    try {
      await forgetAll()
      toast.success('Memoire semantique effacee')
      fetchStats()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  if (showExplorer) {
    return <MemoryExplorer onBack={() => setShowExplorer(false)} />
  }

  const statusColor = stats?.status === 'ready'
    ? 'text-emerald-500'
    : stats?.status === 'starting'
      ? 'text-yellow-500'
      : stats?.status === 'error'
        ? 'text-red-500'
        : 'text-muted-foreground/50'

  const statusLabel = stats?.status === 'ready'
    ? 'Pret'
    : stats?.status === 'starting'
      ? 'Demarrage...'
      : stats?.status === 'error'
        ? 'Erreur'
        : 'Arrete'

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-purple-500" />
          <h3 className="text-sm font-medium text-foreground">Memoire semantique</h3>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={semanticMemoryEnabled}
            onChange={(e) => setSemanticMemoryEnabled(e.target.checked)}
            className="peer sr-only"
          />
          <div className="h-5 w-9 rounded-full bg-muted peer-checked:bg-primary after:absolute after:left-[2px] after:top-[2px] after:size-4 after:rounded-full after:bg-background after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>

      {/* Stats */}
      {semanticMemoryEnabled && stats && (
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${statusColor} ${stats.status === 'starting' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: 'currentColor' }}
            />
            <span className={statusColor}>{statusLabel}</span>
            {stats.totalPoints > 0 && (
              <span className="text-muted-foreground/70">
                — {stats.totalPoints.toLocaleString()} souvenir{stats.totalPoints > 1 ? 's' : ''} indexe{stats.totalPoints > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {stats.totalPoints > 0 && (
            <>
              <p>{stats.collectionSizeMB} MB sur disque</p>
              {stats.pendingSync > 0 && (
                <p>{stats.pendingSync} message{stats.pendingSync > 1 ? 's' : ''} en attente d'indexation</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      {semanticMemoryEnabled && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExplorer(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent/50 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            <Search className="size-3" />
            Explorer
          </button>
          <button
            onClick={handleReindex}
            disabled={reindexing || stats?.status !== 'ready'}
            className="flex items-center gap-1.5 rounded-lg bg-accent/50 px-3 py-1.5 text-xs text-foreground hover:bg-accent disabled:opacity-50"
          >
            {reindexing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Re-indexer
          </button>
          <button
            onClick={handleForgetAll}
            disabled={stats?.status !== 'ready' || (stats?.totalPoints ?? 0) === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="size-3" />
            Tout oublier
          </button>
        </div>
      )}
    </div>
  )
}
