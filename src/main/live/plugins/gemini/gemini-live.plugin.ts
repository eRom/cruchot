import type { LivePlugin, LivePluginConfig, LiveCommandResult, LiveStatus, PluginToolDeclaration, CoreToolDeclaration, VoiceOption } from '../../live-plugin.interface'
import { GEMINI_PLUGIN_TOOLS } from './gemini-live-tools'

const GEMINI_VOICES: VoiceOption[] = [
  { id: 'Aoede', name: 'Aoede', description: 'Melodieuse et poetique, inspiree de la muse grecque' },
  { id: 'Puck', name: 'Puck', description: 'Energique et ludique, ideale pour interactions dynamiques' },
  { id: 'Charon', name: 'Charon', description: 'Grave et serieuse, ton profond pour sujets formels' },
  { id: 'Kore', name: 'Kore', description: 'Douce et feminine, naturelle pour conversations fluides' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Puissante et intense, presence marquee' },
  { id: 'Leda', name: 'Leda', description: 'Claire et engageante, polyvalente' },
  { id: 'Orus', name: 'Orus', description: 'Neutre et professionnelle, adaptee aux agents vocaux' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Legere et aerienne, fluide pour dialogues naturels' },
]

const SCREEN_SHARE_PROMPT = `
### Partage d'écran (request_screenshot, pause_screen_share)
- Tu recois en temps reel les frames de l'ecran partage par l'utilisateur
- Utilise request_screenshot pour capturer un screenshot haute qualite quand tu as besoin de details
- Tu peux arreter le partage (pause_screen_share) si l'utilisateur le demande ou si du contenu sensible apparait
- Pour des raisons de securite, tu ne peux PAS reprendre un partage arrete : l'utilisateur doit re-partager manuellement via l'UI
- Quand l'ecran est partage, commente ce que tu vois et reponds aux questions sur le contenu`

function convertToolsToGemini(coreTools: CoreToolDeclaration[], pluginTools: PluginToolDeclaration[]): any[] {
  const { Type } = require('@google/genai')
  const allTools = [...coreTools, ...pluginTools]
  return allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, param]) => [key, {
          type: param.type === 'string' ? Type.STRING : param.type === 'number' ? Type.NUMBER : Type.BOOLEAN,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        }])
      ),
      required: tool.required ?? [],
    },
  }))
}

class GeminiLivePlugin implements LivePlugin {
  readonly providerId = 'gemini'
  readonly displayName = 'Gemini Live'

  private ai: any = null
  private session: any = null
  private isScreenSharingActive = false

  // Callbacks — injected by Engine
  onAudio: (base64: string) => void = () => {}
  onToolCall: (id: string, name: string, args: Record<string, unknown>) => void = () => {}
  onStatusChange: (status: LiveStatus) => void = () => {}
  onTranscript: (role: 'user' | 'assistant', text: string) => void = () => {}
  onError: (error: string) => void = () => {}

