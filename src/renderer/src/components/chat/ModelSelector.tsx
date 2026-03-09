import { useMemo } from 'react'
import { ChevronDown, Circle, Cpu, ImageIcon } from 'lucide-react'
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

  // Separer modeles texte et image
  const { textGroups, imageModels } = useMemo(() => {
    const map = new Map<string, ProviderGroup>()

    for (const provider of providers) {
      if (!provider.isEnabled) continue
      map.set(provider.id, { provider, models: [] })
    }

    const imgModels: { model: Model; provider: Provider }[] = []

    for (const model of models) {
      const group = map.get(model.providerId)
      if (!group) continue

      if (model.type === 'image') {
        imgModels.push({ model, provider: group.provider })
      } else {
        group.models.push(model)
      }
    }

    // Ne garder que les groupes texte avec des modeles
    const tGroups = Array.from(map.values()).filter((g) => g.models.length > 0)

    return { textGroups: tGroups, imageModels: imgModels }
  }, [providers, models])

  // Valeur composite pour le Select: "providerId::modelId"
  const selectedValue =
    selectedProviderId && selectedModelId
      ? `${selectedProviderId}::${selectedModelId}`
      : undefined

  // Trouver le modele et provider selectionnes pour l'affichage
  const selectedModel = models.find((m) => m.id === selectedModelId)
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const isImageSelected = selectedModel?.type === 'image'

  const handleValueChange = (composite: string) => {
    const [providerId, modelId] = composite.split('::')
    if (providerId && modelId) {
      selectModel(providerId, modelId)
    }
  }

  const TriggerIcon = isImageSelected ? ImageIcon : Cpu

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
              // Accent quand modele image selectionne
              isImageSelected && 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400',
              className
            )}
          >
            <TriggerIcon className="size-3 shrink-0 opacity-60" />
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
        {/* Text models grouped by provider */}
        {textGroups.map((group, index) => (
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

        {/* Image generation models */}
        {imageModels.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
                <ImageIcon className="size-3.5 text-violet-500" />
                <span className="font-semibold tracking-tight">Generation d'images</span>
              </SelectLabel>
              {imageModels.map(({ model, provider }) => (
                <SelectItem
                  key={`${provider.id}::${model.id}`}
                  value={`${provider.id}::${model.id}`}
                  disabled={!provider.isConfigured}
                  className="pl-6"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate">{model.displayName}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                      {provider.name}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}

        {textGroups.length === 0 && imageModels.length === 0 && (
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
