import { useState, useEffect, useCallback, useRef } from 'react'

type AudioPlayerState = 'idle' | 'playing' | 'paused'

interface UseAudioPlayerReturn {
  /** Whether audio is currently playing */
  isPlaying: boolean
  /** Whether SpeechSynthesis API is available */
  isAvailable: boolean
  /** Current state of the player */
  state: AudioPlayerState
  /** Play the given text with TTS */
  play: (text: string) => void
  /** Pause the current playback */
  pause: () => void
  /** Resume paused playback */
  resume: () => void
  /** Stop and cancel playback */
  stop: () => void
  /** Current speech rate (0.5 - 2.0) */
  rate: number
  /** Set speech rate */
  setRate: (rate: number) => void
  /** Available voices for the current language */
  voices: SpeechSynthesisVoice[]
}

interface UseAudioPlayerOptions {
  /** Preferred language (default: 'fr-FR') */
  lang?: string
  /** Initial speech rate (default: 1.0) */
  initialRate?: number
}

/**
 * Checks if the SpeechSynthesis API is available.
 */
function isSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Hook for text-to-speech playback using the Web Speech API (SpeechSynthesis).
 *
 * Provides play/pause/resume/stop controls with configurable rate
 * and automatic voice selection for French and English.
 */
export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const { lang = 'fr-FR', initialRate = 1.0 } = options

  const [state, setState] = useState<AudioPlayerState>('idle')
  const [rate, setRateState] = useState(initialRate)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const available = isSynthesisAvailable()

  // Load available voices
  useEffect(() => {
    if (!available) return

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices()
      // Filter for French and English voices
      const langPrefix = lang.slice(0, 2)
      const filtered = allVoices.filter(
        (v) => v.lang.startsWith(langPrefix) || v.lang.startsWith('en')
      )
      setVoices(filtered.length > 0 ? filtered : allVoices)
    }

    loadVoices()

    // Voices may load asynchronously
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
  }, [available, lang])

  /**
   * Picks the best voice for the target language.
   */
  const pickVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    if (voices.length === 0) return undefined

    const langPrefix = lang.slice(0, 2)

    // Prefer a voice that matches the exact locale
    const exactMatch = voices.find((v) => v.lang === lang)
    if (exactMatch) return exactMatch

    // Fallback to a voice with the same language prefix
    const prefixMatch = voices.find((v) => v.lang.startsWith(langPrefix))
    if (prefixMatch) return prefixMatch

    // Last resort: first available voice
    return voices[0]
  }, [voices, lang])

  const play = useCallback(
    (text: string) => {
      if (!available) return

      // Cancel any ongoing speech
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.lang = lang

      const voice = pickVoice()
      if (voice) {
        utterance.voice = voice
      }

      utterance.onstart = () => setState('playing')
      utterance.onpause = () => setState('paused')
      utterance.onresume = () => setState('playing')
      utterance.onend = () => {
        setState('idle')
        utteranceRef.current = null
      }
      utterance.onerror = (event) => {
        // 'canceled' is expected when we call cancel/stop manually
        if (event.error === 'canceled') {
          setState('idle')
          return
        }
        console.warn('[AudioPlayer] SpeechSynthesis error:', event.error)
        setState('idle')
        utteranceRef.current = null
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    },
    [available, rate, lang, pickVoice]
  )

  const pause = useCallback(() => {
    if (!available) return
    window.speechSynthesis.pause()
  }, [available])

  const resume = useCallback(() => {
    if (!available) return
    window.speechSynthesis.resume()
  }, [available])

  const stop = useCallback(() => {
    if (!available) return
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    setState('idle')
  }, [available])

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.min(2.0, Math.max(0.5, newRate))
    setRateState(clamped)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (available) {
        window.speechSynthesis.cancel()
      }
    }
  }, [available])

  return {
    isPlaying: state === 'playing',
    isAvailable: available,
    state,
    play,
    pause,
    resume,
    stop,
    rate,
    setRate,
    voices
  }
}
