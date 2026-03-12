import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { remoteServerService } from '../services/remote-server.service'
import { getActiveWebSocketSession } from '../db/queries/remote-server'
import { updateSessionAutoApprove } from '../db/queries/remote-sessions'
import { handleChatMessage } from './chat.ipc'
import { getActiveWorkspace } from './workspace.ipc'

const configSchema = z.object({
  port: z.number().int().min(1024).max(65535).optional(),
  cfToken: z.string().max(500).optional().nullable(),
  cfHostname: z.string().max(200).optional().nullable()
})

const startSchema = z.object({
  conversationId: z.string().min(1).max(100).optional()
})

const autoApproveSchema = z.object({
  autoApproveRead: z.boolean(),
  autoApproveWrite: z.boolean(),
  autoApproveBash: z.boolean(),
  autoApproveList: z.boolean(),
  autoApproveMcp: z.boolean()
})

export function registerRemoteServerIpc(): void {
  // ── Wire WebSocket message events to chat handler ──────

  remoteServerService.on('message', async (event: { text: string; conversationId: string | null; sessionId: string }) => {
    const session = getActiveWebSocketSession()
    if (!session || !session.conversationId) {
      console.warn('[RemoteServer] No active session or conversation for incoming WS message')
      return
    }

    const windows = BrowserWindow.getAllWindows()
    const mainWindow = windows[0]
    if (!mainWindow) {
      console.warn('[RemoteServer] No main window found')
      return
    }

    let modelId = 'claude-sonnet-4-20250514'
    let providerId = 'anthropic'

    try {
      const { getConversation } = await import('../db/queries/conversations')
      const conv = getConversation(session.conversationId)
      if (conv?.modelId) {
        const parts = conv.modelId.split('::')
        if (parts.length === 2) {
          providerId = parts[0]
          modelId = parts[1]
        }
      }
    } catch { /* use defaults */ }

    const workspace = getActiveWorkspace()

    try {
      await handleChatMessage({
        conversationId: session.conversationId,
        content: event.text,
        modelId,
        providerId,
        hasWorkspace: workspace !== null,
        source: 'websocket',
        window: mainWindow
      })
    } catch (err) {
      console.error('[RemoteServer] Failed to handle WS message:', err)
      // Only broadcast to authenticated clients — do not leak info to unauthenticated connections
      remoteServerService.broadcastToAuthenticatedClients({
        type: 'error',
        message: 'Erreur lors du traitement du message.'
      })
    }
  })

  remoteServerService.on('cancel-stream', () => {
    // Trigger cancel via IPC
    const windows = BrowserWindow.getAllWindows()
    const mainWindow = windows[0]
    if (mainWindow) {
      mainWindow.webContents.send('chat:chunk', { type: 'finish', content: '' })
    }
  })

  // ── IPC Handlers ──────────────────────────────────────

  ipcMain.handle('remote-server:start', async (_event, data?: unknown) => {
    const parsed = startSchema.safeParse(data ?? {})
    if (!parsed.success) throw new Error('Donnees invalides')
    return await remoteServerService.start(parsed.data.conversationId)
  })

  ipcMain.handle('remote-server:stop', async () => {
    await remoteServerService.stop()
  })

  ipcMain.handle('remote-server:get-config', async () => {
    return remoteServerService.getConfig()
  })

  ipcMain.handle('remote-server:set-config', async (_event, data: unknown) => {
    const parsed = configSchema.safeParse(data)
    if (!parsed.success) throw new Error('Donnees invalides')

    if (parsed.data.port !== undefined) {
      remoteServerService.setPort(parsed.data.port)
    }
    if (parsed.data.cfToken !== undefined) {
      remoteServerService.setCfToken(parsed.data.cfToken ?? null)
    }
    if (parsed.data.cfHostname !== undefined) {
      remoteServerService.setCfHostname(parsed.data.cfHostname ?? null)
    }

    return remoteServerService.getConfig()
  })

  ipcMain.handle('remote-server:generate-pairing', async (_event, data?: unknown) => {
    const parsed = startSchema.safeParse(data ?? {})
    const { code, url, wsUrl, qrDataUrl } = remoteServerService.generatePairingCode(
      parsed.success ? parsed.data.conversationId : undefined
    )
    return { code, url, wsUrl, qrDataUrl: await qrDataUrl }
  })

  ipcMain.handle('remote-server:disconnect-client', async (_event, clientId: unknown) => {
    if (typeof clientId !== 'string') throw new Error('ID client invalide')
    remoteServerService.disconnectClient(clientId)
  })

  ipcMain.handle('remote-server:get-clients', async () => {
    return remoteServerService.getConnectedClients()
  })

  ipcMain.handle('remote-server:set-auto-approve', async (_event, data: unknown) => {
    const parsed = autoApproveSchema.safeParse(data)
    if (!parsed.success) throw new Error('Donnees invalides')

    const session = getActiveWebSocketSession()
    if (!session) throw new Error('Aucune session active')

    return updateSessionAutoApprove(session.id, parsed.data)
  })

  console.log('[IPC] Remote Server handlers registered')
}
