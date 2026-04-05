import { ipcMain } from 'electron'
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
}
