import { useRef, useCallback, useEffect } from 'react'
import { useGeminiLiveStore } from '@/stores/gemini-live.store'

const INPUT_RATE = 24000 // Gemini output: 24kHz

/**
 * Resample Float32 from inputRate → outputRate using linear interpolation.
 * Done in the main thread (not worklet) — matches Trinity's approach.
 */
function resample(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  const ratio = outputRate / inputRate
  const outputLength = Math.floor(input.length * ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i / ratio
    const srcIndex = Math.floor(srcPos)
    const fraction = srcPos - srcIndex
    const nextIndex = Math.min(srcIndex + 1, input.length - 1)
    output[i] = input[srcIndex] * (1 - fraction) + input[nextIndex] * fraction
  }

  return output
}

/**
 * Decode base64 PCM 16-bit → Float32 → resample to outputRate.
 */
function decodeAndResample(base64: string, outputRate: number): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  // Int16 PCM → Float32
  const pcm16 = new Int16Array(bytes.buffer)
  const floats = new Float32Array(pcm16.length)
  for (let i = 0; i < pcm16.length; i++) {
    floats[i] = pcm16[i] / 32768.0
  }

  // Resample 24kHz → outputRate (typically 48kHz)
  return resample(floats, INPUT_RATE, outputRate)
}

export function useGeminiLiveAudio() {
  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const captureNodeRef = useRef<AudioWorkletNode | null>(null)
  const playbackNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)

  const startAudio = useCallback(async () => {
    if (audioContextRef.current) return

    try {
      console.log('[GeminiLive] Starting audio pipeline...')

      // Capture context at 16kHz for mic
      const ctx = new AudioContext({ sampleRate: 16000 })
      await ctx.resume()
      audioContextRef.current = ctx
      const captureUrl = new URL('../workers/capture-processor.ts', import.meta.url)
      await ctx.audioWorklet.addModule(captureUrl)

      // Playback context at native rate (48kHz typically)
      const playbackCtx = new AudioContext()
      await playbackCtx.resume()
      playbackCtxRef.current = playbackCtx
      const playbackUrl = new URL('../workers/playback-processor.ts', import.meta.url)
      await playbackCtx.audioWorklet.addModule(playbackUrl)

      // Capture: mic → worklet → IPC
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      streamRef.current = stream

      const source = ctx.createMediaStreamSource(stream)
      const captureNode = new AudioWorkletNode(ctx, 'capture-processor')
      captureNodeRef.current = captureNode

      captureNode.port.onmessage = (event) => {
        if (event.data.type === 'audio') {
          const bytes = new Uint8Array(event.data.buffer)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          window.api.geminiLiveSendAudio(btoa(binary))
        }
      }

      // Analyser for mic level
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      source.connect(analyser)
      analyser.connect(captureNode)

      // Playback: IPC → decode + resample in main thread → worklet ring buffer
      const playbackNode = new AudioWorkletNode(playbackCtx, 'playback-processor', {
        outputChannelCount: [1]
      })
      playbackNodeRef.current = playbackNode
      playbackNode.connect(playbackCtx.destination)

      // Handle worklet messages: started, ended, level
      playbackNode.port.onmessage = (event) => {
        const msg = event.data
        if (msg.type === 'started') {
          useGeminiLiveStore.getState().setPlaybackActive(true)
          window.api.geminiLiveSetPlaybackActive(true) // Tell main process
        } else if (msg.type === 'ended') {
          useGeminiLiveStore.getState().setPlaybackActive(false)
          useGeminiLiveStore.getState().setSpeakerLevel(0)
          window.api.geminiLiveSetPlaybackActive(false) // Tell main process
        } else if (msg.type === 'level') {
          useGeminiLiveStore.getState().setSpeakerLevel(msg.level)
        }
      }

      // Listen for audio from Gemini — decode + resample in main thread, send Float32 to worklet
      window.api.offGeminiLiveAudio()
      window.api.onGeminiLiveAudio((base64: string) => {
        const resampled = decodeAndResample(base64, playbackCtx.sampleRate)
        playbackNode.port.postMessage(
          { type: 'chunk', data: resampled },
          [resampled.buffer] // Transfer ownership (zero-copy)
        )
      })

      // Listen for clear-playback from main process (on interruption)
      window.api.offGeminiLiveClearPlayback()
      window.api.onGeminiLiveClearPlayback(() => {
        console.log('[GeminiLiveAudio] Interrupt (IPC)')
        playbackNode.port.postMessage({ type: 'interrupt' })
      })

      // Start mic level animation
      const updateMicLevel = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        useGeminiLiveStore.getState().setMicLevel(Math.min(1, rms * 3))
        animFrameRef.current = requestAnimationFrame(updateMicLevel)
      }
      updateMicLevel()

      console.log('[GeminiLive] Audio pipeline ready (playback buffer: 10s)')
    } catch (err) {
      console.error('[GeminiLive] Audio pipeline failed:', err)
    }
  }, [])

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    window.api.offGeminiLiveAudio()
    window.api.offGeminiLiveClearPlayback()

    if (captureNodeRef.current) {
      captureNodeRef.current.disconnect()
      captureNodeRef.current = null
    }
    if (playbackNodeRef.current) {
      playbackNodeRef.current.port.postMessage({ type: 'interrupt' })
      playbackNodeRef.current.disconnect()
      playbackNodeRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close()
      playbackCtxRef.current = null
    }

    useGeminiLiveStore.getState().setMicLevel(0)
    useGeminiLiveStore.getState().setSpeakerLevel(0)
    useGeminiLiveStore.getState().setPlaybackActive(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAudio()
  }, [stopAudio])

  return { startAudio, stopAudio }
}
