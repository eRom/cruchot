import { useMemo } from 'react'
import { ImageIcon, MessageSquare } from 'lucide-react'
import { ProviderIcon } from './ProviderIcon'
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
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

export interface ModelSelectorProps {
  disabled?: boolean
  className?: string
}

interface FlatModel {
  model: Model
  provider: Provider
}

export function ModelSelector({ disabled = false, className }: ModelSelectorProps) {
  const { providers, models, selectedModelId, selectedProviderId, selectModel } =
    useProvidersStore()

  const favoriteModelIds = useSettingsStore((s) => s.favoriteModelIds) ?? []
  const hasFavs = favoriteModelIds.length > 0

  // Liste plate : texte et image, filtres par favoris
  const { textModels, imageModels } = useMemo(() => {
    const providerMap = new Map<string, Provider>()
    for (const p of providers) {
      if (p.isEnabled) providerMap.set(p.id, p)
    }

    const text: FlatModel[] = []
    const image: FlatModel[] = []

    for (const model of models) {
      const provider = providerMap.get(model.providerId)
      if (!provider) continue
      if (hasFavs && !favoriteModelIds.includes(model.id)) continue

      if (model.type === 'image') {
        image.push({ model, provider })
      } else {
        text.push({ model, provider })
      }
    }

    return { textModels: text, imageModels: image }
  }, [providers, models, favoriteModelIds, hasFavs])

  const selectedValue =
    selectedProviderId && selectedModelId
      ? `${selectedProviderId}::${selectedModelId}`
      : undefined

  const selectedModel = models.find((m) => m.id === selectedModelId)
  const selectedProvider = providers.find((p) => p.id === selectedProviderId)
  const isImageSelected = selectedModel?.type === 'image'

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
              'h-7 w-auto max-w-[220px] gap-1.5 rounded-full border-none px-2.5',
              'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              'transition-all duration-200 ease-out',
              'focus-visible:ring-1 focus-visible:ring-ring/30',
              'shadow-none hover:shadow-xs',
              isImageSelected && 'bg-primary/10 text-foreground hover:bg-primary/15',
              className
            )}
          >
            {selectedProviderId ? (
              <ProviderIcon providerId={selectedProviderId} size={13} />
            ) : (
              <ImageIcon className="size-3 shrink-0 opacity-60" />
            )}
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
          'min-w-[240px] max-w-[300px]',
          'border-border/50 bg-popover/95 backdrop-blur-xl',
          'shadow-lg shadow-black/10 dark:shadow-black/30'
        )}
      >
        {/* Text models — flat list */}
        {textModels.length > 0 && (
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
              <MessageSquare className="size-3.5 text-muted-foreground/60" />
              <span className="font-semibold tracking-tight">Generation de textes</span>
            </SelectLabel>
            {textModels.map(({ model, provider }) => (
              <SelectItem
                key={`${provider.id}::${model.id}`}
                value={`${provider.id}::${model.id}`}
                disabled={!provider.isConfigured || (provider.type === 'local' && provider.isOnline === false)}
                className="pl-5"
              >
                <span className="flex items-center gap-2">
                  <ProviderIcon providerId={provider.id} size={13} className="" />
                  <span className="truncate">{model.displayName}</span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        )}

        {/* Image models — flat list */}
        {imageModels.length > 0 && (
          <>
            {textModels.length > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
                <ImageIcon className="size-3.5 text-muted-foreground/60" />
                <span className="font-semibold tracking-tight">Generation d'images</span>
              </SelectLabel>
              {imageModels.map(({ model, provider }) => (
                <SelectItem
                  key={`${provider.id}::${model.id}`}
                  value={`${provider.id}::${model.id}`}
                  disabled={!provider.isConfigured}
                  className="pl-5"
                >
                  <span className="flex items-center gap-2">
                    <ProviderIcon providerId={provider.id} size={13} className="" />
                    <span className="truncate">{model.displayName}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}

        {textModels.length === 0 && imageModels.length === 0 && (
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
