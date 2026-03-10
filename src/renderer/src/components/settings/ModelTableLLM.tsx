import { Star } from 'lucide-react'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`
  return `${tokens}`
}

function formatPrice(price: number): string {
  if (price === 0) return '-'
  return `$${price.toFixed(2)}`
}

export function ModelTableLLM() {
  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const favoriteModelIds = useSettingsStore((s) => s.favoriteModelIds) ?? []
  const toggleFavoriteModel = useSettingsStore((s) => s.toggleFavoriteModel)

  const textModels = models.filter((m) => m.type === 'text')

  const groupedByProvider = providers
    .filter((p) => p.isEnabled)
    .map((provider) => ({
      provider,
      models: textModels.filter((m) => m.providerId === provider.id)
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Modeles LLM</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cliquez sur l'etoile pour ajouter un modele a vos favoris. Seuls les favoris apparaissent dans le selecteur du chat.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Modele</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Input / 1M</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Output / 1M</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Contexte</th>
              <th className="w-12 px-3 py-2 text-center font-medium text-muted-foreground">Favori</th>
            </tr>
          </thead>
          <tbody>
            {groupedByProvider.map((group) => (
              <ProviderSection
                key={group.provider.id}
                providerName={group.provider.name}
                isConfigured={group.provider.isConfigured}
                models={group.models.map((m) => ({
                  id: m.id,
                  displayName: m.displayName,
                  inputPrice: m.inputPrice,
                  outputPrice: m.outputPrice,
                  contextWindow: m.contextWindow,
                  isFavorite: favoriteModelIds.includes(m.id),
                  supportsThinking: m.supportsThinking
                }))}
                onToggleFavorite={toggleFavoriteModel}
              />
            ))}
          </tbody>
        </table>
      </div>

      {favoriteModelIds.length === 0 && (
        <p className="text-xs text-muted-foreground/60">
          Aucun favori selectionne — tous les modeles sont affiches dans le selecteur du chat.
        </p>
      )}
    </div>
  )
}

interface ModelRow {
  id: string
  displayName: string
  inputPrice: number
  outputPrice: number
  contextWindow: number
  isFavorite: boolean
  supportsThinking: boolean
}

function ProviderSection({
  providerName,
  isConfigured,
  models,
  onToggleFavorite
}: {
  providerName: string
  isConfigured: boolean
  models: ModelRow[]
  onToggleFavorite: (modelId: string) => void
}) {
  return (
    <>
      <tr className="border-t border-border/30 bg-muted/10">
        <td colSpan={5} className="px-3 py-1.5">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'size-1.5 rounded-full',
                isConfigured ? 'bg-emerald-500' : 'bg-muted-foreground/30'
              )}
            />
            <span className="text-xs font-semibold text-foreground">{providerName}</span>
            {!isConfigured && (
              <span className="text-[10px] text-muted-foreground/50">non configure</span>
            )}
          </div>
        </td>
      </tr>
      {models.map((model) => (
        <tr
          key={model.id}
          className={cn(
            'border-t border-border/20 transition-colors hover:bg-muted/20',
            !isConfigured && 'opacity-40'
          )}
        >
          <td className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="text-foreground">{model.displayName}</span>
              {model.supportsThinking && (
                <span className="rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-medium text-violet-500">
                  think
                </span>
              )}
            </div>
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
            {formatPrice(model.inputPrice)}
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
            {formatPrice(model.outputPrice)}
          </td>
          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
            {model.contextWindow > 0 ? formatContextWindow(model.contextWindow) : '-'}
          </td>
          <td className="px-3 py-2 text-center">
            <button
              onClick={() => onToggleFavorite(model.id)}
              className="inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-muted"
            >
              <Star
                className={cn(
                  'size-4 transition-colors',
                  model.isFavorite
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                )}
              />
            </button>
          </td>
        </tr>
      ))}
    </>
  )
}
