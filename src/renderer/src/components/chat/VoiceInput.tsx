import { useCallback, useEffect } from 'react'
import { Mic, MicOff, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useVoiceInput } from '@/hooks/useVoiceInput'
import { cn } from '@/lib/utils'

export interface VoiceInputProps {
  /** Called when a final transcript is available */
  onTranscript: (text: string) => void
  /** Language for speech recognition (default: 'fr-FR') */
  lang?: string
  /** Whether the button is disabled externally (e.g. during streaming) */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Microphone button component for voice dictation.
 *
 * Shows a mic icon that toggles speech recognition on/off.
 * Displays interim transcript while listening and dispatches
 * the final transcript via the onTranscript callback.
 */
export function VoiceInput({
  onTranscript,
  lang = 'fr-FR',
  disabled = false,
  className
}: VoiceInputProps) {
  const { isListening, isAvailable, transcript, finalTranscript, startListening, stopListening, error } =
    useVoiceInput({ lang })

  // When the user stops listening, send the final transcript
  const handleToggle = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  // Emit transcript when listening ends and we have a result
  useEffect(() => {
    if (!isListening && finalTranscript.trim()) {
      onTranscript(finalTranscript.trim())
    }
  }, [isListening, finalTranscript, onTranscript])

  // Not available — show disabled button with tooltip
  if (!isAvailable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled
            className={cn('size-8 rounded-full', className)}
            aria-label="Voice input not supported"
          >
            <MicOff className="size-4 text-muted-foreground/40" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Non supporte</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className={cn('relative flex items-center gap-2', className)}>
      {/* Interim transcript display */}
      {isListening && transcript && (
        <div
          className={cn(
            'absolute bottom-full left-0 mb-2 max-w-64',
            'rounded-lg border border-border/60 bg-popover px-3 py-2',
            'text-xs text-muted-foreground shadow-md',
            'animate-in fade-in-0 slide-in-from-bottom-1'
          )}
          role="status"
          aria-live="polite"
        >
          {transcript}
        </div>
      )}

      {isListening ? (
        // Stop button — visible when actively listening
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              className={cn(
                'size-8 rounded-full',
                'bg-destructive/10 text-destructive hover:bg-destructive/20',
                'transition-all duration-200',
                // Pulse animation while recording
                'animate-pulse'
              )}
              aria-label="Stop voice input"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Arreter la dictee</TooltipContent>
        </Tooltip>
      ) : (
        // Mic button — default state
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggle}
              disabled={disabled}
              className={cn(
                'size-8 rounded-full',
                'text-muted-foreground hover:text-foreground',
                'transition-all duration-200',
                error && 'text-destructive/60'
              )}
              aria-label="Start voice input"
            >
              <Mic className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {error ? error : 'Dictee vocale'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
