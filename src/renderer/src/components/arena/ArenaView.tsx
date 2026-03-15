import React, { useCallback } from 'react'
import { Swords, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ArenaColumn } from './ArenaColumn'
import { VsSeparator } from './VsSeparator'
import { VoteBar } from './VoteBar'
import { ArenaInputZone } from './ArenaInputZone'
import { useArenaStreaming } from '@/hooks/useArenaStreaming'
import { useArenaStore } from '@/stores/arena.store'

export function ArenaView(): React.JSX.Element {
  useArenaStreaming()

  const isStreaming = useArenaStore((s) => s.isStreaming)
  const leftMessage = useArenaStore((s) => s.leftMessage)
  const rightMessage = useArenaStore((s) => s.rightMessage)
  const vote = useArenaStore((s) => s.vote)
  const rounds = useArenaStore((s) => s.rounds)
  const reset = useArenaStore((s) => s.reset)

  const bothFinished = leftMessage != null && rightMessage != null
    && !leftMessage.isStreaming && !rightMessage.isStreaming
  const hasVoted = vote != null

  const handleNewMatch = useCallback(() => {
    reset()
  }, [reset])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-2.5">
          <Swords className="size-5 text-red-500" />
          <h1 className="text-sm font-semibold">Arena</h1>
          {rounds.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {rounds.length} round{rounds.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={handleNewMatch}>
              <RotateCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Nouveau match</TooltipContent>
        </Tooltip>
      </div>

      {/* Main area — two columns + VS separator */}
      <div className="flex flex-1 min-h-0 gap-0 p-3">
        <ArenaColumn side="left" />
        <VsSeparator
          isStreaming={isStreaming}
          bothFinished={bothFinished}
          hasVoted={hasVoted}
        />
        <ArenaColumn side="right" />
      </div>

      {/* Vote bar */}
      <VoteBar />

      {/* Input zone */}
      <ArenaInputZone />
    </div>
  )
}
