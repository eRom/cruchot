import { useRef, useCallback, useEffect } from 'react'
import { useLiveStore } from '@/stores/live.store'

const MAX_WIDTH = 1280
const MAX_HEIGHT = 720
const CAPTURE_INTERVAL_MS = 500
const DIFF_THRESHOLD = 10
const SAMPLE_GRID = 4 // 4x4 = 16 sample pixels

export function useScreenCapture() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const isCapturingRef = useRef(false)

  const stopCapture = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.remove()
      videoRef.current = null
    }
    canvasRef.current = null
    ctxRef.current = null
    prevPixelsRef.current = null
    isCapturingRef.current = false

    window.api.liveSetScreenSharing(false)
    useLiveStore.getState().setScreenSharing(false)
  }, [])

  const captureFrame = useCallback((quality: number = 0.7, useNativeRes: boolean = false) => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!video || !canvas || !ctx || video.readyState < 2) return null

    if (useNativeRes) {
      const hqCanvas = document.createElement('canvas')
      hqCanvas.width = video.videoWidth
      hqCanvas.height = video.videoHeight
      const hqCtx = hqCanvas.getContext('2d')
      if (!hqCtx) return null
      hqCtx.drawImage(video, 0, 0)
      const dataUrl = hqCanvas.toDataURL('image/jpeg', quality)
      return dataUrl.split(',')[1]
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    return dataUrl.split(',')[1]
  }, [])

  const hasChanged = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return true

    const w = canvas.width
    const h = canvas.height
    const stepX = Math.floor(w / SAMPLE_GRID)
    const stepY = Math.floor(h / SAMPLE_GRID)

    const currentPixels = new Uint8ClampedArray(SAMPLE_GRID * SAMPLE_GRID * 3)
    let idx = 0
    for (let gy = 0; gy < SAMPLE_GRID; gy++) {
      for (let gx = 0; gx < SAMPLE_GRID; gx++) {
        const px = Math.min(gx * stepX + Math.floor(stepX / 2), w - 1)
        const py = Math.min(gy * stepY + Math.floor(stepY / 2), h - 1)
        const data = ctx.getImageData(px, py, 1, 1).data
        currentPixels[idx++] = data[0]
        currentPixels[idx++] = data[1]
        currentPixels[idx++] = data[2]
      }
    }

    const prev = prevPixelsRef.current
    prevPixelsRef.current = currentPixels

    if (!prev) return true

    let totalDelta = 0
    for (let i = 0; i < currentPixels.length; i++) {
      totalDelta += Math.abs(currentPixels[i] - prev[i])
    }
    const avgDelta = totalDelta / currentPixels.length

    return avgDelta >= DIFF_THRESHOLD
  }, [])

  const startCapture = useCallback(async (sourceId: string) => {
    await window.api.liveSelectScreenSource(sourceId)

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })

    streamRef.current = stream

    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true
    await video.play()
    videoRef.current = video

    const canvas = document.createElement('canvas')
    const scale = Math.min(MAX_WIDTH / video.videoWidth, MAX_HEIGHT / video.videoHeight, 1)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvasRef.current = canvas
    ctxRef.current = canvas.getContext('2d')

    isCapturingRef.current = true
    window.api.liveSetScreenSharing(true)
    useLiveStore.getState().setScreenSharing(true)

    stream.getVideoTracks()[0].onended = () => {
      console.log('[ScreenCapture] Stream ended externally')
      stopCapture()
    }

    timerRef.current = setInterval(() => {
      if (!isCapturingRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = ctxRef.current
      if (!video || !canvas || !ctx || video.readyState < 2) return

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      if (hasChanged()) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        const base64 = dataUrl.split(',')[1]
        window.api.liveSendScreenFrame(base64)
      }
    }, CAPTURE_INTERVAL_MS)
  }, [stopCapture, hasChanged])

  // Listen for screenshot requests from main (tool: request_screenshot)
  useEffect(() => {
    window.api.offLiveRequestScreenshot()
    window.api.onLiveRequestScreenshot(() => {
      if (!isCapturingRef.current) return
      const base64 = captureFrame(0.9, true)
      if (base64) {
        window.api.liveSendScreenFrame(base64)
        console.log('[ScreenCapture] High quality screenshot sent')
      }
    })
    return () => {
      window.api.offLiveRequestScreenshot()
    }
  }, [captureFrame])

  // Listen for screen sharing status changes from main (pause/resume tools)
  useEffect(() => {
    window.api.offLiveScreenSharing()
    window.api.onLiveScreenSharing((active) => {
      useLiveStore.getState().setScreenSharing(active)
      if (!active && isCapturingRef.current) {
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        isCapturingRef.current = false
      } else if (active && streamRef.current && !isCapturingRef.current) {
        isCapturingRef.current = true
        timerRef.current = setInterval(() => {
          if (!isCapturingRef.current) return
          const video = videoRef.current
          const canvas = canvasRef.current
          const ctx = ctxRef.current
          if (!video || !canvas || !ctx || video.readyState < 2) return
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          if (hasChanged()) {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
            const base64 = dataUrl.split(',')[1]
            window.api.liveSendScreenFrame(base64)
          }
        }, CAPTURE_INTERVAL_MS)
      }
    })
    return () => {
      window.api.offLiveScreenSharing()
    }
  }, [hasChanged])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture()
    }
  }, [stopCapture])

  // Auto-stop when Gemini session disconnects
  const status = useLiveStore(s => s.status)
  useEffect(() => {
    if ((status === 'off' || status === 'error') && isCapturingRef.current) {
      stopCapture()
    }
  }, [status, stopCapture])

  return {
    startCapture,
    stopCapture,
    isCapturing: useLiveStore(s => s.isScreenSharing),
  }
}
