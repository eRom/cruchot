import { ipcMain } from 'electron'
import { z } from 'zod'
import { meetService } from '../services/meet.service'
import { meetClientService } from '../services/meet-client.service'

const createSessionSchema = z.object({
  conversationId: z.string().min(1),
  hostName: z.string().min(1).max(50),
  guestName: z.string().min(1).max(50)
})

const permissionsSchema = z.object({
  guestCanLlm: z.boolean().optional(),
  guestAutoApprove: z.boolean().optional(),
  guestVisibility: z.enum(['response-only', 'full']).optional()
}).strict()

const messageIdSchema = z.string().min(1).max(100)

const chatMessageSchema = z.object({
  messageId: z.string().min(1).max(100),
  content: z.string().min(1).max(100_000)
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
    const parsed = permissionsSchema.safeParse(permissions)
    if (!parsed.success) throw new Error('Invalid permissions payload')
    meetService.updatePermissions(parsed.data)
  })

  ipcMain.handle('meet:approve-llm', async (_event, messageId: unknown) => {
    const parsed = messageIdSchema.safeParse(messageId)
    if (!parsed.success) throw new Error('Invalid messageId')
    meetService.approveLlmRequest(parsed.data)
  })

  ipcMain.handle('meet:reject-llm', async (_event, messageId: unknown, reason?: unknown) => {
    const parsedId = messageIdSchema.safeParse(messageId)
    if (!parsedId.success) throw new Error('Invalid messageId')
    const parsedReason = reason != null ? z.string().max(500).safeParse(reason) : null
    meetService.rejectLlmRequest(parsedId.data, parsedReason?.success ? parsedReason.data : undefined)
  })

  ipcMain.handle('meet:send-chat', async (_event, data: unknown) => {
    const parsed = chatMessageSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid chat payload')
    meetService.sendChatToGuest(parsed.data.messageId, parsed.data.content)
  })

  ipcMain.handle('meet:get-session', async () => {
    const sessionId = meetService.getActiveSessionId()
    if (!sessionId) return null
    const { getMeetSessionById } = await import('../db/queries/meet')
    return getMeetSessionById(sessionId)
  })

  ipcMain.handle('meet:get-costs', async (_event, sessionId: unknown) => {
    const parsed = messageIdSchema.safeParse(sessionId)
    if (!parsed.success) throw new Error('Invalid sessionId')
    return meetService.getCostSummary(parsed.data)
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
    // Guest confirms acceptance — notify host that guest is ready
    const state = meetClientService.getState()
    if (state.sessionId) {
      meetClientService.sendPresence('online')
    }
    return state
  })

  ipcMain.handle('meet:reject-invite', async () => {
    // Guest refuses the invitation
    meetClientService.leave()
  })

  ipcMain.handle('meet:guest-send-chat', async (_event, data: unknown) => {
    const parsed = chatMessageSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid chat payload')
    meetClientService.sendChat(parsed.data.messageId, parsed.data.content)
  })

  ipcMain.handle('meet:guest-send-llm', async (_event, data: unknown) => {
    const parsed = chatMessageSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid LLM request payload')
    meetClientService.sendLlmRequest(parsed.data.messageId, parsed.data.content)
  })

  ipcMain.handle('meet:guest-typing', async () => {
    meetClientService.sendTyping()
  })
}
