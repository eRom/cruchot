import { getApiKeyForProvider } from '../ipc/providers.ipc'

export type TtsProvider = 'openai' | 'google'

const TTS_CONFIG: Record<TtsProvider, { model: string; voice: string | null; endpoint?: string }> = {
  openai: {
    model: 'gpt-4o-mini-tts',
    voice: 'coral',
    endpoint: 'https://api.openai.com/v1/audio/speech'
  },
  google: {
    model: 'gemini-2.5-flash-preview-tts',
    voice: 'Aoede'
  }
}

// Pricing per character
const TTS_PRICING: Record<TtsProvider, number> = {
  openai: 0.0000024,  // $2.40/1M chars
  google: 0            // Preview gratuit
}

export function getTtsModel(provider: TtsProvider): string {
  return TTS_CONFIG[provider].model
}

export async function synthesizeSpeech(options: {
  provider: TtsProvider
  text: string
  speed?: number
}): Promise<{ audio: string; mimeType: string; cost: number }> {
  const { provider, text, speed = 1.0 } = options

  const apiKey = getApiKeyForProvider(provider)
  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`)
  }

  const truncatedText = text.slice(0, 4096)
  const cost = truncatedText.length * TTS_PRICING[provider]

  switch (provider) {
    case 'openai':
      return synthesizeOpenAI(apiKey, truncatedText, speed, cost)
    case 'google':
      return synthesizeGoogle(apiKey, truncatedText, cost)
    default:
      throw new Error(`Unknown TTS provider: ${provider}`)
  }
}

async function synthesizeOpenAI(
  apiKey: string,
  text: string,
  speed: number,
  cost: number
): Promise<{ audio: string; mimeType: string; cost: number }> {
  const config = TTS_CONFIG.openai

  const response = await fetch(config.endpoint!, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: text,
      speed,
      response_format: 'mp3'
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`OpenAI TTS error (${response.status}): ${errorText}`)
  }

  const buffer = await response.arrayBuffer()
  const audio = Buffer.from(buffer).toString('base64')

  return { audio, mimeType: 'audio/mpeg', cost }
}

/**
 * Wraps raw PCM 16-bit LE mono data in a WAV header.
 * Google Gemini TTS returns audio/L16 (PCM 16-bit, mono, 24kHz).
 */
function pcmToWav(pcmBase64: string, sampleRate: number = 24000, numChannels: number = 1, bitsPerSample: number = 16): string {
  const pcmBuffer = Buffer.from(pcmBase64, 'base64')
  const dataSize = pcmBuffer.length
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)

  // WAV header = 44 bytes
  const header = Buffer.alloc(44)

  // RIFF chunk descriptor
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4) // ChunkSize
  header.write('WAVE', 8)

  // fmt sub-chunk
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)              // SubChunk1Size (PCM)
  header.writeUInt16LE(1, 20)               // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)

  // data sub-chunk
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)

  const wavBuffer = Buffer.concat([header, pcmBuffer])
  return wavBuffer.toString('base64')
}

async function synthesizeGoogle(
  apiKey: string,
  text: string,
  cost: number
): Promise<{ audio: string; mimeType: string; cost: number }> {
  const config = TTS_CONFIG.google
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: config.voice }
          }
        }
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Google TTS error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const audioContent = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData

  if (!audioContent?.data) {
    throw new Error('Google TTS: no audio data in response')
  }

  const rawMimeType: string = audioContent.mimeType || ''

  // Google Gemini TTS returns raw PCM (audio/L16) — wrap in WAV header
  if (rawMimeType.includes('L16') || rawMimeType.includes('pcm')) {
    // Parse sample rate from mimeType: "audio/L16;codec=pcm;rate=24000"
    const rateMatch = rawMimeType.match(/rate=(\d+)/)
    const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000

    const wavBase64 = pcmToWav(audioContent.data, sampleRate)
    return { audio: wavBase64, mimeType: 'audio/wav', cost }
  }

  return {
    audio: audioContent.data,
    mimeType: rawMimeType || 'audio/mpeg',
    cost
  }
}

