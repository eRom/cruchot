import { useState, useEffect, useCallback, useRef } from 'react'
import { useSettingsStore } from '@/stores/settings.store'

type AudioPlayerState = 'idle' | 'playing' | 'paused'

interface UseAudioPlayerReturn {
  isPlaying: boolean
  isAvailable: boolean
  state: AudioPlayerState
  play: (text: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  rate: number
  setRate: (rate: number) => void
  voices: SpeechSynthesisVoice[]
}

interface UseAudioPlayerOptions {
  lang?: string
  initialRate?: number
  messageId?: string
}

// Module-level cache: "messageId:provider" → blob URL
const audioCache = new Map<string, string>()

function isSynthesisAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const { lang = 'fr-FR', initialRate = 1.0, messageId } = options

  const ttsProvider = useSettingsStore((s) => s.ttsProvider) ?? 'browser'
  const isCloudMode = ttsProvider !== 'browser'

  const [state, setState] = useState<AudioPlayerState>('idle')
  const [rate, setRateState] = useState(initialRate)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioElementRef = useRef<HTMLAudioElement | null>(null)
  const browserAvailable = isSynthesisAvailable()
  const available = isCloudMode ? true : browserAvailable

  // Load browser voices (only in browser mode)
  useEffect(() => {
    if (isCloudMode || !browserAvailable) return

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices()
      const langPrefix = lang.slice(0, 2)
      const filtered = allVoices.filter(
        (v) => v.lang.startsWith(langPrefix) || v.lang.startsWith('en')
      )
      setVoices(filtered.length > 0 ? filtered : allVoices)
    }

    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
  }, [browserAvailable, isCloudMode, lang])

  const pickVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    if (voices.length === 0) return undefined
    const langPrefix = lang.slice(0, 2)
    const exactMatch = voices.find((v) => v.lang === lang)
    if (exactMatch) return exactMatch
    const prefixMatch = voices.find((v) => v.lang.startsWith(langPrefix))
    if (prefixMatch) return prefixMatch
    return voices[0]
  }, [voices, lang])

  // ── Cloud play ────────────────────────────────────
  const playCloud = useCallback(
    async (text: string) => {
      const cacheKey = messageId ? `${messageId}:${ttsProvider}` : null

      const setupAndPlay = async (blobUrl: string) => {
        const audio = new Audio(blobUrl)
        audio.playbackRate = rate
        audioElementRef.current = audio
        audio.onplay = () => setState('playing')
        audio.onpause = () => {
          if (audio.currentTime > 0 && audio.currentTime < audio.duration) {
            setState('paused')
          }
        }
        audio.onended = () => {
          setState('idle')
          audioElementRef.current = null
        }
        audio.onerror = (e) => {
          console.error('[AudioPlayer] Audio element error:', e)
          setState('idle')
          audioElementRef.current = null
        }
        await audio.play()
      }

      // Check cache
      if (cacheKey && audioCache.has(cacheKey)) {
        setState('playing')
        await setupAndPlay(audioCache.get(cacheKey)!)
        return
      }

      // Synthesize via IPC
      setState('playing')
      let result
      try {
        result = await window.api.ttsSynthesize({
          provider: ttsProvider as 'openai' | 'google',
          text: text.slice(0, 4096),
          speed: rate,
          messageId
        })
      } catch (error) {
        console.error('[AudioPlayer] Cloud TTS IPC error:', error)
        setState('idle')
        return
      }

      console.log(`[AudioPlayer] Received audio: mimeType=${result.mimeType}, base64 length=${result.audio.length}`)

      // Decode base64 → blob → URL
      const binaryStr = atob(result.audio)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: result.mimeType })
      const blobUrl = URL.createObjectURL(blob)

      console.log(`[AudioPlayer] Created blob: size=${blob.size}, type=${blob.type}, url=${blobUrl}`)

      // Cache
      if (cacheKey) {
        const oldUrl = audioCache.get(cacheKey)
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        audioCache.set(cacheKey, blobUrl)
      }

      try {
        await setupAndPlay(blobUrl)
        console.log('[AudioPlayer] audio.play() resolved successfully')
      } catch (error) {
        console.error('[AudioPlayer] Audio playback error:', error)
        setState('idle')
      }
    },
    [ttsProvider, rate, messageId]
  )

  // ── Browser play ──────────────────────────────────
  const playBrowser = useCallback(
    (text: string) => {
      if (!browserAvailable) return

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = rate
      utterance.lang = lang

      const voice = pickVoice()
      if (voice) utterance.voice = voice

      utterance.onstart = () => setState('playing')
      utterance.onpause = () => setState('paused')
      utterance.onresume = () => setState('playing')
      utterance.onend = () => {
        setState('idle')
        utteranceRef.current = null
      }
      utterance.onerror = (event) => {
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
    [browserAvailable, rate, lang, pickVoice]
  )

  // ── Unified play ──────────────────────────────────
  const play = useCallback(
    (text: string) => {
      // Stop any current playback
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.currentTime = 0
        audioElementRef.current = null
      }
      if (browserAvailable) {
        window.speechSynthesis.cancel()
      }

      if (isCloudMode) {
        playCloud(text)
      } else {
        playBrowser(text)
      }
    },
    [isCloudMode, playCloud, playBrowser, browserAvailable]
  )

  const pause = useCallback(() => {
    if (isCloudMode && audioElementRef.current) {
      audioElementRef.current.pause()
    } else if (browserAvailable) {
      window.speechSynthesis.pause()
    }
  }, [isCloudMode, browserAvailable])

  const resume = useCallback(() => {
    if (isCloudMode && audioElementRef.current) {
      audioElementRef.current.play()
      setState('playing')
    } else if (browserAvailable) {
      window.speechSynthesis.resume()
    }
  }, [isCloudMode, browserAvailable])

  const stop = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.currentTime = 0
      audioElementRef.current = null
    }
    if (browserAvailable) {
      window.speechSynthesis.cancel()
    }
    utteranceRef.current = null
    setState('idle')
  }, [browserAvailable])

  const setRate = useCallback((newRate: number) => {
    const clamped = Math.min(2.0, Math.max(0.5, newRate))
    setRateState(clamped)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current = null
      }
      if (browserAvailable) {
        window.speechSynthesis.cancel()
      }
    }
  }, [browserAvailable])

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
