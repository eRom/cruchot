import WebSocket from 'ws'
import type {
  LivePlugin,
  LivePluginConfig,
  LiveCommandResult,
  LiveStatus,
  PluginToolDeclaration,
} from '../../live-plugin.interface'
import { convertToolsToOpenAI, OPENAI_PLUGIN_TOOLS } from './openai-live-tools'

// Audio resampling 16kHz -> 24kHz
// App captures at 16kHz, OpenAI expects 24kHz.
// Linear interpolation ratio 1.5 (24000/16000).
function resample16to24(base64: string): string {
  const raw = Buffer.from(base64, 'base64')
  const samples16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
  const ratio = 24000 / 16000 // 1.5
  const outLength = Math.ceil(samples16.length * ratio)
  const samples24 = new Int16Array(outLength)

  for (let i = 0; i < outLength; i++) {
    const srcPos = i / ratio
    const srcIndex = Math.floor(srcPos)
    const frac = srcPos - srcIndex
    const s0 = samples16[Math.min(srcIndex, samples16.length - 1)]
    const s1 = samples16[Math.min(srcIndex + 1, samples16.length - 1)]
    samples24[i] = Math.round(s0 + frac * (s1 - s0))
  }

  return Buffer.from(samples24.buffer).toString('base64')
}

class OpenAILivePlugin implements LivePlugin {
  readonly providerId = 'openai'
  readonly displayName = 'OpenAI Realtime'

  private ws: WebSocket | null = null

  // Callbacks — injected by Engine before connect()
  onAudio: (base64: string) => void = () => {}
  onToolCall: (id: string, name: string, args: Record<string, unknown>) => void = () => {}
  onStatusChange: (status: LiveStatus) => void = () => {}
  onTranscript: (role: 'user' | 'assistant', text: string) => void = () => {}
  onError: (error: string) => void = () => {}

  async connect(config: LivePluginConfig): Promise<void> {
    const model = 'gpt-realtime'
    const url = `wss://api.openai.com/v1/realtime?model=${model}`

    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      })

      this.ws.on('open', () => {
        console.log('[OpenAIPlugin] WebSocket connected')
        this.onStatusChange('connected')

        const tools = convertToolsToOpenAI(config.coreTools, this.getPluginTools())
        const finalPrompt = this.buildFinalPrompt(config.systemPrompt)

        this.send({
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            instructions: finalPrompt,
            voice: config.voice ?? 'ash',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'gpt-4o-transcribe' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
            tools,
          },
        })

        resolve()
      })

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString())
          this.handleMessage(event)
        } catch (err) {
          console.error('[OpenAIPlugin] Failed to parse message:', err)
        }
      })

      this.ws.on('error', (err: Error) => {
        console.error('[OpenAIPlugin] WebSocket error:', err.message)
        this.onError(err.message)
        reject(err)
      })

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[OpenAIPlugin] WebSocket closed (${code}: ${reason.toString()})`)
        this.ws = null
        this.onStatusChange('dormant')
      })
    })
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close(1000, 'Client disconnect')
        }
      } catch { /* ignore */ }
      this.ws = null
    }
  }

  sendAudio(base64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const resampled = resample16to24(base64)
    this.send({
      type: 'input_audio_buffer.append',
      audio: resampled,
    })
  }

  sendToolResponse(id: string, name: string, result: LiveCommandResult): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: id,
        output: JSON.stringify(result),
      },
    })

    // OBLIGATOIRE: OpenAI ne repond pas automatiquement apres un tool output
    this.send({ type: 'response.create' })

    console.log(`[OpenAIPlugin] Tool response sent for ${name} (${id})`)
  }

  supportsScreenShare(): boolean {
    return false
  }

  buildFinalPrompt(corePrompt: string): string {
    return corePrompt
  }

  getPluginTools(): PluginToolDeclaration[] {
    return OPENAI_PLUGIN_TOOLS
  }

  private handleMessage(event: Record<string, unknown>): void {
    const type = event.type as string

    switch (type) {
      case 'response.output_audio.delta': {
        const delta = event.delta as string
        if (delta) {
          this.onAudio(delta)
          this.onStatusChange('speaking')
        }
        break
      }

      case 'input_audio_buffer.speech_started': {
        console.log('[OpenAIPlugin] User interrupted (speech_started)')
        this.send({ type: 'response.cancel' })
        this.send({ type: 'input_audio_buffer.clear' })
        this.onStatusChange('interrupted' as LiveStatus)
        break
      }

      case 'response.function_call_arguments.done': {
        const callId = event.call_id as string
        const name = event.name as string
        const argsStr = (event.arguments as string) || '{}'
        try {
          const args = JSON.parse(argsStr)
          console.log(`[OpenAIPlugin] Tool call: ${name}`, JSON.stringify(args))
          this.onToolCall(callId, name, args)
        } catch (err) {
          console.error(`[OpenAIPlugin] Failed to parse tool args for ${name}:`, err)
          this.onError(`Invalid tool call arguments for ${name}`)
        }
        break
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = event.transcript as string
        if (transcript?.trim()) {
          this.onTranscript('user', transcript.trim())
        }
        break
      }
      case 'response.output_audio_transcript.done': {
        const transcript = event.transcript as string
        if (transcript?.trim()) {
          this.onTranscript('assistant', transcript.trim())
        }
        break
      }

      case 'response.done': {
        this.onStatusChange('connected')
        break
      }

      case 'session.created':
      case 'session.updated': {
        console.log(`[OpenAIPlugin] ${type}`)
        break
      }

      case 'error': {
        const error = event.error as Record<string, unknown> | undefined
        const message = (error?.message as string) || 'Unknown OpenAI error'
        const code = error?.code as string | undefined
        console.error(`[OpenAIPlugin] Error [${code}]: ${message}`)
        this.onError(message)
        break
      }

      case 'response.created':
      case 'response.output_item.added':
      case 'response.output_item.done':
      case 'response.output_audio.done':
      case 'response.output_audio_transcript.delta':
      case 'response.function_call_arguments.delta':
      case 'conversation.item.created':
      case 'conversation.item.input_audio_transcription.delta':
      case 'input_audio_buffer.speech_stopped':
      case 'input_audio_buffer.committed':
      case 'rate_limits.updated':
        break

      default:
        console.log(`[OpenAIPlugin] Unhandled event: ${type}`)
    }
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(payload))
  }
}

export const openaiLivePlugin = new OpenAILivePlugin()
