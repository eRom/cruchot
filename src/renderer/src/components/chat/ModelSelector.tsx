import { useMemo } from 'react'
import { ChevronDown, Circle, Cpu } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useProvidersStore, type Provider, type Model } from '@/stores/providers.store'
import { cn } from '@/lib/utils'

// ── Types pour futures integrations ──────────────────────────
export interface ModelSelectorProps {
  disabled?: boolean
  className?: string
}

// ── Grouped models helper ────────────────────────────────────
interface ProviderGroup {
  provider: Provider
  models: Model[]
}

export function ModelSelector({ disabled = false, className }: ModelSelectorProps) {
  const { providers, models, selectedModelId, selectedProviderId, selectModel } =
    useProvidersStore()

  // Grouper les modeles par provider
  const groups = useMemo<ProviderGroup[]>(() => {
    const map = new Map<string, ProviderGroup>()

    for (const provider of providers) {
      if (!provider.isEnabled) continue
      map.set(provider.id, { provider, models: [] })
    }

    for (const model of models) {
      const group = map.get(model.providerId)
      if (group) {
        group.models.push(model)
      }
    }

    // Ne garder que les groupes avec des modeles
    return Array.from(map.values()).filter((g) => g.models.length > 0)
  }, [providers, models])

  // Valeur composite pour le Select: "providerId::modelId"
  const selectedValue =
    selectedProviderId && selectedModelId
      ? `${selectedProviderId}::${selectedModelId}`
      : undefined

  // Trouver le modele et provider selectionnes pour l'affichage
  const selectedModel = models.find((m) => m.id === selectedModelId)
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)

  const handleValueChange = (composite: string) => {
    const [providerId, modelId] = composite.split('::')
    if (providerId && modelId) {
      selectModel(providerId, modelId)
    }
  }

  return (
    <Select value={selectedValue} onValueChange={handleValueChange} disabled={disabled}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger
            size="sm"
            className={cn(
              // Base — badge compact et discret
              'h-7 w-auto max-w-[220px] gap-1.5 rounded-full border-none px-2.5',
              // Couleurs subtiles
              'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              // Transition douce
              'transition-all duration-200 ease-out',
              // Focus ring discrete
              'focus-visible:ring-1 focus-visible:ring-ring/30',
              // Ombre legere pour l'elevation
              'shadow-none hover:shadow-xs',
              className
            )}
          >
            <Cpu className="size-3 shrink-0 opacity-60" />
            <SelectValue placeholder="Modele...">
              {selectedModel ? (
                <span className="truncate text-xs font-medium">
                  {selectedModel.displayName}
                </span>
              ) : (
                <span className="text-xs">Modele...</span>
              )}
            </SelectValue>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {selectedProvider && selectedModel
            ? `${selectedProvider.name} — ${selectedModel.displayName}`
            : 'Selectionner un modele'}
        </TooltipContent>
      </Tooltip>

      <SelectContent
        position="popper"
        side="top"
        align="start"
        sideOffset={8}
        className={cn(
          'min-w-[260px] max-w-[320px]',
          // Fond avec backdrop blur pour profondeur
          'border-border/50 bg-popover/95 backdrop-blur-xl',
          // Ombre raffinee
          'shadow-lg shadow-black/10 dark:shadow-black/30'
        )}
      >
        {groups.map((group, index) => (
          <div key={group.provider.id}>
            {index > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
                <ProviderStatusDot isConfigured={group.provider.isConfigured} />
                <span className="font-semibold tracking-tight">
                  {group.provider.name}
                </span>
                {!group.provider.isConfigured && (
                  <span className="ml-auto text-[10px] text-muted-foreground/60">
                    non configure
                  </span>
                )}
              </SelectLabel>
              {group.models.map((model) => (
                <SelectItem
                  key={`${group.provider.id}::${model.id}`}
                  value={`${group.provider.id}::${model.id}`}
                  disabled={!group.provider.isConfigured}
                  className="pl-6"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate">{model.displayName}</span>
                    {model.contextWindow > 0 && (
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                        {formatContextWindow(model.contextWindow)}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            Aucun modele disponible.
            <br />
            Configurez un provider dans les parametres.
          </div>
        )}
      </SelectContent>
    </Select>
  )
}

// ── Composants internes ──────────────────────────────────────

function ProviderStatusDot({ isConfigured }: { isConfigured: boolean }) {
  return (
    <Circle
      className={cn(
        'size-2 shrink-0',
        isConfigured
          ? 'fill-emerald-500 text-emerald-500'
          : 'fill-muted-foreground/30 text-muted-foreground/30'
      )}
    />
  )
}

// ── Helpers ──────────────────────────────────────────────────

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`
  return `${tokens}`
}
