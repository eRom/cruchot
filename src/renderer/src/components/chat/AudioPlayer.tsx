import { useCallback } from 'react'
import { Volume2, Pause, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import { cn } from '@/lib/utils'

export interface AudioPlayerProps {
  /** Text content to read aloud */
  text: string
  /** Message ID for cloud TTS caching */
  messageId?: string
  /** Compact mode — hides the speed slider (default: false) */
  compact?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Play/pause button to read a message aloud using TTS.
 *
 * In default mode, also shows a speed slider.
 * In compact mode, only shows the play/pause/stop button.
 * Designed to integrate in a message's metadata area.
 */
export function AudioPlayer({ text, messageId, compact = false, className }: AudioPlayerProps) {
  const { isPlaying, isAvailable, state, play, pause, resume, stop, rate, setRate } =
    useAudioPlayer({ messageId })

  const handlePlayPause = useCallback(() => {
    switch (state) {
      case 'idle':
        play(text)
        break
      case 'playing':
        pause()
        break
      case 'paused':
        resume()
        break
    }
  }, [state, text, play, pause, resume])

  if (!isAvailable) return null

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="group"
      aria-label="Audio player"
    >
      {/* Play / Pause button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePlayPause}
            className={cn(
              'size-7 rounded-full',
              'text-muted-foreground hover:text-foreground',
              'transition-all duration-200',
              isPlaying && 'text-primary'
            )}
            aria-label={
              state === 'playing'
                ? 'Pause reading'
                : state === 'paused'
                  ? 'Resume reading'
                  : 'Read aloud'
            }
          >
            {state === 'playing' ? (
              <Pause className="size-3.5" />
            ) : (
              <Volume2 className="size-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {state === 'playing'
            ? 'Mettre en pause'
            : state === 'paused'
              ? 'Reprendre la lecture'
              : 'Lire a voix haute'}
        </TooltipContent>
      </Tooltip>

      {/* Stop button — only visible when playing or paused */}
      {(state === 'playing' || state === 'paused') && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={stop}
              className={cn(
                'size-7 rounded-full',
                'text-muted-foreground hover:text-destructive',
                'transition-all duration-200'
              )}
              aria-label="Stop reading"
            >
              <Square className="size-3 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Arreter</TooltipContent>
        </Tooltip>
      )}

      {/* Speed slider — only in non-compact mode and when playing */}
      {!compact && (state === 'playing' || state === 'paused') && (
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className={cn(
              'h-1 w-16 cursor-pointer appearance-none rounded-full',
              'bg-border accent-primary',
              '[&::-webkit-slider-thumb]:size-3',
              '[&::-webkit-slider-thumb]:appearance-none',
              '[&::-webkit-slider-thumb]:rounded-full',
              '[&::-webkit-slider-thumb]:bg-primary'
            )}
            aria-label={`Speech rate: ${rate.toFixed(1)}x`}
          />
          <span className="text-[10px] text-muted-foreground/60 tabular-nums w-7">
            {rate.toFixed(1)}x
          </span>
        </div>
      )}
    </div>
  )
}
