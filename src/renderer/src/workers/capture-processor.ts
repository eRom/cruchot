/**
 * AudioWorklet processor for capturing microphone audio.
 * Converts Float32 samples to PCM 16-bit mono and outputs as base64 chunks.
 * Runs at native sample rate — resampling to 16kHz done via AudioContext constraint.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array[] = []
  private bufferLength = 0
  // Send chunks every ~100ms at 16kHz = 1600 samples
  private readonly CHUNK_SIZE = 1600

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (!input) return true

    this.buffer.push(new Float32Array(input))
    this.bufferLength += input.length

    if (this.bufferLength >= this.CHUNK_SIZE) {
      this.flush()
    }

    return true
  }

  private flush() {
    // Concatenate buffer
    const combined = new Float32Array(this.bufferLength)
    let offset = 0
    for (const chunk of this.buffer) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    this.buffer = []
    this.bufferLength = 0

    // Convert Float32 [-1, 1] to Int16 PCM
    const pcm = new Int16Array(combined.length)
    for (let i = 0; i < combined.length; i++) {
      const s = Math.max(-1, Math.min(1, combined[i]))
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    // Send raw PCM bytes — base64 encoding done on main thread
    // (btoa/atob not available in AudioWorklet scope)
    const buffer = pcm.buffer.slice(0)
    this.port.postMessage({ type: 'audio', buffer }, [buffer])
  }
}

registerProcessor('capture-processor', CaptureProcessor)
