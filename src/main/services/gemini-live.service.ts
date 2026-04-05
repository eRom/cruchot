import { type BrowserWindow } from 'electron'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decryptApiKey, getCredentialKey } from './credential.service'
import { assembleFullPrompt } from './gemini-live-system-prompt'
import { CRUCHOT_TOOLS } from '../llm/gemini-live-tools'
import { serviceRegistry } from './registry'
import { liveMemoryService } from './live-memory.service'
import type { GeminiLiveStatus, GeminiLiveCommand, GeminiLiveCommandResult } from '../../preload/types'

class GeminiLiveService {
  private worker: UtilityProcess | null = null
  private mainWindow: BrowserWindow | null = null
  private status: GeminiLiveStatus = 'off'
  private ai: any = null
  private session: any = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000
  // Diagnostic counters
  private turnCounter = 0
  private chunkCounter = 0
  // Post-turn cooldown — prevents echo from triggering a new turn
  private postTurnCooldownUntil = 0
  private readonly POST_TURN_COOLDOWN_MS = 500
  // Playback state from renderer (worklet started/ended)
  private isPlaybackActive = false

  init(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    serviceRegistry.register('gemini-live', this)
  }

  isAvailable(): boolean {
    const db = getDatabase()
    const row = db.select().from(settings)
      .where(eq(settings.key, getCredentialKey('google'))).get()
    return !!row?.value
  }

  getStatus(): GeminiLiveStatus {
    return this.status
  }

  async connect(): Promise<void> {
    if (this.session) return

    const db = getDatabase()
    const row = db.select().from(settings)
      .where(eq(settings.key, getCredentialKey('google'))).get()
    if (!row?.value) throw new Error('No Google API key configured')

    const apiKey = decryptApiKey(row.value)
    const systemPrompt = await assembleFullPrompt()

    this.status = 'connecting'
    this.sendStatus()

    try {
      const { GoogleGenAI, Modality } = await import('@google/genai')
      // v1alpha required for extended features (transcription, proactivity, thinking)
      this.ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })

