import { Star } from 'lucide-react'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

function formatPrice(price: number): string {
  if (price === 0) return '-'
  return `$${price.toFixed(2)}`
}

export function ModelTableImages() {
  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const favoriteModelIds = useSettingsStore((s) => s.favoriteModelIds) ?? []
  const toggleFavoriteModel = useSettingsStore((s) => s.toggleFavoriteModel)

  const imageModels = models
    .filter((m) => m.type === 'image')
    .map((m) => {
      const provider = providers.find((p) => p.id === m.providerId)
      return { model: m, provider }
    })
    .filter((item) => item.provider?.isEnabled)
    .sort((a, b) =>
      (a.provider?.name ?? '').localeCompare(b.provider?.name ?? '') ||
      a.model.displayName.localeCompare(b.model.displayName)
    )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Modeles d'images</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Modeles de generation d'images disponibles.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Modele</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Provider</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Input / 1M</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Output / 1M</th>
              <th className="w-12 px-3 py-2 text-center font-medium text-muted-foreground">Favori</th>
            </tr>
          </thead>
          <tbody>
            {imageModels.map(({ model, provider }) => (
              <tr
                key={model.id}
                className={cn(
                  'border-t border-border/20 transition-colors hover:bg-muted/20',
                  !provider?.isConfigured && 'opacity-40'
                )}
              >
                <td className="px-3 py-2 text-foreground">{model.displayName}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'size-1.5 rounded-full',
                        provider?.isConfigured ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                      )}
                    />
                    <span className="text-muted-foreground">{provider?.name}</span>
                    {!provider?.isConfigured && (
                      <span className="text-[10px] text-muted-foreground/50">non configure</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {formatPrice(model.inputPrice)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {formatPrice(model.outputPrice)}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => toggleFavoriteModel(model.id)}
                    className="inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-muted"
                  >
                    <Star
                      className={cn(
                        'size-4 transition-colors',
                        favoriteModelIds.includes(model.id)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-muted-foreground/30 hover:text-muted-foreground/60'
                      )}
                    />
                  </button>
                </td>
              </tr>
            ))}
            {imageModels.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Aucun modele d'image disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
