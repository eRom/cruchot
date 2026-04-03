import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useLibraryStore } from '@/stores/library.store'
import type { LibraryInfo, LibrarySourceInfo, LibraryIndexingProgress } from '../../../../preload/types'
import {
  ArrowLeft,
  Database,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface LibraryDetailViewProps {
  library: LibraryInfo
  onBack: () => void
  onEdit: () => void
}

export function LibraryDetailView({ library, onBack, onEdit }: LibraryDetailViewProps) {
  const [sources, setSources] = useState<LibrarySourceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [addingFiles, setAddingFiles] = useState(false)
  const [reindexingId, setReindexingId] = useState<string | null>(null)
  const [reindexingAll, setReindexingAll] = useState(false)
  const { setIndexingProgress, clearIndexingProgress, indexingProgress } = useLibraryStore()

  // ── Load sources ─────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    window.api.libraryGetSources({ libraryId: library.id })
      .then(setSources)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [library.id])

  // ── Listen to indexing progress ──────────────────────────────
  useEffect(() => {
    window.api.onLibraryIndexingProgress((progress: LibraryIndexingProgress) => {
      if (progress.libraryId !== library.id) return
      setIndexingProgress(progress)
      if (progress.status === 'done') {
        // Refresh sources list
        window.api.libraryGetSources({ libraryId: library.id })
          .then(setSources)
          .catch(console.error)
      }
    })
    return () => {
      window.api.offLibraryIndexingProgress()
      clearIndexingProgress(library.id)
    }
  }, [library.id, setIndexingProgress, clearIndexingProgress])

  // ── Filtered sources ─────────────────────────────────────────
  const filteredSources = useMemo(() => {
    if (!search.trim()) return sources
    const q = search.toLowerCase()
    return sources.filter((s) => s.filename.toLowerCase().includes(q))
  }, [sources, search])

  // ── Add files ────────────────────────────────────────────────
  const handleAddFiles = useCallback(async () => {
    setAddingFiles(true)
    try {
      const filePaths = await window.api.libraryPickFiles()
      if (!filePaths || filePaths.length === 0) return
      const newSources = await window.api.libraryAddSources({
        libraryId: library.id,
        filePaths
      })
      setSources((prev) => [...prev, ...newSources])
      toast.success(`${newSources.length} source${newSources.length > 1 ? 's' : ''} ajoutee${newSources.length > 1 ? 's' : ''}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l\'ajout')
    } finally {
      setAddingFiles(false)
    }
  }, [library.id])

  // ── Remove source ────────────────────────────────────────────
  const handleRemoveSource = useCallback(async (sourceId: string) => {
    try {
      await window.api.libraryRemoveSource({ libraryId: library.id, sourceId })
      setSources((prev) => prev.filter((s) => s.id !== sourceId))
      setConfirmDeleteId(null)
      toast.success('Source supprimee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [library.id])

  // ── Reindex source ───────────────────────────────────────────
  const handleReindexSource = useCallback(async (sourceId: string) => {
    setReindexingId(sourceId)
    try {
      await window.api.libraryReindexSource({ libraryId: library.id, sourceId })
      toast.success('Re-indexation lancee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setReindexingId(null)
    }
  }, [library.id])

  // ── Reindex all ──────────────────────────────────────────────
  const handleReindexAll = useCallback(async () => {
    setReindexingAll(true)
    try {
      await window.api.libraryReindexAll({ libraryId: library.id })
      toast.success('Re-indexation globale lancee')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setReindexingAll(false)
    }
  }, [library.id])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Retour aux referentiels
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex size-10 items-center justify-center rounded-lg text-xl"
                style={{ backgroundColor: (library.color || '#6366f1') + '20' }}
              >
                {library.icon || '📚'}
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {library.name}
                </h1>
                {library.description && (
                  <p className="text-sm text-muted-foreground/70">{library.description}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReindexAll}
                disabled={reindexingAll || sources.length === 0}
                className="gap-1.5"
              >
                <RefreshCw className={cn('size-3.5', reindexingAll && 'animate-spin')} />
                Tout re-indexer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="gap-1.5"
              >
                <Pencil className="size-3.5" />
                Modifier
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileText className="size-4" />
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-4" />
              {library.chunksCount} chunk{library.chunksCount !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-muted-foreground/50">
              {library.embeddingModel === 'google' ? 'Gemini Embedding (768d)' : 'Local MiniLM (384d)'}
            </span>
          </div>

          {/* Search + Add files */}
          <div className="mt-5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher des sources..."
                className="pl-10"
              />
            </div>
            <Button
              onClick={handleAddFiles}
              disabled={addingFiles}
              className="gap-2"
            >
              {addingFiles ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Ajouter des fichiers
            </Button>
          </div>
        </div>
      </div>

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                {search
                  ? 'Aucune source ne correspond a votre recherche.'
                  : 'Aucune source dans ce referentiel.'}
              </p>
              {!search && (
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={handleAddFiles}
                  disabled={addingFiles}
                >
                  <Plus className="size-4" />
                  Ajouter des fichiers
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSources.map((source) => {
                const progress = indexingProgress.get(source.id)
                return (
                  <SourceRow
                    key={source.id}
                    source={source}
                    progress={progress}
                    isDeleting={confirmDeleteId === source.id}
                    isReindexing={reindexingId === source.id}
                    formatSize={formatSize}
                    onReindex={() => handleReindexSource(source.id)}
                    onDelete={() => setConfirmDeleteId(source.id)}
                    onConfirmDelete={() => handleRemoveSource(source.id)}
                    onCancelDelete={() => setConfirmDeleteId(null)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Source Row ──────────────────────────────────────────────

interface SourceRowProps {
  source: LibrarySourceInfo
  progress?: LibraryIndexingProgress
  isDeleting: boolean
  isReindexing: boolean
  formatSize: (bytes: number) => string
  onReindex: () => void
  onDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}

const PROGRESS_STATUS_LABELS: Record<string, string> = {
  extracting: 'Extraction du texte...',
  chunking: 'Decoupage...',
  embedding: 'Embedding...',
  upserting: 'Sauvegarde...',
  done: 'Termine',
  error: 'Erreur',
  'ocr-error': 'Erreur OCR'
}

function SourceRow({
  source,
  progress,
  isDeleting,
  isReindexing,
  formatSize,
  onReindex,
  onDelete,
  onConfirmDelete,
  onCancelDelete
}: SourceRowProps) {
  const statusLabel = source.status === 'ready'
    ? 'Pret'
    : source.status === 'error'
      ? 'Erreur'
      : source.status === 'pending'
        ? 'En attente'
        : source.status.charAt(0).toUpperCase() + source.status.slice(1)

  const statusColor = source.status === 'ready'
    ? 'text-emerald-600 dark:text-emerald-400'
    : source.status === 'error'
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400'

  const isProcessing = source.status !== 'ready' && source.status !== 'error' && source.status !== 'pending'
  const progressPercent = progress?.percent ?? (isProcessing ? undefined : undefined)

  const ext = source.filename.includes('.') ? source.filename.split('.').pop()?.toUpperCase() : ''

  return (
    <div className="group relative flex items-center gap-4 rounded-lg border border-border/40 px-4 py-3 hover:border-border transition-colors">
      {/* File icon */}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
        {ext || 'FILE'}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{source.filename}</p>
          <span className={cn('text-[10px] font-medium', statusColor)}>
            {isProcessing && <Loader2 className="mr-0.5 inline size-3 animate-spin" />}
            {progress
            ? `${PROGRESS_STATUS_LABELS[progress.status] ?? progress.status} (${progress.percent}%)`
            : statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
          <span>{formatSize(source.sizeBytes)}</span>
          <span>{source.chunksCount} chunk{source.chunksCount !== 1 ? 's' : ''}</span>
          {source.errorMessage && (
            <span className="text-red-500 truncate max-w-[200px]" title={source.errorMessage}>
              {source.errorMessage}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {progressPercent != null && progressPercent < 100 && (
          <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onReindex}
          disabled={isReindexing}
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Re-indexer"
        >
          <RefreshCw className={cn('size-3.5', isReindexing && 'animate-spin')} />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Supprimer"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Delete confirmation overlay */}
      {isDeleting && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/90 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">Supprimer cette source ?</p>
            <Button variant="destructive" size="sm" onClick={onConfirmDelete}>
              Supprimer
            </Button>
            <Button variant="outline" size="sm" onClick={onCancelDelete}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