  async connect(config: LivePluginConfig): Promise<void> {
    const { GoogleGenAI, Modality } = await import('@google/genai')

    this.ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { apiVersion: 'v1alpha' } })

    const finalPrompt = this.buildFinalPrompt(config.systemPrompt)
    const geminiTools = convertToolsToGemini(config.coreTools, this.getPluginTools())

    console.log('[GeminiPlugin] Connecting to Gemini Live (v1alpha)...')
    this.session = await this.ai.live.connect({
      model: 'gemini-3.1-flash-live-preview',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: { parts: [{ text: finalPrompt }] },
        tools: [{ functionDeclarations: geminiTools }, { googleSearch: {} }],
        thinkingConfig: {
          thinkingLevel: config.thinkingLevel ?? 'low',
          includeThoughts: false,
        },
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice ?? 'Aoede' } }
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            prefixPaddingMs: 500,
            silenceDurationMs: 500,
          },
        },
      } as Record<string, unknown>,
      callbacks: {
        onopen: () => {
          console.log('[GeminiPlugin] Connected!')
          this.onStatusChange('connected')
        },
        onmessage: (message: any) => this.handleMessage(message),
        onerror: (error: any) => {
          console.error('[GeminiPlugin] Error:', error?.message || error)
          this.onError(error?.message || String(error))
        },
        onclose: () => {
          console.log('[GeminiPlugin] Connection closed')
          this.session = null
          this.onStatusChange('dormant')
        },
      }
    })
    console.log('[GeminiPlugin] Session created')
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      try { this.session.close() } catch { /* ignore */ }
      this.session = null
    }
    this.ai = null
    this.isScreenSharingActive = false
  }

  sendAudio(base64: string): void {
    if (!this.session) return
    this.session.sendRealtimeInput({
      audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
    })
  }

  sendToolResponse(id: string, name: string, result: LiveCommandResult): void {
    if (!this.session) return
    const response: Record<string, unknown> = result.success
      ? { success: true, ...(result.data && typeof result.data === 'object' && !Array.isArray(result.data)
          ? result.data as Record<string, unknown>
          : { result: result.data ?? 'ok' }) }
      : { success: false, error: result.error ?? 'Unknown error' }

    try {
      this.session.sendToolResponse({
        functionResponses: [{ id, name, response }]
      })
      console.log(`[GeminiPlugin] Tool response sent for ${name} (${id})`)
    } catch (err: any) {
      console.error(`[GeminiPlugin] Tool response error for ${name}:`, err.message)
    }
  }

  supportsScreenShare(): boolean { return true }

  sendScreenFrame(base64: string): void {
    if (!this.session || !this.isScreenSharingActive) return
    this.session.sendRealtimeInput({
      video: { data: base64, mimeType: 'image/jpeg' }
    })
  }

  setScreenSharing(active: boolean): void {
    this.isScreenSharingActive = active
    console.log(`[GeminiPlugin] Screen sharing: ${active ? 'ON' : 'OFF'}`)
  }

  getScreenSharing(): boolean {
    return this.isScreenSharingActive
  }

  requestScreenshot(): void {
    // Handled by Engine — it sends IPC to renderer
  }

  buildFinalPrompt(corePrompt: string): string {
    return corePrompt + SCREEN_SHARE_PROMPT
  }

  getPluginTools(): PluginToolDeclaration[] {
    return GEMINI_PLUGIN_TOOLS
  }

  getAvailableVoices(): VoiceOption[] {
    return GEMINI_VOICES
  }

  private handleMessage(message: any) {
    const content = message.serverContent

    // Audio response — use message.data getter (concatenates all inlineData parts)
    const audioData = message.data as string | undefined
    if (audioData) {
      this.onAudio(audioData)
      this.onStatusChange('speaking')
    }

    // Tool calls
    if (message.toolCall?.functionCalls) {
      for (const fc of message.toolCall.functionCalls) {
        const id = fc.id || `tool_${Date.now()}`

        // Plugin tools — handle internally
        if (fc.name === 'request_screenshot') {
          console.log('[GeminiPlugin] request_screenshot')
          const resp = this.isScreenSharingActive
            ? { success: true, message: 'Screenshot capture' }
            : { success: false, error: 'Aucun partage actif' }
          this.sendToolResponse(id, fc.name, resp as LiveCommandResult)
          if (this.isScreenSharingActive) this.onToolCall(id, '_plugin:request_screenshot', {})
          continue
        }

        if (fc.name === 'pause_screen_share') {
          console.log('[GeminiPlugin] pause_screen_share')
          this.setScreenSharing(false)
          this.sendToolResponse(id, fc.name, {
            success: true,
            message: "Partage arrete. L'utilisateur doit re-selectionner une source via l'UI pour partager a nouveau."
          } as LiveCommandResult)
          this.onToolCall(id, '_plugin:screen_sharing_changed', { active: false })
          continue
        }

        // SECURITY: resume_screen_share has been removed (S65 audit). A
        // prompt-injected LLM (e.g. via Google Search results) could otherwise
        // silently re-capture sensitive content the user thought was private
        // during pause. Resuming requires explicit user action via the UI.
        if (fc.name === 'resume_screen_share') {
          console.log('[GeminiPlugin] resume_screen_share rejected (security)')
          this.sendToolResponse(id, fc.name, {
            success: false,
            error: "L'utilisateur doit re-partager manuellement via l'UI."
          } as LiveCommandResult)
          continue
        }

        // Core tools — delegate to Engine
        console.log('[GeminiPlugin] Tool call:', fc.name, JSON.stringify(fc.args))
        this.onToolCall(id, fc.name, fc.args || {})
      }
    }

    // Transcriptions
    if ((content as any)?.inputTranscription?.text) {
      this.onTranscript('user', (content as any).inputTranscription.text)
    }
    if ((content as any)?.outputTranscription?.text) {
      this.onTranscript('assistant', (content as any).outputTranscription.text)
    }

    // Turn complete
    if (content?.turnComplete) {
      this.onStatusChange('connected')
    }

    // Interrupted by user
    if (content?.interrupted) {
      this.onStatusChange('interrupted')
    }
  }
}

export const geminiLivePlugin = new GeminiLivePlugin()
