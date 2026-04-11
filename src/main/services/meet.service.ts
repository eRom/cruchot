import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  createMeetSession,
  getMeetSessionByInviteCode,
  getMeetSessionById,
  updateMeetSession,
  endMeetSession,
  addMeetCost,
  getMeetSessionCosts
} from '../db/queries/meet'
import type { StreamChunk, MeetPermissions, MeetSender } from '../../preload/types'

const DEFAULT_PORT = 9878
const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_JOIN_ATTEMPTS_PER_MIN = 5

interface MeetMessage {
  type: string
  [key: string]: unknown
}

class MeetService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private wss: WebSocketServer | null = null
  private guestWs: WebSocket | null = null
  private activeSessionId: string | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private joinAttempts: Map<string, { count: number; resetAt: number }> = new Map()

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async createSession(data: {
    conversationId: string
    hostName: string
    guestName: string
    port?: number
  }): Promise<{ sessionId: string; inviteCode: string; expiresAt: number }> {
    if (this.activeSessionId) {
      throw new Error('A Meet session is already active')
    }
    const session = createMeetSession({
      conversationId: data.conversationId,
      hostName: data.hostName,
      guestName: data.guestName
    })
    this.activeSessionId = session.id
    await this.startServer(data.port ?? DEFAULT_PORT)
    return {
      sessionId: session.id,
      inviteCode: session.inviteCode,
      expiresAt: session.inviteExpiresAt.getTime()
    }
  }

  async endSession(): Promise<void> {
    if (!this.activeSessionId) return
    this.sendToGuest({ type: 'meet:end' })
    endMeetSession(this.activeSessionId)
    this.activeSessionId = null
    this.guestWs?.close()
    this.guestWs = null
    this.stopServer()
    this.emit('session-ended')
  }

  private async startServer(port: number): Promise<void> {
    this.wss = new WebSocketServer({ port })
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req))
    this.wss.on('error', (err) => this.emit('error', err))
    this.startHeartbeat()
  }

  private stopServer(): void {
    this.stopHeartbeat()
    this.wss?.close()
    this.wss = null
  }

  private handleConnection(ws: WebSocket, req: import('http').IncomingMessage): void {
    if (this.guestWs) {
      ws.close(4001, 'Session already has a guest')
      return
    }
    const ip = req.socket.remoteAddress ?? 'unknown'
    if (this.isRateLimited(ip)) {
      ws.close(4029, 'Too many attempts')
      return
    }
    ws.on('message', (data) => {
      try {
        const msg: MeetMessage = JSON.parse(data.toString())
        this.handleGuestMessage(ws, msg, ip)
      } catch {
        /* ignore malformed */
      }
    })
    ws.on('close', () => {
      if (this.guestWs === ws) {
        this.guestWs = null
        this.emit('guest-disconnected')
        if (this.activeSessionId) {
          this.notifyRenderer({ type: 'meet:leave' })
        }
      }
    })
  }

  private handleGuestMessage(ws: WebSocket, msg: MeetMessage, ip: string): void {
    switch (msg.type) {
      case 'meet:join':
        this.handleJoin(ws, msg, ip)
        break
      case 'meet:chat':
        this.handleChat(msg)
        break
      case 'meet:llm-request':
        this.handleLlmRequest(msg)
        break
      case 'meet:typing':
        this.notifyRenderer({ type: 'meet:typing', sender: 'guest' })
        break
      case 'meet:leave':
        this.handleGuestLeave()
        break
    }
  }

  private handleJoin(ws: WebSocket, msg: MeetMessage, ip: string): void {
    const code = String(msg.inviteCode ?? '')
      .toUpperCase()
      .trim()
    if (!code) {
      ws.send(JSON.stringify({ type: 'meet:rejected', reason: 'Code manquant' }))
      return
    }
    this.recordJoinAttempt(ip)
    const session = getMeetSessionByInviteCode(code)
    if (!session) {
      ws.send(JSON.stringify({ type: 'meet:rejected', reason: 'Code invalide ou expiré' }))
      return
    }
    if (session.inviteExpiresAt.getTime() < Date.now()) {
      ws.send(JSON.stringify({ type: 'meet:rejected', reason: 'Code expiré' }))
      updateMeetSession(session.id, { status: 'ended' })
      return
    }
    this.guestWs = ws
    updateMeetSession(session.id, { status: 'connected', startedAt: new Date() })
    const permissions: MeetPermissions = {
      guestCanLlm: session.guestCanLlm,
      guestAutoApprove: session.guestAutoApprove,
      guestVisibility: session.guestVisibility as 'response-only' | 'full'
    }
    ws.send(
      JSON.stringify({
        type: 'meet:welcome',
        sessionId: session.id,
        guestName: session.guestName,
        conversationId: session.conversationId,
        permissions
      })
    )
    this.notifyRenderer({
      type: 'meet:invite-request',
      hostName: session.hostName,
      guestName: session.guestName,
      sessionId: session.id
    })
    this.emit('guest-connected', { sessionId: session.id, guestName: session.guestName })
  }

  private handleChat(msg: MeetMessage): void {
    this.notifyRenderer({
      type: 'meet:chat',
      messageId: String(msg.messageId),
      content: String(msg.content),
      sender: 'guest' as MeetSender
    })
  }

  private handleLlmRequest(msg: MeetMessage): void {
    const session = this.activeSessionId ? getMeetSessionById(this.activeSessionId) : null
    if (!session || !session.guestCanLlm) {
      this.sendToGuest({
        type: 'meet:llm-rejected',
        messageId: msg.messageId,
        reason: 'Accès LLM désactivé'
      })
      return
    }
    if (session.guestAutoApprove) {
      this.emit('llm-request', {
        messageId: String(msg.messageId),
        content: String(msg.content),
        sender: 'guest'
      })
    } else {
      this.notifyRenderer({
        type: 'meet:llm-request',
        messageId: String(msg.messageId),
        content: String(msg.content)
      })
    }
  }

  private handleGuestLeave(): void {
    this.guestWs?.close()
    this.guestWs = null
    // Session ends but server stays up for potential re-invite
    if (this.activeSessionId) {
      endMeetSession(this.activeSessionId)
      this.activeSessionId = null
    }
    this.emit('guest-disconnected')
  }

  approveLlmRequest(messageId: string): void {
    this.sendToGuest({ type: 'meet:llm-approved', messageId })
    this.emit('llm-request-approved', { messageId })
  }

  rejectLlmRequest(messageId: string, reason?: string): void {
    this.sendToGuest({ type: 'meet:llm-rejected', messageId, reason })
  }

  updatePermissions(permissions: Partial<MeetPermissions>): void {
    if (!this.activeSessionId) return
    updateMeetSession(this.activeSessionId, permissions)
    const session = getMeetSessionById(this.activeSessionId)
    if (session) {
      const fullPermissions: MeetPermissions = {
        guestCanLlm: session.guestCanLlm,
        guestAutoApprove: session.guestAutoApprove,
        guestVisibility: session.guestVisibility as 'response-only' | 'full'
      }
      this.sendToGuest({ type: 'meet:permissions', permissions: fullPermissions })
    }
  }

  sendChatToGuest(messageId: string, content: string): void {
    this.sendToGuest({ type: 'meet:chat', messageId, content, sender: 'host' })
  }

  relayChunkToGuest(chunk: StreamChunk): void {
    if (!this.guestWs || !this.activeSessionId) return
    const session = getMeetSessionById(this.activeSessionId)
    if (!session) return
    if (session.guestVisibility === 'response-only') {
      const allowedTypes = ['start', 'text-delta', 'finish', 'error']
      if (!allowedTypes.includes(chunk.type)) return
    }
    this.sendToGuest({ type: 'meet:chunk', chunk })
  }

  relayMessageToGuest(message: Record<string, unknown>): void {
    this.sendToGuest({ type: 'meet:message', message })
  }

  trackCost(data: {
    messageId: string
    sender: MeetSender
    providerId: string
    modelId: string
    tokensIn: number
    tokensOut: number
    cost: number
  }): void {
    if (!this.activeSessionId) return
    addMeetCost({ meetSessionId: this.activeSessionId, ...data })
  }

  getCostSummary(sessionId: string) {
    const session = getMeetSessionById(sessionId)
    if (!session) return null
    const costs = getMeetSessionCosts(sessionId)
    const totalCost = costs.reduce((sum, c) => sum + c.cost, 0)
    const hostCost = costs
      .filter((c) => c.sender === 'host')
      .reduce((sum, c) => sum + c.cost, 0)
    const guestCost = costs
      .filter((c) => c.sender === 'guest')
      .reduce((sum, c) => sum + c.cost, 0)
    const durationMs =
      session.startedAt && session.endedAt
        ? session.endedAt.getTime() - session.startedAt.getTime()
        : session.startedAt
          ? Date.now() - session.startedAt.getTime()
          : 0
    const byProvider = new Map<
      string,
      { providerId: string; modelId: string; cost: number; count: number }
    >()
    for (const c of costs) {
      const key = `${c.providerId}:${c.modelId}`
      const entry = byProvider.get(key) ?? {
        providerId: c.providerId,
        modelId: c.modelId,
        cost: 0,
        count: 0
      }
      entry.cost += c.cost
      entry.count++
      byProvider.set(key, entry)
    }
    return {
      totalCost,
      hostCost,
      guestCost,
      totalMessages: costs.length,
      durationMs,
      byProvider: [...byProvider.values()]
    }
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  isGuestConnected(): boolean {
    return this.guestWs !== null && this.guestWs.readyState === 1
  }

  private sendToGuest(data: Record<string, unknown>): void {
    if (this.guestWs?.readyState === 1) {
      this.guestWs.send(JSON.stringify(data))
    }
  }

  private notifyRenderer(event: Record<string, unknown>): void {
    this.mainWindow?.webContents.send('meet:event', event)
  }

  private isRateLimited(ip: string): boolean {
    const now = Date.now()
    const entry = this.joinAttempts.get(ip)
    if (!entry || entry.resetAt < now) return false
    return entry.count >= MAX_JOIN_ATTEMPTS_PER_MIN
  }

  private recordJoinAttempt(ip: string): void {
    const now = Date.now()
    const entry = this.joinAttempts.get(ip)
    if (!entry || entry.resetAt < now) {
      this.joinAttempts.set(ip, { count: 1, resetAt: now + 60_000 })
    } else {
      entry.count++
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.guestWs?.readyState === 1) this.guestWs.ping()
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

export const meetService = new MeetService()
