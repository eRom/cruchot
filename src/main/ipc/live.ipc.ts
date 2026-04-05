import { ipcMain, desktopCapturer, systemPreferences, session } from 'electron'
import { z } from 'zod'
import { liveEngineService } from '../live/live-engine.service'
import { livePluginRegistry } from '../live/live-plugin-registry'

const commandResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  result: z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
  })
})

export function registerLiveIpc(): void {
  ipcMain.handle('live:connect', async () => {
    await liveEngineService.connect()
  })

  ipcMain.handle('live:disconnect', async () => {
    await liveEngineService.disconnect()
  })

  ipcMain.handle('live:status', async () => {
    return { status: liveEngineService.getStatus() }
  })

  ipcMain.handle('live:available', async () => {
    return liveEngineService.isAvailable()
  })

  ipcMain.handle('live:plugins', async () => {
    return livePluginRegistry.getAvailablePlugins()
  })

  ipcMain.handle('live:active-provider', async () => {
    return liveEngineService.getActiveProviderId()
  })

  // Audio from renderer — fire-and-forget
  ipcMain.on('live:audio:send', (_event, base64: string) => {
    if (typeof base64 === 'string') {
      liveEngineService.sendAudio(base64)
    }
  })

  // Playback state from renderer
  ipcMain.on('live:playback-active', (_event, active: unknown) => {
    if (typeof active === 'boolean') {
      liveEngineService.setPlaybackActive(active)
    }
  })

  // Command result from renderer
  ipcMain.handle('live:command-result', async (_event, payload: unknown) => {
    const parsed = commandResultSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid command result payload')
    liveEngineService.respondToCommand(parsed.data.id, parsed.data.name, parsed.data.result)
  })

  // ── Screen Sharing ────────────────────────────

  ipcMain.handle('live:screen-permission', async () => {
    return systemPreferences.getMediaAccessStatus('screen')
  })

  ipcMain.handle('live:screen-sources', async () => {
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

  let pendingSourceId: string | null = null

  ipcMain.handle('live:screen-select-source', async (_event, sourceId: string) => {
    if (typeof sourceId !== 'string') throw new Error('Invalid sourceId')
    pendingSourceId = sourceId
  })

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

  ipcMain.on('live:screen-frame', (_event, base64: string) => {
    if (typeof base64 === 'string') {
      liveEngineService.sendScreenFrame(base64)
    }
  })

  ipcMain.on('live:screen-sharing:set', (_event, active: unknown) => {
    if (typeof active === 'boolean') {
      liveEngineService.setScreenSharing(active)
    }
  })
}
