import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Trash2, Sparkles } from 'lucide-react'
import { useEpisodeStore } from '@/stores/episode.store'
import { useProvidersStore } from '@/stores/providers.store'
import { toast } from 'sonner'
import type { Episode, EpisodeCategory } from '../../../../preload/types'

const CATEGORY_LABELS: Record<EpisodeCategory, string> = {
  preference: 'Preference',
  behavior: 'Comportement',
  context: 'Contexte',
  skill: 'Competence',
  style: 'Style'
}

const CATEGORY_COLORS: Record<EpisodeCategory, string> = {
  preference: 'bg-blue-500/20 text-blue-400',
  behavior: 'bg-green-500/20 text-green-400',
  context: 'bg-amber-500/20 text-amber-400',
  skill: 'bg-purple-500/20 text-purple-400',
  style: 'bg-pink-500/20 text-pink-400'
}

export function ProfileTab() {
  const episodes = useEpisodeStore((s) => s.episodes)
  const stats = useEpisodeStore((s) => s.stats)
  const isLoaded = useEpisodeStore((s) => s.isLoaded)
  const loadEpisodes = useEpisodeStore((s) => s.loadEpisodes)
  const loadStats = useEpisodeStore((s) => s.loadStats)
  const toggleEpisode = useEpisodeStore((s) => s.toggleEpisode)
  const deleteEpisode = useEpisodeStore((s) => s.deleteEpisode)
  const setModel = useEpisodeStore((s) => s.setModel)

  const models = useProvidersStore((s) => s.models)

  const [selectedModelId, setSelectedModelId] = useState<string>('')

  useEffect(() => {
    if (!isLoaded) loadEpisodes()
    loadStats()
  }, [isLoaded, loadEpisodes, loadStats])

  useEffect(() => {
    if (stats?.modelId) setSelectedModelId(stats.modelId)
  }, [stats?.modelId])

  const handleModelChange = useCallback(async (value: string) => {
    setSelectedModelId(value)
    try {
      await setModel(value)
      toast.success('Modele d\'extraction mis a jour')
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }, [setModel])

  const handleToggle = useCallback(async (id: string) => {
    try {
      await toggleEpisode(id)
    } catch {
      toast.error('Erreur')
    }
  }, [toggleEpisode])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteEpisode(id)
      toast.success('Episode supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }, [deleteEpisode])

  const grouped = useMemo(() => {
    const groups: Record<string, Episode[]> = {}
    const sorted = [...episodes].sort((a, b) => b.confidence - a.confidence)
    for (const ep of sorted) {
      if (!groups[ep.category]) groups[ep.category] = []
      groups[ep.category].push(ep)
    }
    return groups
  }, [episodes])

  const activeCount = useMemo(() => episodes.filter(e => e.isActive).length, [episodes])

  return (
    <div className="space-y-6">
      {/* Model selector */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Modele d'extraction</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              LLM utilise pour analyser les conversations et extraire les episodes
            </p>
          </div>
          <select
            value={selectedModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
          >
            <option value="">Non configure</option>
            {models.map((m) => (
              <option key={`${m.providerId}::${m.id}`} value={`${m.providerId}::${m.id}`}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats */}
      {stats && stats.total > 0 && (
        <p className="text-xs text-muted-foreground">
          {activeCount} actif{activeCount > 1 ? 's' : ''} sur {stats.total} episodes
        </p>
      )}

      {/* Empty state */}
      {episodes.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
          <Sparkles className="size-10 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Aucun episode detecte</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Cruchot apprendra a te connaitre au fil des conversations
            </p>
          </div>
        </div>
      )}

      {/* Episodes grouped by category */}
      {Object.entries(grouped).map(([category, eps]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[category as EpisodeCategory]}`}>
              {CATEGORY_LABELS[category as EpisodeCategory]}
            </span>
            <span className="text-xs text-muted-foreground">{eps.length}</span>
          </div>

          {eps.map((ep) => (
            <div
              key={ep.id}
              className={`group flex items-start gap-3 rounded-lg border border-border/40 bg-card p-3 transition-opacity ${!ep.isActive ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{ep.content}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{Math.round(ep.confidence * 100)}%</span>
                  {ep.occurrences > 1 && <span>vu {ep.occurrences}x</span>}
                  <span>{new Date(ep.createdAt).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleToggle(ep.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={ep.isActive ? 'Desactiver' : 'Activer'}
                >
                  {ep.isActive ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(ep.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  title="Supprimer"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
