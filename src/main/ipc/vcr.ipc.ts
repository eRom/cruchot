import { ipcMain, BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { vcrRecorderService } from '../services/vcr-recorder.service'
import { vcrHtmlExporterService } from '../services/vcr-html-exporter.service'

const vcrStartSchema = z.object({
  conversationId: z.string().min(1).max(200),
  fullCapture: z.boolean().optional(),
  modelId: z.string().max(200).optional(),
  providerId: z.string().max(100).optional(),
  workspacePath: z.string().max(1000).optional(),
  roleId: z.string().max(200).optional()
})

const recordingIdSchema = z.object({
  recordingId: z.string().min(1).max(300)
})

const vcrExportHtmlSchema = z.object({
  recordingId: z.string().min(1).max(300),
  anonymize: z.boolean().optional()
})

export function registerVcrIpc(): void {
  // ── vcr:start ──────────────────────────────────────────────
  ipcMain.handle('vcr:start', async (event, payload) => {
    const parsed = vcrStartSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { conversationId, fullCapture, modelId, providerId, workspacePath, roleId } = parsed.data
    const result = vcrRecorderService.startRecording(conversationId, {
      fullCapture,
      modelId,
      providerId,
      workspacePath,
      roleId
    })

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const state: import('../../preload/types').RecordingState = {
        recording: vcrRecorderService.isRecording(),
        info: vcrRecorderService.getActiveRecording() ?? undefined
      }
      win.webContents.send('vcr:recording-state', state)
    }

    return result
  })

  // ── vcr:stop ───────────────────────────────────────────────
  ipcMain.handle('vcr:stop', async (event) => {
    const result = vcrRecorderService.stopRecording()

    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const state: import('../../preload/types').RecordingState = {
        recording: vcrRecorderService.isRecording(),
        info: vcrRecorderService.getActiveRecording() ?? undefined
      }
      win.webContents.send('vcr:recording-state', state)
    }

    return result
  })

  // ── vcr:status ─────────────────────────────────────────────
  ipcMain.handle('vcr:status', async () => {
    const state: import('../../preload/types').RecordingState = {
      recording: vcrRecorderService.isRecording(),
      info: vcrRecorderService.getActiveRecording() ?? undefined
    }
    return state
  })

  // ── vcr:list ───────────────────────────────────────────────
  ipcMain.handle('vcr:list', async () => {
    return vcrRecorderService.listRecordings()
  })

  // ── vcr:get ────────────────────────────────────────────────
  ipcMain.handle('vcr:get', async (_event, payload) => {
    const parsed = recordingIdSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }
    return vcrRecorderService.getRecording(parsed.data.recordingId)
  })

  // ── vcr:delete ─────────────────────────────────────────────
  ipcMain.handle('vcr:delete', async (_event, payload) => {
    const parsed = recordingIdSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }
    return vcrRecorderService.deleteRecording(parsed.data.recordingId)
  })

  // ── vcr:export-html ────────────────────────────────────────
  ipcMain.handle('vcr:export-html', async (event, payload) => {
    const parsed = vcrExportHtmlSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { recordingId, anonymize } = parsed.data
    const win = BrowserWindow.fromWebContents(event.sender)

    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Exporter en HTML',
      defaultPath: `${recordingId}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    })

    if (canceled || !filePath) {
      return { path: null }
    }

    await vcrHtmlExporterService.exportHtml(recordingId, filePath, { anonymize })
    return { path: filePath }
  })

  // ── vcr:export-vcr ─────────────────────────────────────────
  ipcMain.handle('vcr:export-vcr', async (event, payload) => {
    const parsed = recordingIdSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { recordingId } = parsed.data
    const win = BrowserWindow.fromWebContents(event.sender)

    const { canceled, filePath } = await dialog.showSaveDialog(win ?? BrowserWindow.getFocusedWindow()!, {
      title: 'Exporter en VCR',
      defaultPath: `${recordingId}.vcr`,
      filters: [{ name: 'VCR Recording', extensions: ['vcr'] }]
    })

    if (canceled || !filePath) {
      return { path: null }
    }

    vcrRecorderService.exportVcr(recordingId, filePath)
    return { path: filePath }
  })

  console.log('[IPC] VCR handlers registered')
}
