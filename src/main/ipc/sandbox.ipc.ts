import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import * as path from 'path'
import { sandboxService } from '../services/sandbox.service'
import { processManagerService } from '../services/process-manager.service'
import { setConversationYolo } from '../db/queries/conversations'

// Extensions that must NOT be opened via shell.openExternal (could execute code)
const DANGEROUS_PREVIEW_EXTENSIONS = new Set([
  '.app', '.exe', '.msi', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.vbe',
  '.wsf', '.wsh', '.scr', '.pif', '.jar', '.command', '.sh', '.bash',
  '.csh', '.ksh', '.zsh', '.action', '.workflow', '.pkg', '.dmg',
  '.scpt', '.applescript', '.dylib', '.so', '.dll'
])

const activateSchema = z.object({
  conversationId: z.string().min(1),
  workspacePath: z.string().optional()
})

const deactivateSchema = z.object({
  sessionId: z.string().min(1),
  conversationId: z.string().min(1)
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
  target: z.string().min(1).max(1000),
  sessionId: z.string().min(1)
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

    const { sessionId, conversationId } = parsed.data
    await processManagerService.killAll(sessionId)
    await sandboxService.destroySession(sessionId)
    // Reset DB state
    setConversationYolo(conversationId, false, null)
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

  // Open file or URL in default app (confined to sandbox)
  ipcMain.handle('sandbox:openPreview', async (_event, payload) => {
    const parsed = openPreviewSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { target, sessionId } = parsed.data

    if (target.startsWith('http://') || target.startsWith('https://')) {
      // Only localhost URLs allowed
      const url = new URL(target)
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error('Only localhost URLs allowed for preview')
      }
      await shell.openExternal(target)
    } else {
      // File path — must be inside the sandbox directory
      const sandboxDir = sandboxService.getSandboxDir(sessionId)
      if (!sandboxDir) throw new Error('No active sandbox session')

      const resolved = require('path').resolve(sandboxDir, target)
      let real: string
      try {
        real = require('fs').realpathSync(resolved)
      } catch {
        throw new Error('File not found')
      }
      if (!real.startsWith(sandboxDir + require('path').sep) && real !== sandboxDir) {
        throw new Error('Path escapes sandbox')
      }
      // Block dangerous executable extensions
      const ext = path.extname(real).toLowerCase()
      if (DANGEROUS_PREVIEW_EXTENSIONS.has(ext)) {
        throw new Error(`Cannot preview executable file type: ${ext}`)
      }
      await shell.openExternal(`file://${real}`)
    }
  })

  console.log('[IPC] Sandbox handlers registered')
}
