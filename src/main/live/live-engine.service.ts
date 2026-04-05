import { type BrowserWindow } from 'electron'
import type { LivePlugin, LiveStatus, LiveCommandResult, LiveCommand } from './live-plugin.interface'
import { livePluginRegistry } from './live-plugin-registry'
import { buildCorePrompt } from './live-core-prompt'
import { CORE_LIVE_TOOLS } from './live-core-tools'
import { liveMemoryService } from '../services/live-memory.service'

class LiveEngineService {
  private activePlugin: LivePlugin | null = null
  private mainWindow: BrowserWindow | null = null
  private status: LiveStatus = 'off'
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000

  // Anti-echo state
  private isPlaybackActive = false
  private postTurnCooldownUntil = 0
  private readonly POST_TURN_COOLDOWN_MS = 500

  // Diagnostics
  private turnCounter = 0
  private chunkCounter = 0

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
  }

  isAvailable(): boolean {
    return livePluginRegistry.getAll().some(p => livePluginRegistry.getApiKey(p.providerId) !== null)
  }

  getStatus(): LiveStatus {
    return this.status
  }

  getActiveProviderId(): string | null {
    return this.activePlugin?.providerId ?? null
  }

  supportsScreenShare(): boolean {
    return this.activePlugin?.supportsScreenShare() ?? false
  }

  getScreenSharing(): boolean {
    return this.activePlugin?.getScreenSharing?.() ?? false
  }

  async connect(): Promise<void> {
    if (this.activePlugin) return

    const plugin = await livePluginRegistry.resolveActivePlugin()
    if (!plugin) throw new Error('No live plugin available (missing API key?)')

    const apiKey = livePluginRegistry.getApiKey(plugin.providerId)
    if (!apiKey) throw new Error(`No API key for ${plugin.providerId}`)

    this.activePlugin = plugin
    this.setStatus('connecting')

    // Wire up callbacks
    plugin.onAudio = (base64) => {
      this.chunkCounter++
      this.mainWindow?.webContents.send('live:audio', base64)
      if (this.status !== 'speaking') this.setStatus('speaking')
      this.resetIdleTimer()
    }

    plugin.onToolCall = (id, name, args) => {
      this.handleToolCall(id, name, args)
    }

    plugin.onStatusChange = (status) => {
      if (status === 'connected') {
        if (this.status === 'speaking') {
          // Turn complete
          this.turnCounter++
          console.log(`[LiveEngine] Turn #${this.turnCounter} — ${this.chunkCounter} audio chunks`)
          this.chunkCounter = 0
          this.postTurnCooldownUntil = Date.now() + this.POST_TURN_COOLDOWN_MS
        }
        this.setStatus('connected')
      } else if (status === 'speaking') {
        this.setStatus('speaking')
      } else if (status === 'dormant') {
        this.activePlugin = null
        liveMemoryService.extractAndStore().catch(err =>
          console.error('[LiveEngine] Memory extraction failed:', err.message)
        )
        this.setStatus('dormant')
      } else if (status === 'interrupted') {
        console.log('[LiveEngine] User interrupted — clearing playback')
        this.mainWindow?.webContents.send('live:clear-playback')
        this.setStatus('listening')
      }
    }

    plugin.onTranscript = (role, text) => {
      const label = role === 'user' ? 'User said' : 'Agent said'
      console.log(`[LiveEngine] ${label}: ${text}`)
      liveMemoryService.addTranscript(role, text)
    }

    plugin.onError = (error) => {
      console.error('[LiveEngine] Plugin error:', error)
      this.setStatus('error', error)
    }

    // Build system prompt
    const systemPrompt = await buildCorePrompt()

    try {
      liveMemoryService.startSession(plugin.providerId)
      this.turnCounter = 0
      this.chunkCounter = 0
      this.postTurnCooldownUntil = 0

      await plugin.connect({
        apiKey,
        systemPrompt,
        coreTools: CORE_LIVE_TOOLS,
      })

      this.resetIdleTimer()
    } catch (err: any) {
      console.error('[LiveEngine] Connect failed:', err.message || err)
      this.activePlugin = null
      this.setStatus('error', err.message)
    }
  }

  async disconnect(): Promise<void> {
    this.clearIdleTimer()
    if (this.activePlugin) {
      const wasScreenSharing = this.activePlugin.getScreenSharing?.() ?? false
      await this.activePlugin.disconnect()
      this.activePlugin = null
      if (wasScreenSharing) {
        this.mainWindow?.webContents.send('live:screen-sharing:status', false)
      }
    }
    liveMemoryService.extractAndStore().catch(err =>
      console.error('[LiveEngine] Memory extraction failed:', err.message)
    )
    this.setStatus('off')
  }

  async stop(): Promise<void> {
    await this.disconnect()
  }

  // ── Audio relay ──────────────────────────────
  sendAudio(base64: string): void {
    if (!this.activePlugin || this.status === 'off' || this.status === 'dormant') return
    // Anti-echo guard 1: speaking
    if (this.status === 'speaking') return
    // Anti-echo guard 2: playback buffer draining
    if (this.isPlaybackActive) return
    // Anti-echo guard 3: post-turn cooldown
    if (Date.now() < this.postTurnCooldownUntil) return

    this.activePlugin.sendAudio(base64)
    if (this.status === 'connected') this.setStatus('listening')
    this.resetIdleTimer()
  }

  setPlaybackActive(active: boolean): void {
    this.isPlaybackActive = active
    if (!active) {
      this.postTurnCooldownUntil = Date.now() + this.POST_TURN_COOLDOWN_MS
      console.log(`[LiveEngine] Playback ended — ${this.POST_TURN_COOLDOWN_MS}ms cooldown`)
    }
  }

  // ── Screen share relay ───────────────────────
  sendScreenFrame(base64: string): void {
    if (!this.activePlugin?.sendScreenFrame) return
    if (this.status === 'off' || this.status === 'dormant') return
    this.activePlugin.sendScreenFrame(base64)
    this.resetIdleTimer()
  }

  setScreenSharing(active: boolean): void {
    this.activePlugin?.setScreenSharing?.(active)
    this.mainWindow?.webContents.send('live:screen-sharing:status', active)
  }

  requestScreenshot(): void {
    if (!this.activePlugin?.getScreenSharing?.()) return
    this.mainWindow?.webContents.send('live:request-screenshot')
    console.log('[LiveEngine] Screenshot requested')
  }

  // ── Tools ────────────────────────────────────
  respondToCommand(id: string, name: string, result: LiveCommandResult): void {
    this.activePlugin?.sendToolResponse(id, name, result)
  }

  private async handleToolCall(id: string, name: string, args: Record<string, unknown>): Promise<void> {
    // Plugin internal signals (prefixed with _plugin:)
    if (name === '_plugin:request_screenshot') {
      this.requestScreenshot()
      return
    }
    if (name === '_plugin:screen_sharing_changed') {
      const active = args.active as boolean
      this.mainWindow?.webContents.send('live:screen-sharing:status', active)
      return
    }

    // Core tools handled in main process
    if (name === 'open_app') {
      await this.handleOpenApp(id, name, args)
      return
    }
    if (name === 'list_allowed_apps') {
      await this.handleListAllowedApps(id, name)
      return
    }
    if (name === 'recall_memory') {
      await this.handleRecallMemory(id, name, args)
      return
    }

    // All other core tools — delegate to renderer
    this.mainWindow?.webContents.send('live:command', {
      id,
      name,
      args,
    } satisfies LiveCommand)
  }

  private async handleOpenApp(id: string, name: string, args: Record<string, unknown>): Promise<void> {
    const appName = String(args.name ?? '')
    console.log('[LiveEngine] open_app:', appName)
    try {
      const { getAllowedAppByName } = await import('../db/queries/applications')
      const app = getAllowedAppByName(appName)
      let result: LiveCommandResult
      if (!app) {
        result = { success: false, error: `Application "${appName}" introuvable dans la liste autorisee` }
      } else if (!app.isEnabled) {
        result = { success: false, error: `Application "${appName}" est desactivee` }
      } else {
        const { shell } = await import('electron')
        if (app.type === 'web') {
          await shell.openExternal(app.path)
        } else {
          const errorMsg = await shell.openPath(app.path)
          if (errorMsg) throw new Error(errorMsg)
        }
        result = { success: true, data: { message: `${app.name} ouverte` } }
      }
      this.activePlugin?.sendToolResponse(id, name, result)
    } catch (err: any) {
      this.activePlugin?.sendToolResponse(id, name, { success: false, error: err.message })
    }
  }

  private async handleListAllowedApps(id: string, name: string): Promise<void> {
    console.log('[LiveEngine] list_allowed_apps')
    try {
      const { listEnabledApps } = await import('../db/queries/applications')
      const apps = listEnabledApps()
      this.activePlugin?.sendToolResponse(id, name, {
        success: true,
        data: { apps: apps.map(a => ({ name: a.name, type: a.type, description: a.description })) }
      })
    } catch (err: any) {
      this.activePlugin?.sendToolResponse(id, name, { success: false, error: err.message })
    }
  }

  private async handleRecallMemory(id: string, name: string, args: Record<string, unknown>): Promise<void> {
    const query = String(args.query ?? '')
    console.log('[LiveEngine] recall_memory:', query)
    try {
      const results = await liveMemoryService.search(query)
      const data = results.length > 0
        ? { memories: results.map(r => ({ content: r.content, date: new Date(r.timestamp).toLocaleDateString('fr-FR') })) }
        : { memories: [], message: 'Aucun souvenir trouve pour cette recherche.' }
      this.activePlugin?.sendToolResponse(id, name, { success: true, data })
    } catch (err: any) {
      console.error('[LiveEngine] recall_memory error:', err.message)
      this.activePlugin?.sendToolResponse(id, name, { success: false, error: 'Erreur de recherche memoire' })
    }
  }

  // ── State machine ────────────────────────────
  private setStatus(status: LiveStatus, error?: string): void {
    this.status = status
    this.mainWindow?.webContents.send('live:status', { status, error })
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      if (this.activePlugin) {
        try { this.activePlugin.disconnect() } catch { /* ignore */ }
        this.activePlugin = null
      }
      liveMemoryService.extractAndStore().catch(err =>
        console.error('[LiveEngine] Memory extraction failed:', err.message)
      )
      this.setStatus('dormant')
    }, this.IDLE_TIMEOUT_MS)
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}

export const liveEngineService = new LiveEngineService()