      console.log('[GeminiLive] Connecting to Gemini Live (v1alpha)...')
      this.session = await this.ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ functionDeclarations: CRUCHOT_TOOLS }, { googleSearch: {} }],
          thinkingConfig: {
            thinkingLevel: 'low',
            includeThoughts: false,
          },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
            automaticActivityDetection: {
              disabled: false,
              // Match Trinity's working config (was LOW/20/100 → caused premature turn-ends)
              startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              prefixPaddingMs: 500,
              silenceDurationMs: 500,
            },
          },
        } as Record<string, unknown>,
        callbacks: {
          onopen: () => {
            console.log('[GeminiLive] Connected!')
            this.turnCounter = 0
            liveMemoryService.startSession('gemini')
            this.chunkCounter = 0
            this.postTurnCooldownUntil = 0
            this.status = 'connected'
            this.sendStatus()
            this.resetIdleTimer()
          },
          onmessage: (message: any) => this.handleGeminiMessage(message),
          onerror: (error: any) => {
            console.error('[GeminiLive] Error:', error?.message || error)
            this.status = 'error'
            this.sendStatus(error?.message || String(error))
          },
          onclose: () => {
            console.log('[GeminiLive] Connection closed')
            this.session = null
            liveMemoryService.extractAndStore().catch(err =>
              console.error('[GeminiLive] Memory extraction failed:', err.message)
            )
            this.status = 'dormant'
            this.sendStatus()
          },
        }
      })
      console.log('[GeminiLive] Session created')
    } catch (err: any) {
      console.error('[GeminiLive] Connect failed:', err.message || err)
      this.status = 'error'
      this.sendStatus(err.message)
    }
  }

  async disconnect(): Promise<void> {
    this.clearIdleTimer()
    if (this.session) {
      try { this.session.close() } catch { /* ignore */ }
      this.session = null
    }
    this.ai = null
    liveMemoryService.extractAndStore().catch(err =>
      console.error('[GeminiLive] Memory extraction failed:', err.message)
    )
    this.status = 'off'
    this.sendStatus()
  }

  setPlaybackActive(active: boolean): void {
    this.isPlaybackActive = active
    if (!active) {
      // Playback ended — add a short cooldown for residual echo
      this.postTurnCooldownUntil = Date.now() + this.POST_TURN_COOLDOWN_MS
      console.log(`[GeminiLive] Playback ended — ${this.POST_TURN_COOLDOWN_MS}ms cooldown`)
    }
  }

  sendAudio(base64: string): void {
    if (!this.session || this.status === 'off' || this.status === 'dormant') return
    // Mute mic while Gemini speaks — prevents echo feedback loop (3x repetition bug)
    if (this.status === 'speaking') return
    // Mute mic while playback buffer still draining (turnComplete fires before audio finishes)
    if (this.isPlaybackActive) return
    // Post-turn cooldown — let residual echo decay after playback ends
    if (Date.now() < this.postTurnCooldownUntil) return
    this.session.sendRealtimeInput({
      audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
    })
    if (this.status === 'connected') {
      this.status = 'listening'
      this.sendStatus()
    }
    this.resetIdleTimer()
  }

  respondToCommand(id: string, name: string, result: GeminiLiveCommandResult): void {
    if (!this.session) return
    // Format matching Trinity: { id, name, response: Record<string, unknown> }
    // Gemini SDK requires `name` and a flat response object
    const response: Record<string, unknown> = result.success
      ? { success: true, ...(result.data && typeof result.data === 'object' && !Array.isArray(result.data)
          ? result.data as Record<string, unknown>
          : { result: result.data ?? 'ok' }) }
      : { success: false, error: result.error ?? 'Unknown error' }

    try {
      this.session.sendToolResponse({
        functionResponses: [{
          id,
          name,
          response,
        }]
      })
      console.log(`[GeminiLive] Tool response sent for ${name} (${id})`)
    } catch (err: any) {
      console.error(`[GeminiLive] Tool response error for ${name}:`, err.message)
    }
  }

  private handleGeminiMessage(message: any) {
    const content = message.serverContent

    // Audio response — use message.data getter (concatenates all inlineData parts)
    // This matches Trinity's working approach
    const audioData = message.data as string | undefined
    if (audioData) {
      this.chunkCounter++
      this.mainWindow?.webContents.send('gemini-live:audio', audioData)
      if (this.status !== 'speaking') {
        this.status = 'speaking'
        this.sendStatus()
      }
      this.resetIdleTimer()
    }

    // Tool calls (separate from audio)
    if (message.toolCall?.functionCalls) {
      for (const fc of message.toolCall.functionCalls) {
        // Handle open_app directly in main process
        if (fc.name === 'open_app') {
          const appName = String(fc.args?.name ?? '')
          console.log('[GeminiLive] open_app:', appName)
          import('../db/queries/applications').then(async ({ getAllowedAppByName }) => {
            const app = getAllowedAppByName(appName)
            let response: Record<string, unknown>
            if (!app) {
              response = { success: false, error: `Application "${appName}" introuvable dans la liste autorisee` }
            } else if (!app.isEnabled) {
              response = { success: false, error: `Application "${appName}" est desactivee` }
            } else {
              try {
                const { shell } = await import('electron')
                if (app.type === 'web') {
                  await shell.openExternal(app.path)
                } else {
                  const errorMsg = await shell.openPath(app.path)
                  if (errorMsg) throw new Error(errorMsg)
                }
                response = { success: true, message: `${app.name} ouverte` }
              } catch (err: any) {
                response = { success: false, error: err.message }
              }
            }
            try {
              this.session?.sendToolResponse({
                functionResponses: [{ id: fc.id || `tool_${Date.now()}`, name: fc.name, response }]
              })
            } catch (err: any) {
              console.error('[GeminiLive] open_app response error:', err.message)
            }
          })
          continue
        }

        // Handle list_allowed_apps directly in main process
        if (fc.name === 'list_allowed_apps') {
          console.log('[GeminiLive] list_allowed_apps')
          import('../db/queries/applications').then(({ listEnabledApps }) => {
            const apps = listEnabledApps()
            const response = {
              success: true,
              apps: apps.map(a => ({ name: a.name, type: a.type, description: a.description }))
            }
            try {
              this.session?.sendToolResponse({
                functionResponses: [{ id: fc.id || `tool_${Date.now()}`, name: fc.name, response }]
              })
            } catch (err: any) {
              console.error('[GeminiLive] list_allowed_apps response error:', err.message)
            }
          })
          continue
        }

        // Handle recall_memory directly in main process (no renderer roundtrip needed)
        if (fc.name === 'recall_memory') {
          const query = String(fc.args?.query ?? '')
          console.log('[GeminiLive] recall_memory:', query)
          liveMemoryService.search(query).then(results => {
            const response = results.length > 0
              ? { success: true, memories: results.map(r => ({ content: r.content, date: new Date(r.timestamp).toLocaleDateString('fr-FR') })) }
              : { success: true, memories: [], message: 'Aucun souvenir trouve pour cette recherche.' }
            try {
              this.session?.sendToolResponse({
                functionResponses: [{
                  id: fc.id || `tool_${Date.now()}`,
                  name: fc.name,
                  response,
                }]
              })
            } catch (err: any) {
              console.error('[GeminiLive] recall_memory response error:', err.message)
            }
          }).catch(err => {
            console.error('[GeminiLive] recall_memory error:', err.message)
            try {
              this.session?.sendToolResponse({
                functionResponses: [{
                  id: fc.id || `tool_${Date.now()}`,
                  name: fc.name,
                  response: { success: false, error: 'Erreur de recherche memoire' },
                }]
              })
            } catch { /* ignore */ }
          })
          continue  // Skip the normal renderer dispatch for this tool
        }

        console.log('[GeminiLive] Tool call:', fc.name, JSON.stringify(fc.args))
        this.mainWindow?.webContents.send('gemini-live:command', {
          id: fc.id || `tool_${Date.now()}`,
          name: fc.name,
          args: fc.args || {},
        } satisfies GeminiLiveCommand)
      }
    }

    // Transcriptions
    if ((content as any)?.inputTranscription?.text) {
      const text = (content as any).inputTranscription.text
      console.log('[GeminiLive] User said:', text)
      liveMemoryService.addTranscript('user', text)
    }
    if ((content as any)?.outputTranscription?.text) {
      const text = (content as any).outputTranscription.text
      console.log('[GeminiLive] Agent said:', text)
      liveMemoryService.addTranscript('assistant', text)
    }

    // Turn complete
    if (content?.turnComplete) {
      this.turnCounter++
      console.log(`[GeminiLive] Turn #${this.turnCounter} complete — ${this.chunkCounter} audio chunks sent`)
      this.chunkCounter = 0
      this.postTurnCooldownUntil = Date.now() + this.POST_TURN_COOLDOWN_MS
      this.status = 'connected'
      this.sendStatus()
    }

    // Interrupted by user — clear playback buffer immediately
    if (content?.interrupted) {
      console.log('[GeminiLive] User interrupted — clearing playback')
      this.mainWindow?.webContents.send('gemini-live:clear-playback')
      this.status = 'listening'
      this.sendStatus()
    }
  }

  private resetIdleTimer() {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (this.session) {
        try { this.session.close() } catch { /* ignore */ }
        this.session = null
      }
      liveMemoryService.extractAndStore().catch(err =>
        console.error('[GeminiLive] Memory extraction failed:', err.message)
      )
      this.status = 'dormant'
      this.sendStatus()
    }, this.IDLE_TIMEOUT_MS)
  }

  private clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  private sendStatus(error?: string) {
    this.mainWindow?.webContents.send('gemini-live:status', {
      status: this.status,
      error,
    })
  }

  async stop(): Promise<void> {
    await this.disconnect()
  }
}

export const geminiLiveService = new GeminiLiveService()
