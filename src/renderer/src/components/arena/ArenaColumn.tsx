import React, { useEffect, useMemo, useRef } from 'react'
import { MessageSquare, Loader2 } from 'lucide-react'
import { ProviderIcon } from '@/components/chat/ProviderIcon'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useProvidersStore, type Provider, type Model } from '@/stores/providers.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useArenaStore, type ArenaMessage, type ArenaRound } from '@/stores/arena.store'
import { ArenaMetrics } from './ArenaMetrics'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer'
import { cn } from '@/lib/utils'

interface ArenaColumnProps {
  side: 'left' | 'right'
}

interface FlatModel {
  model: Model
  provider: Provider
}

function ArenaModelSelector({ side }: { side: 'left' | 'right' }) {
  const { providers, models } = useProvidersStore()
  const favoriteModelIds = useSettingsStore((s) => s.favoriteModelIds) ?? []
  const hasFavs = favoriteModelIds.length > 0

  const setLeftModel = useArenaStore((s) => s.setLeftModel)
  const setRightModel = useArenaStore((s) => s.setRightModel)
  const leftProviderId = useArenaStore((s) => s.leftProviderId)
  const leftModelId = useArenaStore((s) => s.leftModelId)
  const rightProviderId = useArenaStore((s) => s.rightProviderId)
  const rightModelId = useArenaStore((s) => s.rightModelId)
  const isStreaming = useArenaStore((s) => s.isStreaming)

  const selectedProviderId = side === 'left' ? leftProviderId : rightProviderId
  const selectedModelId = side === 'left' ? leftModelId : rightModelId
  const setModel = side === 'left' ? setLeftModel : setRightModel

  const textModels = useMemo(() => {
    const providerMap = new Map<string, Provider>()
    for (const p of providers) {
      if (p.isEnabled) providerMap.set(p.id, p)
    }
    const result: FlatModel[] = []
    for (const model of models) {
      const provider = providerMap.get(model.providerId)
      if (!provider) continue
      if (model.type === 'image') continue
      if (hasFavs && !favoriteModelIds.includes(model.id)) continue
      result.push({ model, provider })
    }
    return result
  }, [providers, models, favoriteModelIds, hasFavs])

  const selectedValue = selectedProviderId && selectedModelId
    ? `${selectedProviderId}::${selectedModelId}`
    : undefined

  const selectedModel = models.find((m) => m.id === selectedModelId)

  return (
    <Select
      value={selectedValue}
      onValueChange={(composite) => {
        const [providerId, modelId] = composite.split('::')
        if (providerId && modelId) setModel(providerId, modelId)
      }}
      disabled={isStreaming}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          'h-8 w-full gap-1.5 rounded-lg border-border/50 px-3',
          'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
          'transition-all duration-200',
          side === 'left' ? 'text-primary' : 'text-green-400'
        )}
      >
        {selectedProviderId && (
          <ProviderIcon providerId={selectedProviderId} size={13} />
        )}
        <SelectValue placeholder={side === 'left' ? 'Modele gauche...' : 'Modele droit...'}>
          {selectedModel ? (
            <span className="truncate text-xs font-medium">{selectedModel.displayName}</span>
          ) : (
            <span className="text-xs">{side === 'left' ? 'Modele gauche...' : 'Modele droit...'}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="bottom" align="start" sideOffset={4} className="min-w-[240px] max-w-[300px]">
        <SelectGroup>
          <SelectLabel className="flex items-center gap-2 px-2 py-1.5">
            <MessageSquare className="size-3.5 text-muted-foreground/60" />
            <span className="font-semibold tracking-tight">Modeles texte</span>
          </SelectLabel>
          {textModels.map(({ model, provider }) => (
            <SelectItem
              key={`${provider.id}::${model.id}`}
              value={`${provider.id}::${model.id}`}
              disabled={!provider.isConfigured || (provider.type === 'local' && provider.isOnline === false)}
              className="pl-5"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon providerId={provider.id} size={13} />
                <span className="truncate">{model.displayName}</span>
              </span>
            </SelectItem>
          ))}
          {textModels.length === 0 && (
            <div className="px-4 py-3 text-center text-xs text-muted-foreground">
              Aucun modele disponible
            </div>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function MessageBubble({ message, isUser }: { message: { content: string; reasoning?: string }; isUser: boolean }) {
  if (isUser) {
    return (
      <div className="mx-4 my-2 rounded-lg bg-muted/50 px-4 py-2.5">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
    )
  }
  return (
    <div className="mx-2 my-2 px-2">
      {message.reasoning && (
        <details className="mb-2">
          <summary className="cursor-pointer text-xs text-muted-foreground/60 hover:text-muted-foreground">
            Raisonnement
          </summary>
          <div className="mt-1 rounded border border-border/30 bg-muted/20 p-2 text-xs text-muted-foreground/80 whitespace-pre-wrap">
            {message.reasoning}
          </div>
        </details>
      )}
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
        <MarkdownRenderer content={message.content} />
      </div>
    </div>
  )
}

function StreamingIndicator({ message }: { message: ArenaMessage }) {
  if (!message.isStreaming) return null

  if (message.streamPhase === 'processing') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        <span>Traitement...</span>
      </div>
    )
  }
  if (message.streamPhase === 'reasoning') {
    return (
      <div className="flex items-center gap-2 px-4 py-1 text-xs text-muted-foreground/60">
        <Loader2 className="size-3 animate-spin" />
        <span>Raisonnement en cours...</span>
      </div>
    )
  }
  return null
}

export function ArenaColumn({ side }: ArenaColumnProps): React.JSX.Element {
  const rounds = useArenaStore((s) => s.rounds)
  const currentUserContent = useArenaStore((s) => s.currentUserContent)
  const leftMessage = useArenaStore((s) => s.leftMessage)
  const rightMessage = useArenaStore((s) => s.rightMessage)
  const vote = useArenaStore((s) => s.vote)

  const message = side === 'left' ? leftMessage : rightMessage
  const otherMessage = side === 'left' ? rightMessage : leftMessage
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll during streaming
  useEffect(() => {
    if (message?.isStreaming && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
      })
    }
  }, [message?.content, message?.reasoning, message?.isStreaming])

  return (
    <div className={cn(
      'flex flex-1 flex-col min-w-0 min-h-0 rounded-lg border',
      'border-border/40 bg-background/50',
      vote === side && 'ring-2 ring-amber-400/60',
      side === 'left' ? 'border-l-primary/30' : 'border-r-green-500/30'
    )}>
      {/* Model selector */}
      <div className="shrink-0 border-b border-border/30 p-2">
        <ArenaModelSelector side={side} />
      </div>

      {/* Messages scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* Previous rounds */}
        {rounds.map((round, i) => {
          const roundMsg = side === 'left' ? round.leftMessage : round.rightMessage
          return (
            <div key={i}>
              <MessageBubble message={{ content: round.userContent }} isUser />
              <MessageBubble message={roundMsg} isUser={false} />
            </div>
          )
        })}

        {/* Current round */}
        {currentUserContent && (
          <MessageBubble message={{ content: currentUserContent }} isUser />
        )}
        {message && (
          <>
            <StreamingIndicator message={message} />
            {message.content && (
              <MessageBubble message={message} isUser={false} />
            )}
            {message.error && (
              <div className="mx-4 my-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                {message.error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Metrics bar */}
      <ArenaMetrics message={message} otherMessage={otherMessage} side={side} />
    </div>
  )
}
