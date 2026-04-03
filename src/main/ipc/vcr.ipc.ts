import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { z } from 'zod'
import { vcrRecorderService } from '../services/vcr-recorder.service'
import { vcrAnonymizerService } from '../services/vcr-anonymizer.service'
import { vcrHtmlExporterService } from '../services/vcr-html-exporter.service'

const vcrStartSchema = z.object({
  conversationId: z.string().min(1).max(200),
  fullCapture: z.boolean().optional(),
  modelId: z.string().max(200).optional(),
  providerId: z.string().max(100).optional(),
  workspacePath: z.string().max(1000).optional(),
  roleId: z.string().max(200).optional()
})

export function registerVcrIpc(): void {
  // ── vcr:start ──────────────────────────────────────────────
  ipcMain.handle('vcr:start', async (event, payload) => {
    const parsed = vcrStartSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { conversationId, modelId, providerId, workspacePath, roleId } = parsed.data
    const result = vcrRecorderService.startRecording(conversationId, {
      fullCapture: true, // always full capture
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
  // THE BIG ONE: stop → anonymize → dialog → save .ndjson + .html
  ipcMain.handle('vcr:stop', async (event) => {
    // 1. Stop recording
    const stopResult = vcrRecorderService.stopRecording()

    // Notify renderer that recording stopped
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const state: import('../../preload/types').RecordingState = {
        recording: false,
        info: undefined
      }
      win.webContents.send('vcr:recording-state', state)
    }

    // 2. Read the .vcr file that was just written
    const vcrFilePath = vcrRecorderService.getLastRecordingPath()
    if (!vcrFilePath) {
      return { saved: false }
    }

    let recording
    try {
      recording = vcrRecorderService.parseRecordingFile(vcrFilePath)
    } catch (err) {
      console.error('[VCR] Failed to parse recording file:', err)
      return { saved: false }
    }

    // 3. Anonymize events (always)
    const anonymizedEvents = vcrAnonymizerService.anonymizeEvents(recording.events)
    const anonymizedHeader = vcrAnonymizerService.anonymizeHeader(
      recording.header as unknown as Record<string, unknown>
    )

    // 4. Show save dialog for user to pick folder + filename
    const defaultName = `vcr-${new Date().toISOString().slice(0, 10)}-${stopResult.recordingId.slice(-6)}`
    const parentWin = win ?? BrowserWindow.getFocusedWindow()

    const { canceled, filePath } = await dialog.showSaveDialog(parentWin!, {
      title: 'Sauvegarder l\'enregistrement VCR',
      defaultPath: `${defaultName}.ndjson`,
      filters: [{ name: 'NDJSON', extensions: ['ndjson'] }]
    })

    if (canceled || !filePath) {
      // User cancelled — delete temp .vcr file
      try {
        const trash = (await import('trash')).default
        await trash(vcrFilePath)
      } catch { /* silent */ }
      return { saved: false }
    }

    // 5. Write .ndjson — anonymized NDJSON data
    const basePath = filePath.replace(/\.ndjson$/, '')
    const ndjsonPath = basePath + '.ndjson'
    const htmlPath = basePath + '.html'

    const ndjsonLines = [
      JSON.stringify(anonymizedHeader),
      ...anonymizedEvents.map((evt) => JSON.stringify([evt.offsetMs, evt.type, evt.data]))
    ]
    writeFileSync(ndjsonPath, ndjsonLines.join('\n') + '\n', 'utf-8')
    console.log(`[VCR] NDJSON exported to ${ndjsonPath}`)

    // 6. Write .html — inject data into template
    try {
      const htmlContent = vcrHtmlExporterService.generateHtml({
        header: anonymizedHeader,
        events: anonymizedEvents
      })
      vcrHtmlExporterService.writeHtml(htmlContent, htmlPath)
    } catch (err) {
      console.error('[VCR] HTML export failed:', err)
    }

    // 7. Delete the original .vcr temp file
    try {
      const trash = (await import('trash')).default
      await trash(vcrFilePath)
    } catch { /* silent */ }

    console.log(`[VCR] Export complete: ${ndjsonPath} + ${htmlPath}`)
    return { saved: true, path: basePath }
  })

  // ── vcr:status ─────────────────────────────────────────────
  ipcMain.handle('vcr:status', async () => {
    const state: import('../../preload/types').RecordingState = {
      recording: vcrRecorderService.isRecording(),
      info: vcrRecorderService.getActiveRecording() ?? undefined
    }
    return state
  })

  console.log('[IPC] VCR handlers registered')
}
