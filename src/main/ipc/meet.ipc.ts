import { ipcMain } from 'electron'
import { z } from 'zod'
import { meetService } from '../services/meet.service'
import { meetClientService } from '../services/meet-client.service'

const createSessionSchema = z.object({
  conversationId: z.string().min(1),
  hostName: z.string().min(1).max(50),
  guestName: z.string().min(1).max(50)
})

const joinSchema = z.object({
  hostUrl: z.string().url(),
  inviteCode: z.string().length(6)
})

export function registerMeetIpc(): void {
  // Host handlers
  ipcMain.handle('meet:create-session', async (_event, data: unknown) => {
    const parsed = createSessionSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid payload')
    return meetService.createSession(parsed.data)
  })

  ipcMain.handle('meet:end-session', async () => {
    await meetService.endSession()
  })

  ipcMain.handle('meet:update-permissions', async (_event, permissions: unknown) => {
    meetService.updatePermissions(permissions as Record<string, unknown>)
  })

  ipcMain.handle('meet:approve-llm', async (_event, messageId: string) => {
    meetService.approveLlmRequest(messageId)
  })

  ipcMain.handle('meet:reject-llm', async (_event, messageId: string, reason?: string) => {
    meetService.rejectLlmRequest(messageId, reason)
  })

  ipcMain.handle('meet:send-chat', async (_event, data: { messageId: string; content: string }) => {
    meetService.sendChatToGuest(data.messageId, data.content)
  })

  ipcMain.handle('meet:get-session', async () => {
    const sessionId = meetService.getActiveSessionId()
    if (!sessionId) return null
    const { getMeetSessionById } = await import('../db/queries/meet')
    return getMeetSessionById(sessionId)
  })

  ipcMain.handle('meet:get-costs', async (_event, sessionId: string) => {
    return meetService.getCostSummary(sessionId)
  })

  // Guest handlers
  ipcMain.handle('meet:join', async (_event, data: unknown) => {
    const parsed = joinSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid payload')
    await meetClientService.join(parsed.data.hostUrl, parsed.data.inviteCode)
  })

  ipcMain.handle('meet:leave', async () => {
    meetClientService.leave()
  })

  ipcMain.handle('meet:accept-invite', async () => {
    return meetClientService.getState()
  })

  ipcMain.handle('meet:reject-invite', async () => {
    meetClientService.leave()
  })

  ipcMain.handle('meet:guest-send-chat', async (_event, data: { messageId: string; content: string }) => {
    meetClientService.sendChat(data.messageId, data.content)
  })

  ipcMain.handle('meet:guest-send-llm', async (_event, data: { messageId: string; content: string }) => {
    meetClientService.sendLlmRequest(data.messageId, data.content)
  })

  ipcMain.handle('meet:guest-typing', async () => {
    meetClientService.sendTyping()
  })
}
