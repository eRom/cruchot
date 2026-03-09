import { useState, useEffect, useCallback, useRef } from 'react'

type VoiceInputState = 'idle' | 'listening' | 'processing' | 'error'

interface UseVoiceInputReturn {
  /** Whether the microphone is currently listening */
  isListening: boolean
  /** Whether Web Speech API is available in this runtime */
  isAvailable: boolean
  /** Current transcript (includes interim results) */
  transcript: string
  /** Final transcript (only confirmed results) */
  finalTranscript: string
  /** Current state of the voice input */
  state: VoiceInputState
  /** Start listening for speech */
  startListening: () => void
  /** Stop listening */
  stopListening: () => void
  /** Last error message, if any */
  error: string | null
}

interface UseVoiceInputOptions {
  /** Language for speech recognition (default: 'fr-FR') */
  lang?: string
  /** Whether to keep listening after a pause (default: true) */
  continuous?: boolean
  /** Whether to show interim results (default: true) */
  interimResults?: boolean
}

// Type augmentation for the Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

/**
 * Checks if the Web Speech API (SpeechRecognition) is available.
 */
function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  const win = window as unknown as Record<string, unknown>
  if (typeof win.SpeechRecognition === 'function') {
    return win.SpeechRecognition as new () => SpeechRecognitionInstance
  }
  if (typeof win.webkitSpeechRecognition === 'function') {
    return win.webkitSpeechRecognition as new () => SpeechRecognitionInstance
  }
  return null
}

/**
 * Hook for voice dictation using the Web Speech API.
 *
 * Detects API availability at runtime and provides start/stop controls
 * with interim and final transcript updates.
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { lang = 'fr-FR', continuous = true, interimResults = true } = options

  const [state, setState] = useState<VoiceInputState>('idle')
  const [transcript, setTranscript] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isAvailableRef = useRef(getSpeechRecognitionConstructor() !== null)

  const startListening = useCallback(() => {
    const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
    if (!SpeechRecognitionCtor) {
      setError('Speech recognition is not supported in this browser')
      setState('error')
      return
    }

    // Stop any existing instance
    if (recognitionRef.current) {
      recognitionRef.current.abort()
      recognitionRef.current = null
    }

    setError(null)
    setTranscript('')
    setFinalTranscript('')

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = lang
    recognition.continuous = continuous
    recognition.interimResults = interimResults

    recognition.onstart = () => {
      setState('listening')
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      setFinalTranscript(final)
      setTranscript(final + interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'aborted' is expected when we call stop/abort manually
      if (event.error === 'aborted') return

      const errorMessages: Record<string, string> = {
        'no-speech': 'No speech detected',
        'audio-capture': 'Microphone not available',
        'not-allowed': 'Microphone access denied',
        network: 'Network error during recognition',
        'service-not-allowed': 'Speech recognition service not allowed'
      }

      const message = errorMessages[event.error] || `Recognition error: ${event.error}`
      setError(message)
      setState('error')
    }

    recognition.onend = () => {
      // Only reset to idle if we're not in an error state
      setState((prev) => (prev === 'error' ? prev : 'idle'))
      recognitionRef.current = null
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start speech recognition')
      setState('error')
    }
  }, [lang, continuous, interimResults])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      setState('processing')
      recognitionRef.current.stop()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
        recognitionRef.current = null
      }
    }
  }, [])

  return {
    isListening: state === 'listening',
    isAvailable: isAvailableRef.current,
    transcript,
    finalTranscript,
    state,
    startListening,
    stopListening,
    error
  }
}
