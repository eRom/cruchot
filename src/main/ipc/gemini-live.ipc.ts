import { ipcMain, desktopCapturer, systemPreferences, session } from 'electron'
import { z } from 'zod'
import { geminiLiveService } from '../services/gemini-live.service'

const commandResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  result: z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  })
})

export function registerGeminiLiveIpc(): void {
  ipcMain.handle('gemini-live:connect', async () => {
    await geminiLiveService.connect()
  })

  ipcMain.handle('gemini-live:disconnect', async () => {
    await geminiLiveService.disconnect()
  })

  ipcMain.handle('gemini-live:status', async () => {
    return { status: geminiLiveService.getStatus() }
  })

  ipcMain.handle('gemini-live:available', async () => {
    return geminiLiveService.isAvailable()
  })

  // Audio from renderer — fire-and-forget via send (not invoke)
  ipcMain.on('gemini-live:audio:send', (_event, base64: string) => {
    if (typeof base64 === 'string') {
      geminiLiveService.sendAudio(base64)
    }
  })

  // Playback state from renderer (worklet started/ended) — fire-and-forget
  ipcMain.on('gemini-live:playback-active', (_event, active: unknown) => {
    if (typeof active === 'boolean') {
      geminiLiveService.setPlaybackActive(active)
    }
  })

  // Command result from renderer
  ipcMain.handle('gemini-live:command-result', async (_event, payload: unknown) => {
    const parsed = commandResultSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid command result payload')
    geminiLiveService.respondToCommand(parsed.data.id, parsed.data.name, parsed.data.result)
  })

  // ── Screen Sharing ────────────────────────────────────

  // Check macOS screen recording permission
  ipcMain.handle('gemini-live:screen-permission', async () => {
    return systemPreferences.getMediaAccessStatus('screen')
  })

  // Get available screen/window sources with thumbnails
  ipcMain.handle('gemini-live:screen-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnailDataUrl: s.thumbnail.toDataURL(),
      appIconDataUrl: s.appIcon?.toDataURL() || undefined,
      type: s.id.startsWith('screen:') ? 'screen' as const : 'window' as const,
    }))
  })

  // Store selected source ID for setDisplayMediaRequestHandler
  let pendingSourceId: string | null = null

  ipcMain.handle('gemini-live:screen-select-source', async (_event, sourceId: string) => {
    if (typeof sourceId !== 'string') throw new Error('Invalid sourceId')
    pendingSourceId = sourceId
  })

  // Configure display media request handler — routes renderer's getDisplayMedia()
  // to the source selected in the SourcePicker
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!pendingSourceId) {
      callback({})
      return
    }
    const selectedId = pendingSourceId
    pendingSourceId = null
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then(sources => {
      const source = sources.find(s => s.id === selectedId)
      if (source) {
        callback({ video: source })
      } else {
        callback({})
      }
    }).catch(() => callback({}))
  })

  // Screen frame from renderer — fire-and-forget
  ipcMain.on('gemini-live:screen-frame', (_event, base64: string) => {
    if (typeof base64 === 'string') {
      geminiLiveService.sendScreenFrame(base64)
    }
  })

  // Screen sharing toggle from renderer
  ipcMain.on('gemini-live:screen-sharing:set', (_event, active: unknown) => {
    if (typeof active === 'boolean') {
      geminiLiveService.setScreenSharing(active)
    }
  })
}
