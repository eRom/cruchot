/**
 * AudioWorklet processor for Gemini Live audio playback.
 * Receives resampled Float32 chunks from main thread (already 48kHz).
 * Uses a ring buffer with proper overflow protection.
 *
 * Messages main thread → worklet:
 *   { type: 'chunk', data: Float32Array }  — resampled audio chunk
 *   { type: 'interrupt' }                  — flush buffer immediately
 *
 * Messages worklet → main thread:
 *   { type: 'started' }  — first chunk written (playback begins)
 *   { type: 'ended' }    — buffer drained (~500ms silence) or interrupt
 *   { type: 'level', level: number }  — buffer level for waveform (0-1)
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array
  private bufferSize: number
  private writeIndex = 0
  private readIndex = 0
  private samplesAvailable = 0

  private isOutputting = false
  private emptyCount = 0
  // ~500ms of silence before signaling "ended": 188 process() calls @ 128 samples
  private readonly emptyThreshold = 188

  constructor() {
    super()
    // 10 seconds ring buffer @ sampleRate (matches Trinity)
    this.bufferSize = sampleRate * 10
    this.buffer = new Float32Array(this.bufferSize)

    this.port.onmessage = (event) => {
      if (event.data.type === 'chunk') {
        this.writeChunk(event.data.data as Float32Array)
      } else if (event.data.type === 'interrupt') {
        this.interrupt()
      }
    }
  }

  private writeChunk(float32Data: Float32Array) {
    const len = float32Data.length

    for (let i = 0; i < len; i++) {
      // If buffer full, drop oldest sample
      if (this.samplesAvailable >= this.bufferSize) {
        this.readIndex = (this.readIndex + 1) % this.bufferSize
        this.samplesAvailable--
      }

      this.buffer[this.writeIndex] = float32Data[i]
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize
      this.samplesAvailable++
    }

    this.emptyCount = 0

    // Signal playback start on first chunk
    if (!this.isOutputting) {
      this.isOutputting = true
      this.port.postMessage({ type: 'started' })
    }
  }

  private interrupt() {
    const wasOutputting = this.isOutputting

    this.readIndex = 0
    this.writeIndex = 0
    this.samplesAvailable = 0
    this.emptyCount = 0
    this.buffer.fill(0)

    if (wasOutputting) {
      this.isOutputting = false
      this.port.postMessage({ type: 'ended' })
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]?.[0]
    if (!output) return true

    if (this.samplesAvailable > 0) {
      const toRead = Math.min(output.length, this.samplesAvailable)

      for (let i = 0; i < toRead; i++) {
        output[i] = this.buffer[this.readIndex]
        this.readIndex = (this.readIndex + 1) % this.bufferSize
      }

      // Zero-fill underrun
      for (let i = toRead; i < output.length; i++) {
        output[i] = 0
      }

      this.samplesAvailable -= toRead
      this.emptyCount = 0
    } else {
      // Silence
      for (let i = 0; i < output.length; i++) {
        output[i] = 0
      }

      if (this.isOutputting) {
        this.emptyCount++
        if (this.emptyCount >= this.emptyThreshold) {
          this.isOutputting = false
          this.emptyCount = 0
          this.port.postMessage({ type: 'ended' })
        }
      }
    }

    // Report buffer level for waveform (throttled: every 8 process() calls ≈ 21ms)
    if (this.isOutputting && this.emptyCount % 8 === 0) {
      const level = Math.min(1, this.samplesAvailable / (sampleRate * 0.5))
      this.port.postMessage({ type: 'level', level })
    }

    return true
  }
}

registerProcessor('playback-processor', PlaybackProcessor)
