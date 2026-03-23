import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { telegramBotService } from '../services/telegram-bot.service'
import { updateSessionAutoApprove, getActiveSession } from '../db/queries/remote-sessions'
import { handleChatMessage } from './chat.ipc'

const tokenSchema = z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, 'Format de token invalide')

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

export function registerRemoteIpc(): void {
  // ── Wire Telegram message events to chat handler ──────

  telegramBotService.on('message', async (event: { text: string; chatId: number; sessionId: string }) => {
    const session = getActiveSession()
    if (!session || !session.conversationId) {
      console.warn('[Remote] No active session or conversation for incoming Telegram message')
      return
    }

    // Find main window
    const windows = BrowserWindow.getAllWindows()
    const mainWindow = windows[0]
    if (!mainWindow) {
      console.warn('[Remote] No main window found')
      return
    }

    // Determine model/provider from settings or active project defaults
    let modelId = 'claude-sonnet-4-20250514'
    let providerId = 'anthropic'

    // Try to get the conversation's last used model
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

    try {
      await handleChatMessage({
        conversationId: session.conversationId,
        content: event.text,
        modelId,
        providerId,
        source: 'telegram',
        window: mainWindow
      })
    } catch (err) {
      console.error('[Remote] Failed to handle Telegram message:', err)
      // Generic error message — avoid leaking internal details to Telegram
      telegramBotService.sendMessage('Erreur lors du traitement du message.').catch(() => {})
    }
  })

  telegramBotService.on('command:model', async () => {
    const session = getActiveSession()
    if (!session?.conversationId) return

    try {
      const { getConversation } = await import('../db/queries/conversations')
      const conv = getConversation(session.conversationId)
      const modelStr = conv?.modelId ?? 'Aucun modele defini'
      telegramBotService.sendMessage(`Modele actif : ${modelStr}`).catch(() => {})
    } catch {
      telegramBotService.sendMessage('Impossible de recuperer le modele.').catch(() => {})
    }
  })

  // ── IPC Handlers ──────────────────────────────────────

  // Configure — validate token with Telegram getMe, encrypt and store
  ipcMain.handle('remote:configure', async (_event, token: unknown) => {
    const parsed = tokenSchema.safeParse(token)
    if (!parsed.success) throw new Error('Token invalide')

    return await telegramBotService.configure(parsed.data)
  })

  // Start — begin pairing, returns pairing code
  // Optionally receives the active conversationId to continue on Telegram
  ipcMain.handle('remote:start', async (_event, conversationId?: unknown) => {
    const parsed = startSchema.safeParse({ conversationId })
    if (!parsed.success) throw new Error('Donnees invalides')
    return await telegramBotService.start(parsed.data.conversationId)
  })

  // Stop — end session
  ipcMain.handle('remote:stop', async () => {
    await telegramBotService.stop()
  })

  // Status — get current status
  ipcMain.handle('remote:status', async () => {
    return { status: telegramBotService.getStatus() }
  })

  // Get config — returns hasToken, botUsername, session info (never the token itself)
  ipcMain.handle('remote:get-config', async () => {
    return telegramBotService.getConfig()
  })

  // Set auto-approve settings
  ipcMain.handle('remote:set-auto-approve', async (_event, data: unknown) => {
    const parsed = autoApproveSchema.safeParse(data)
    if (!parsed.success) throw new Error('Donnees invalides')

    const session = getActiveSession()
    if (!session) throw new Error('Aucune session active')

    return updateSessionAutoApprove(session.id, parsed.data)
  })

  // Set allowed Telegram user ID
  ipcMain.handle('remote:set-allowed-user', async (_event, userId: unknown) => {
    if (userId === null || userId === undefined || userId === '') {
      telegramBotService.setAllowedUserId(null)
      return
    }
    const parsed = typeof userId === 'number' ? userId : parseInt(String(userId), 10)
    if (isNaN(parsed) || parsed <= 0) throw new Error('ID utilisateur invalide')
    telegramBotService.setAllowedUserId(parsed)
  })

  // Delete token — remove encrypted token, stop if active
  ipcMain.handle('remote:delete-token', async () => {
    await telegramBotService.deleteToken()
  })

  console.log('[IPC] Remote handlers registered')
}
