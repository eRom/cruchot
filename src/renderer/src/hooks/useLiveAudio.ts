import { useRef, useCallback, useEffect } from 'react'
import { useLiveStore } from '@/stores/live.store'

const INPUT_RATE = 24000

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

function decodeAndResample(base64: string, outputRate: number): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const pcm16 = new Int16Array(bytes.buffer)
  const floats = new Float32Array(pcm16.length)
  for (let i = 0; i < pcm16.length; i++) {
    floats[i] = pcm16[i] / 32768.0
  }
  return resample(floats, INPUT_RATE, outputRate)
}

export function useLiveAudio() {
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
      console.log('[Live] Starting audio pipeline...')

      const ctx = new AudioContext({ sampleRate: 16000 })
      await ctx.resume()
      audioContextRef.current = ctx
      const captureUrl = new URL('../workers/capture-processor.ts', import.meta.url)
      await ctx.audioWorklet.addModule(captureUrl)

      const playbackCtx = new AudioContext()
      await playbackCtx.resume()
      playbackCtxRef.current = playbackCtx
      const playbackUrl = new URL('../workers/playback-processor.ts', import.meta.url)
      await playbackCtx.audioWorklet.addModule(playbackUrl)

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
          window.api.liveSendAudio(btoa(binary))
        }
      }

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      source.connect(analyser)
      analyser.connect(captureNode)

      const playbackNode = new AudioWorkletNode(playbackCtx, 'playback-processor', {
        outputChannelCount: [1]
      })
      playbackNodeRef.current = playbackNode
      playbackNode.connect(playbackCtx.destination)

      playbackNode.port.onmessage = (event) => {
        const msg = event.data
        if (msg.type === 'started') {
          useLiveStore.getState().setPlaybackActive(true)
          window.api.liveSetPlaybackActive(true)
        } else if (msg.type === 'ended') {
          useLiveStore.getState().setPlaybackActive(false)
          useLiveStore.getState().setSpeakerLevel(0)
          window.api.liveSetPlaybackActive(false)
        } else if (msg.type === 'level') {
          useLiveStore.getState().setSpeakerLevel(msg.level)
        }
      }

      window.api.offLiveAudio()
      window.api.onLiveAudio((base64: string) => {
        const resampled = decodeAndResample(base64, playbackCtx.sampleRate)
        playbackNode.port.postMessage(
          { type: 'chunk', data: resampled },
          [resampled.buffer]
        )
      })

      window.api.offLiveClearPlayback()
      window.api.onLiveClearPlayback(() => {
        console.log('[LiveAudio] Interrupt (IPC)')
        playbackNode.port.postMessage({ type: 'interrupt' })
      })

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
        useLiveStore.getState().setMicLevel(Math.min(1, rms * 3))
        animFrameRef.current = requestAnimationFrame(updateMicLevel)
      }
      updateMicLevel()

      console.log('[Live] Audio pipeline ready (playback buffer: 10s)')
    } catch (err) {
      console.error('[Live] Audio pipeline failed:', err)
    }
  }, [])

  const stopAudio = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    window.api.offLiveAudio()
    window.api.offLiveClearPlayback()

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

    useLiveStore.getState().setMicLevel(0)
    useLiveStore.getState().setSpeakerLevel(0)
    useLiveStore.getState().setPlaybackActive(false)
  }, [])

  useEffect(() => {
    return () => stopAudio()
  }, [stopAudio])

  return { startAudio, stopAudio }
}
