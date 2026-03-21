import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import { sandboxService } from '../services/sandbox.service'
import { processManagerService } from '../services/process-manager.service'
import { setConversationYolo } from '../db/queries/conversations'

const activateSchema = z.object({
  conversationId: z.string().min(1),
  workspacePath: z.string().optional()
})

const deactivateSchema = z.object({
  sessionId: z.string().min(1)
})

const stopSchema = z.object({
  sessionId: z.string().min(1)
})

const getStatusSchema = z.object({
  conversationId: z.string().min(1)
})

const getProcessesSchema = z.object({
  sessionId: z.string().min(1)
})

const openPreviewSchema = z.object({
  target: z.string().min(1).max(1000)
})

export function registerSandboxIpc(): void {
  // Activate YOLO mode for a conversation
  ipcMain.handle('sandbox:activate', async (_event, payload) => {
    const parsed = activateSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { conversationId, workspacePath } = parsed.data
    const session = sandboxService.createSession(workspacePath)

    // Persist on conversation
    setConversationYolo(conversationId, true, session.sandboxDir)

    return {
      sessionId: session.id,
      sandboxPath: session.sandboxDir
    }
  })

  // Deactivate YOLO mode — destroy sandbox and kill processes
  ipcMain.handle('sandbox:deactivate', async (_event, payload) => {
    const parsed = deactivateSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { sessionId } = parsed.data
    await processManagerService.killAll(sessionId)
    await sandboxService.destroySession(sessionId)
  })

  // Stop all processes (but keep the sandbox dir)
  ipcMain.handle('sandbox:stop', async (_event, payload) => {
    const parsed = stopSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    await processManagerService.killAll(parsed.data.sessionId)
  })

  // Get sandbox status
  ipcMain.handle('sandbox:getStatus', async (_event, payload) => {
    const parsed = getStatusSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    // We don't have a conversationId→sessionId mapping here,
    // but the renderer tracks this via the store
    return { isActive: false, sessionId: null, sandboxPath: null }
  })

  // Get active processes for a session
  ipcMain.handle('sandbox:getProcesses', async (_event, payload) => {
    const parsed = getProcessesSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    return processManagerService.getProcesses(parsed.data.sessionId)
  })

  // Open file or URL in default app
  ipcMain.handle('sandbox:openPreview', async (_event, payload) => {
    const parsed = openPreviewSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { target } = parsed.data

    // Validate: only localhost URLs or file:// paths
    if (target.startsWith('http://') || target.startsWith('https://')) {
      const url = new URL(target)
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('Only localhost URLs allowed for preview')
      }
      await shell.openExternal(target)
    } else {
      // Assume it's a file path — open via OS
      await shell.openExternal(`file://${target}`)
    }
  })

  console.log('[IPC] Sandbox handlers registered')
}
