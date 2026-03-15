import React from 'react'
import { ChevronLeft, ChevronRight, Equal, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useArenaStore } from '@/stores/arena.store'
import { useProvidersStore } from '@/stores/providers.store'
import { cn } from '@/lib/utils'

export function VoteBar(): React.JSX.Element | null {
  const leftMessage = useArenaStore((s) => s.leftMessage)
  const rightMessage = useArenaStore((s) => s.rightMessage)
  const vote = useArenaStore((s) => s.vote)
  const setVote = useArenaStore((s) => s.setVote)
  const currentMatchId = useArenaStore((s) => s.currentMatchId)
  const leftModelId = useArenaStore((s) => s.leftModelId)
  const rightModelId = useArenaStore((s) => s.rightModelId)
  const isStreaming = useArenaStore((s) => s.isStreaming)
  const archiveCurrentRound = useArenaStore((s) => s.archiveCurrentRound)

  const models = useProvidersStore((s) => s.models)
  const leftModel = models.find((m) => m.id === leftModelId)
  const rightModel = models.find((m) => m.id === rightModelId)

  const bothFinished = leftMessage != null && rightMessage != null
    && !leftMessage.isStreaming && !rightMessage.isStreaming
  const showVoteButtons = bothFinished && !vote && !isStreaming

  const handleVote = async (v: 'left' | 'right' | 'tie') => {
    if (!currentMatchId) return
    setVote(v)
    try {
      await window.api.arenaVote({ matchId: currentMatchId, vote: v })
    } catch (err) {
      console.error('[Arena] Vote failed:', err)
    }
  }

  // After voting, show result and allow archiving
  if (vote && bothFinished) {
    return (
      <div className="flex items-center justify-center gap-3 border-t border-border/50 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-green-500" />
          <span>
            {vote === 'left' && `${leftModel?.displayName ?? 'Gauche'} gagne`}
            {vote === 'right' && `${rightModel?.displayName ?? 'Droite'} gagne`}
            {vote === 'tie' && 'Egalite'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={archiveCurrentRound}
        >
          Continuer
        </Button>
      </div>
    )
  }

  if (!showVoteButtons) return null

  return (
    <div className="flex items-center justify-center gap-3 border-t border-border/50 px-4 py-2.5">
      <Button
        variant="outline"
        size="sm"
        className={cn(
          'gap-1.5 transition-colors',
          'hover:border-blue-500 hover:text-blue-500'
        )}
        onClick={() => handleVote('left')}
      >
        <ChevronLeft className="size-4" />
        <span className="max-w-[120px] truncate text-xs">
          {leftModel?.displayName ?? 'Gauche'}
        </span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          'gap-1.5 transition-colors',
          'hover:border-yellow-500 hover:text-yellow-500'
        )}
        onClick={() => handleVote('tie')}
      >
        <Equal className="size-4" />
        <span className="text-xs">Egalite</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          'gap-1.5 transition-colors',
          'hover:border-green-500 hover:text-green-500'
        )}
        onClick={() => handleVote('right')}
      >
        <span className="max-w-[120px] truncate text-xs">
          {rightModel?.displayName ?? 'Droite'}
        </span>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
