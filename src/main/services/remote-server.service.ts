import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { execFile, type ChildProcess } from 'node:child_process'
import { WebSocketServer, type WebSocket } from 'ws'
import QRCode from 'qrcode'
import { encryptApiKey, decryptApiKey } from './credential.service'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import {
  getServerConfig,
  setServerConfig,
  deleteServerConfig,
  getActiveWebSocketSession,
  createWebSocketSession,
  updateWebSocketSession,
  deactivateWebSocketSessions,
  touchWebSocketActivity
} from '../db/queries/remote-server'
import { updateSessionAutoApprove } from '../db/queries/remote-sessions'

// ── Types ─────────────────────────────────────────────────

export type RemoteServerStatus = 'stopped' | 'running' | 'error'

interface ClientEntry {
  ws: WebSocket
  id: string
  sessionToken: string | null
  fingerprint: string
  ip: string
  userAgent: string
  connectedAt: Date
  lastActivity: Date
}

interface PendingApproval {
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

// ── Sensitive patterns to sanitize ─────────────────────────

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/gi,
  /sk-proj-[a-zA-Z0-9_-]+/gi,
  /sk-ant-[a-zA-Z0-9_-]+/gi,
  /AIza[a-zA-Z0-9_-]{35}/gi,
  /xai-[a-zA-Z0-9_-]+/gi,
  /-----BEGIN[\s\S]*?-----END[^\n]+/g,
  /\d+:[A-Za-z0-9_-]{35,}/g,
]

// ── Constants ─────────────────────────────────────────────

const DEFAULT_PORT = 9877
const PAIRING_EXPIRY_MS = 5 * 60 * 1000
const MAX_PAIRING_ATTEMPTS = 5
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000
const SESSION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000
const HEARTBEAT_INTERVAL_MS = 30 * 1000
const CF_TOKEN_KEY = 'multi-llm:remote-server:cf-token'

// Rate limiting
const MAX_PAIRING_PER_MIN_PER_IP = 10
const MAX_MESSAGES_PER_MIN_PER_SESSION = 100
const MAX_CONNECTIONS_PER_IP = 5
const BAN_DURATION_MS = 15 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 10

// ── Service ───────────────────────────────────────────────

class RemoteServerService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private wss: WebSocketServer | null = null
  private status: RemoteServerStatus = 'stopped'
  private port = DEFAULT_PORT

  // CloudFlare Tunnel
  private cfProcess: ChildProcess | null = null
  private cfToken: string | null = null
  private cfHostname: string | null = null
  private tunnelUrl: string | null = null

  // Client registry
  private clients = new Map<string, ClientEntry>()

  // Pairing
  private pairingCode: string | null = null
  private pairingExpiry: number | null = null
  private pairingAttempts = 0
  private pendingConversationId: string | null = null

  // Session
  private sessionId: string | null = null

  // Tool approval
  private pendingApprovals = new Map<string, PendingApproval>()

  // Streaming
  private isStreamingActive = false

  // Rate limiting (in-memory)
  private pairingRates = new Map<string, { count: number; resetAt: number }>()
  private messageRates = new Map<string, { count: number; resetAt: number }>()
  private connectionCounts = new Map<string, number>()
  private bannedIps = new Map<string, number>() // ip -> ban expiry timestamp
  private failureCounts = new Map<string, number>()

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  // ── Lifecycle ─────────────────────────────────────────

  async init(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow

    // Load config from DB
    const config = getServerConfig()
    this.port = config.port ? parseInt(config.port, 10) : DEFAULT_PORT
    this.cfHostname = config.cf_hostname ?? null

    // Load CF token
    try {
      const db = getDatabase()
      const stored = db.select().from(settings).where(eq(settings.key, CF_TOKEN_KEY)).get()
      if (stored?.value) {
        this.cfToken = decryptApiKey(stored.value)
      }
    } catch {
      console.warn('[RemoteServer] Failed to load CF token')
    }

    // Auto-start if was enabled
    if (config.enabled === 'true') {
      try {
        await this.start()
      } catch (err) {
        console.error('[RemoteServer] Auto-start failed:', err)
      }
    }
  }

  async start(conversationId?: string): Promise<{ port: number; tunnelUrl: string | null }> {
    if (this.wss) {
      await this.stop()
    }

    this.pendingConversationId = conversationId ?? null

    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.port,
          host: '127.0.0.1',
          maxPayload: 64 * 1024 // 64KB — prevent DoS via oversized messages
        })

        this.wss.on('listening', () => {
          console.log(`[RemoteServer] WSS listening on localhost:${this.port}`)
          this.setStatus('running')
          setServerConfig('enabled', 'true')

          // Start heartbeat
          this.startHeartbeat()

          // Start tunnel
          this.startTunnel().catch((err) => {
            console.warn('[RemoteServer] Tunnel start failed:', err)
          })

          resolve({ port: this.port, tunnelUrl: this.tunnelUrl })
        })

        this.wss.on('connection', (ws, req) => {
          this.handleNewConnection(ws, req)
        })

        this.wss.on('error', (err) => {
          console.error('[RemoteServer] WSS error:', err)
          this.setStatus('error')
          reject(err)
        })
      } catch (err) {
        this.setStatus('error')
        reject(err)
      }
    })
  }

  async stop(): Promise<void> {
    // Notify all clients
    this.broadcastToClients({ type: 'session-expired', reason: 'Server stopped' })

    // Close all client connections
    for (const [, client] of this.clients) {
      try { client.ws.close(1000, 'Server stopping') } catch { /* ignore */ }
    }
    this.clients.clear()

    // Stop heartbeat
    this.stopHeartbeat()

    // Close WSS
    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    // Stop tunnel
    await this.stopTunnel()

    // Clear pending approvals
    this.clearPendingApprovals()

    // Deactivate sessions
    deactivateWebSocketSessions()
    this.sessionId = null
    this.pairingCode = null
    this.pairingExpiry = null
    this.isStreamingActive = false

    setServerConfig('enabled', 'false')
    this.setStatus('stopped')

    console.log('[RemoteServer] Stopped')
  }

  async destroy(): Promise<void> {
    await this.stop()
  }

  // ── Connection handling ─────────────────────────────────

  private handleNewConnection(ws: WebSocket, req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): void {
    const ip = req.socket.remoteAddress ?? 'unknown'
    const userAgent = String(req.headers['user-agent'] ?? 'unknown')
    const clientId = nanoid()

    // Check IP ban
    const banExpiry = this.bannedIps.get(ip)
    if (banExpiry && Date.now() < banExpiry) {
      ws.close(4403, 'Banned')
      return
    }

    // Check connection count per IP
    const connCount = this.connectionCounts.get(ip) ?? 0
    if (connCount >= MAX_CONNECTIONS_PER_IP) {
      ws.close(4429, 'Too many connections')
      return
    }
    this.connectionCounts.set(ip, connCount + 1)

    const fingerprint = this.computeFingerprint(ip, userAgent)

    const entry: ClientEntry = {
      ws,
      id: clientId,
      sessionToken: null,
      fingerprint,
      ip,
      userAgent,
      connectedAt: new Date(),
      lastActivity: new Date()
    }
    this.clients.set(clientId, entry)

    // Request authentication
    this.sendToClient(clientId, { type: 'auth-required' })

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(String(data))
        this.handleClientMessage(clientId, message)
      } catch {
        this.sendToClient(clientId, { type: 'error', message: 'Invalid message format' })
      }
    })

    ws.on('close', () => {
      this.handleClientDisconnect(clientId, ip)
    })

    ws.on('error', () => {
      this.handleClientDisconnect(clientId, ip)
    })

    this.notifyDesktop('remote-server:client-connected', {
      id: clientId,
      ip,
      userAgent,
      connectedAt: entry.connectedAt.toISOString()
    })
  }

  private handleClientDisconnect(clientId: string, ip: string): void {
    this.clients.delete(clientId)

    // Decrement connection count
    const count = this.connectionCounts.get(ip) ?? 1
    if (count <= 1) {
      this.connectionCounts.delete(ip)
    } else {
      this.connectionCounts.set(ip, count - 1)
    }

    this.notifyDesktop('remote-server:client-disconnected', { id: clientId })
    this.notifyDesktop('remote-server:status-changed', {
      status: this.status,
      connectedClients: this.clients.size
    })
  }

  // ── Message handler ─────────────────────────────────────

  private async handleClientMessage(clientId: string, message: { type: string; [key: string]: unknown }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client) return

    client.lastActivity = new Date()

    switch (message.type) {
      case 'pair':
        await this.handlePairMessage(clientId, message)
        break

      case 'user-message':
        await this.handleUserMessage(clientId, message)
        break

      case 'tool-approval-response':
        this.handleToolApprovalResponse(clientId, message)
        break

      case 'cancel-stream': {
        const cancelClient = this.clients.get(clientId)
        if (!cancelClient || !this.validateSessionToken(cancelClient, String(message.sessionToken ?? ''))) return
        this.emit('cancel-stream')
        break
      }

      case 'ping':
        this.sendToClient(clientId, { type: 'pong' })
        break

      case 'switch-conversation':
        await this.handleSwitchConversation(clientId, message)
        break

      case 'get-conversations':
        await this.handleGetConversations(clientId, message)
        break

      case 'get-history':
        await this.handleGetHistory(clientId, message)
        break

      default:
        this.sendToClient(clientId, { type: 'error', message: `Unknown message type: ${message.type}` })
    }
  }

  // ── Pairing ─────────────────────────────────────────────

  generatePairingCode(conversationId?: string): { code: string; url: string | null; wsUrl: string; qrDataUrl: Promise<string | null> } {
    this.pairingCode = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
    this.pairingExpiry = Date.now() + PAIRING_EXPIRY_MS
    this.pairingAttempts = 0
    this.pendingConversationId = conversationId ?? this.pendingConversationId

    // Build WebSocket URL — ws:// for local, wss:// for tunnel
    const wsUrl = this.tunnelUrl ?? `ws://localhost:${this.port}`

    // Build pairing URL (for QR code / clipboard)
    let url: string | null = null
    if (this.tunnelUrl && this.cfHostname) {
      // Tunnel mode — web client hosted externally or on tunnel
      const base = this.cfHostname.startsWith('http') ? this.cfHostname : `https://${this.cfHostname}`
      url = `${base}?ws=${encodeURIComponent(wsUrl)}&pair=${this.pairingCode}`
    } else {
      // Local mode — point to localhost web client
      url = `http://localhost:5174?ws=${encodeURIComponent(wsUrl)}&pair=${this.pairingCode}`
    }

    // Generate QR code
    const qrDataUrl = url
      ? QRCode.toDataURL(url, { width: 256, margin: 2 }).catch(() => null)
      : Promise.resolve(null)

    return { code: this.pairingCode, url, wsUrl, qrDataUrl }
  }

  private async handlePairMessage(clientId: string, message: { type: string; code?: string }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client) return

    const code = String(message.code ?? '').trim()

    // Rate limit pairing
    if (!this.checkPairingRate(client.ip)) {
      this.sendToClient(clientId, { type: 'pair-failed', reason: 'Trop de tentatives. Reessayez plus tard.' })
      return
    }

    // Check expiry
    if (!this.pairingCode || !this.pairingExpiry || Date.now() > this.pairingExpiry) {
      this.sendToClient(clientId, { type: 'pair-failed', reason: 'Code expire. Regenerez depuis le desktop.' })
      return
    }

    // Check attempts
    this.pairingAttempts++
    if (this.pairingAttempts >= MAX_PAIRING_ATTEMPTS) {
      this.sendToClient(clientId, { type: 'pair-failed', reason: 'Trop de tentatives. Regenerez depuis le desktop.' })
      this.pairingCode = null
      this.pairingExpiry = null
      return
    }

    // Validate code (timing-safe comparison to prevent side-channel attacks)
    // Normalize to exactly 6 chars to ensure equal buffer lengths for timingSafeEqual
    const safeCode = String(code).slice(0, 6).padEnd(6)
    const expectedCode = this.pairingCode.padEnd(6)
    if (!crypto.timingSafeEqual(Buffer.from(safeCode), Buffer.from(expectedCode))) {
      this.recordFailure(client.ip)
      this.sendToClient(clientId, {
        type: 'pair-failed',
        reason: `Code incorrect (tentative ${this.pairingAttempts}/${MAX_PAIRING_ATTEMPTS}).`
      })
      return
    }

    // Pairing successful
    this.pairingCode = null
    this.pairingExpiry = null
    this.clearFailures(client.ip)

    // Generate session token
    const sessionToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex')

    // Deactivate previous sessions
    deactivateWebSocketSessions()

    // Create new session
    const session = createWebSocketSession({
      conversationId: this.pendingConversationId ?? undefined,
      wsClientFingerprint: client.fingerprint,
      wsSessionToken: tokenHash,
      wsIpAddress: client.ip
    })

    this.sessionId = session.id
    client.sessionToken = sessionToken

    // Get conversation title
    let convTitle = 'Conversation active'
    if (this.pendingConversationId) {
      try {
        const { getConversation } = await import('../db/queries/conversations')
        const existing = getConversation(this.pendingConversationId)
        if (existing) convTitle = existing.title
      } catch { /* ignore */ }
    }

    this.sendToClient(clientId, {
      type: 'paired',
      sessionToken,
      conversationTitle: convTitle,
      conversationId: this.pendingConversationId
    })

    this.notifyDesktop('remote-server:status-changed', {
      status: 'running',
      connectedClients: this.getAuthenticatedClientCount()
    })

    console.log(`[RemoteServer] Client ${clientId} paired successfully`)
  }

  // ── User messages ─────────────────────────────────────

  private async handleUserMessage(clientId: string, message: { type: string; text?: string; sessionToken?: string }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client) return

    // Validate session token
    if (!this.validateSessionToken(client, String(message.sessionToken ?? ''))) {
      this.sendToClient(clientId, { type: 'error', message: 'Session invalide. Refaites le pairing.' })
      return
    }

    // Rate limit messages
    if (!this.checkMessageRate(clientId)) {
      this.sendToClient(clientId, { type: 'error', message: 'Trop de messages. Attendez un moment.' })
      return
    }

    const text = String(message.text ?? '').trim()
    if (!text) return

    // Touch activity
    if (this.sessionId) {
      touchWebSocketActivity(this.sessionId)
    }

    // Get active conversation
    const session = this.sessionId ? getActiveWebSocketSession() : null
    const conversationId = session?.conversationId

    this.emit('message', {
      text,
      conversationId,
      sessionId: this.sessionId
    })
  }

  // ── Conversations ─────────────────────────────────────

  private async handleSwitchConversation(clientId: string, message: { type: string; conversationId?: string; sessionToken?: string }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client || !this.validateSessionToken(client, String(message.sessionToken ?? ''))) {
      this.sendToClient(clientId, { type: 'error', message: 'Session invalide.' })
      return
    }

    const convId = String(message.conversationId ?? '')
    if (!convId) return

    if (this.sessionId) {
      updateWebSocketSession(this.sessionId, { conversationId: convId })
    }

    try {
      const { getConversation } = await import('../db/queries/conversations')
      const conv = getConversation(convId)
      this.sendToClient(clientId, {
        type: 'conversation-switched',
        conversationId: convId,
        title: conv?.title ?? 'Conversation'
      })
    } catch {
      this.sendToClient(clientId, { type: 'error', message: 'Conversation introuvable.' })
    }
  }

  private async handleGetConversations(clientId: string, message: { type: string; sessionToken?: string }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client || !this.validateSessionToken(client, String(message.sessionToken ?? ''))) {
      this.sendToClient(clientId, { type: 'error', message: 'Session invalide.' })
      return
    }

    try {
      const { getAllConversations } = await import('../db/queries/conversations')
      const convs = getAllConversations()
      this.sendToClient(clientId, {
        type: 'conversations-list',
        conversations: convs.map((c: { id: string; title: string; updatedAt: Date }) => ({
          id: c.id,
          title: c.title,
          updatedAt: c.updatedAt.toISOString()
        }))
      })
    } catch {
      this.sendToClient(clientId, { type: 'conversations-list', conversations: [] })
    }
  }

  private async handleGetHistory(clientId: string, message: { type: string; conversationId?: string; sessionToken?: string }): Promise<void> {
    const client = this.clients.get(clientId)
    if (!client || !this.validateSessionToken(client, String(message.sessionToken ?? ''))) {
      this.sendToClient(clientId, { type: 'error', message: 'Session invalide.' })
      return
    }

    const convId = String(message.conversationId ?? '')
    if (!convId) return

    try {
      const { getMessagesForConversation } = await import('../db/queries/messages')
      const msgs = getMessagesForConversation(convId)
      this.sendToClient(clientId, {
        type: 'history',
        conversationId: convId,
        messages: msgs.map((m: { id: string; role: string; content: string; createdAt: Date }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt.toISOString()
        }))
      })
    } catch {
      this.sendToClient(clientId, { type: 'history', conversationId: convId, messages: [] })
    }
  }

  // ── Streaming (API miroir de TelegramBotService) ────────

  startStreaming(): void {
    this.isStreamingActive = true
    this.broadcastToAuthenticatedClients({ type: 'stream-start' })
  }

  pushChunk(text: string): void {
    if (!this.isStreamingActive) return
    // No debounce for WebSocket — real-time
    this.broadcastToAuthenticatedClients({ type: 'text-delta', content: text })
  }

  pushReasoningChunk(text: string): void {
    if (!this.isStreamingActive) return
    this.broadcastToAuthenticatedClients({ type: 'reasoning-delta', content: text })
  }

  endStreaming(fullText: string): void {
    this.isStreamingActive = false
    const sanitized = this.sanitize(fullText)
    this.broadcastToAuthenticatedClients({ type: 'stream-end', fullText: sanitized })
  }

  // ── Tool Approval ──────────────────────────────────────

  async requestApproval(toolCallId: string, toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (this.getAuthenticatedClientCount() === 0) return true

    const argsStr = JSON.stringify(args, null, 2)
    const truncatedArgs = argsStr.length > 500 ? argsStr.slice(0, 500) + '...' : argsStr

    this.broadcastToAuthenticatedClients({
      type: 'tool-approval-request',
      toolCallId,
      toolName,
      args: truncatedArgs
    })

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(toolCallId)
        resolve(false)
      }, APPROVAL_TIMEOUT_MS)

      this.pendingApprovals.set(toolCallId, { resolve, timer })
    })
  }

  private handleToolApprovalResponse(clientId: string, message: { type: string; toolCallId?: string; approved?: boolean; sessionToken?: string }): void {
    const client = this.clients.get(clientId)
    if (!client || !this.validateSessionToken(client, String(message.sessionToken ?? ''))) return

    const toolCallId = String(message.toolCallId ?? '')
    const pending = this.pendingApprovals.get(toolCallId)
    if (!pending) return

    clearTimeout(pending.timer)
    this.pendingApprovals.delete(toolCallId)
    pending.resolve(!!message.approved)
  }

  async sendToolResult(toolName: string, output: unknown): Promise<void> {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    const truncated = outputStr.length > 1000 ? outputStr.slice(0, 1000) + '...' : outputStr
    // Sanitize tool output to avoid leaking API keys or sensitive data
    const sanitized = this.sanitize(truncated)
    this.broadcastToAuthenticatedClients({
      type: 'tool-result',
      toolName,
      output: sanitized
    })
  }

  // ── Broadcasting ────────────────────────────────────────

  broadcastToClients(data: Record<string, unknown>): void {
    const json = JSON.stringify(data)
    for (const [, client] of this.clients) {
      if (client.ws.readyState === 1) { // OPEN
        client.ws.send(json)
      }
    }
  }

  broadcastToAuthenticatedClients(data: Record<string, unknown>): void {
    const json = JSON.stringify(data)
    for (const [, client] of this.clients) {
      if (client.sessionToken && client.ws.readyState === 1) {
        client.ws.send(json)
      }
    }
  }

  private sendToClient(clientId: string, data: Record<string, unknown>): void {
    const client = this.clients.get(clientId)
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(data))
    }
  }

  // ── CloudFlare Tunnel ──────────────────────────────────

  private async startTunnel(): Promise<void> {
    if (!this.cfToken && !this.cfHostname) {
      console.log('[RemoteServer] No CF token/hostname — tunnel not started')
      return
    }

    try {
      const args = this.cfToken
        ? ['tunnel', 'run', '--token', this.cfToken]
        : ['tunnel', '--url', `http://localhost:${this.port}`]

      this.cfProcess = execFile('cloudflared', args, {
        env: { PATH: '/usr/local/bin:/usr/bin:/bin' }
      })

      this.cfProcess.stderr?.on('data', (data: Buffer) => {
        const line = data.toString()
        // Parse tunnel URL from cloudflared output
        const urlMatch = line.match(/https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/)
        if (urlMatch && !this.tunnelUrl) {
          this.tunnelUrl = urlMatch[0].replace('https://', 'wss://')
          console.log(`[RemoteServer] Tunnel URL: ${this.tunnelUrl}`)
          this.notifyDesktop('remote-server:status-changed', {
            status: 'running',
            connectedClients: this.clients.size,
            tunnelUrl: this.tunnelUrl
          })
        }
      })

      this.cfProcess.on('exit', (code) => {
        console.log(`[RemoteServer] cloudflared exited with code ${code}`)
        this.cfProcess = null
        this.tunnelUrl = null
      })

      console.log('[RemoteServer] Tunnel starting...')
    } catch (err) {
      console.warn('[RemoteServer] Failed to start cloudflared:', err)
    }
  }

  private async stopTunnel(): Promise<void> {
    if (this.cfProcess) {
      this.cfProcess.kill()
      this.cfProcess = null
      this.tunnelUrl = null
    }
  }

  // ── Session validation ─────────────────────────────────

  private validateSessionToken(client: ClientEntry, token: string): boolean {
    if (!token || !this.sessionId) return false

    const session = getActiveWebSocketSession()
    if (!session || !session.wsSessionToken) return false

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    return tokenHash === session.wsSessionToken
  }

  private computeFingerprint(ip: string, userAgent: string): string {
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').slice(0, 16)
  }

  // ── Rate limiting ──────────────────────────────────────

  private checkPairingRate(ip: string): boolean {
    const now = Date.now()
    const entry = this.pairingRates.get(ip)

    if (!entry || now > entry.resetAt) {
      this.pairingRates.set(ip, { count: 1, resetAt: now + 60_000 })
      return true
    }

    entry.count++
    return entry.count <= MAX_PAIRING_PER_MIN_PER_IP
  }

  private checkMessageRate(clientId: string): boolean {
    const now = Date.now()
    const entry = this.messageRates.get(clientId)

    if (!entry || now > entry.resetAt) {
      this.messageRates.set(clientId, { count: 1, resetAt: now + 60_000 })
      return true
    }

    entry.count++
    return entry.count <= MAX_MESSAGES_PER_MIN_PER_SESSION
  }

  private recordFailure(ip: string): void {
    const count = (this.failureCounts.get(ip) ?? 0) + 1
    this.failureCounts.set(ip, count)

    if (count >= MAX_CONSECUTIVE_FAILURES) {
      this.bannedIps.set(ip, Date.now() + BAN_DURATION_MS)
      this.failureCounts.delete(ip)
      console.log(`[RemoteServer] Banned IP ${ip} for ${BAN_DURATION_MS / 1000}s`)
    }
  }

  private clearFailures(ip: string): void {
    this.failureCounts.delete(ip)
  }

  // ── Heartbeat ──────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now()
      for (const [clientId, client] of this.clients) {
        // Check inactivity
        if (now - client.lastActivity.getTime() > INACTIVITY_TIMEOUT_MS) {
          this.sendToClient(clientId, { type: 'session-expired', reason: 'Inactivity timeout' })
          client.ws.close(4408, 'Inactivity timeout')
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  // ── Pending approvals cleanup ──────────────────────────

  private clearPendingApprovals(): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pendingApprovals.clear()
  }

  // ── Sanitization ──────────────────────────────────────

  private sanitize(text: string): string {
    let sanitized = text
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }
    return sanitized
  }

  // ── Config management ─────────────────────────────────

  setCfToken(token: string | null): void {
    const db = getDatabase()
    if (token) {
      const encrypted = encryptApiKey(token)
      db.insert(settings)
        .values({ key: CF_TOKEN_KEY, value: encrypted, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: encrypted, updatedAt: new Date() }
        })
        .run()
      this.cfToken = token
    } else {
      db.delete(settings).where(eq(settings.key, CF_TOKEN_KEY)).run()
      this.cfToken = null
    }
  }

  setCfHostname(hostname: string | null): void {
    if (hostname) {
      setServerConfig('cf_hostname', hostname)
    } else {
      deleteServerConfig('cf_hostname')
    }
    this.cfHostname = hostname
  }

  setPort(port: number): void {
    this.port = port
    setServerConfig('port', String(port))
  }

  // ── Getters ───────────────────────────────────────────

  getStatus(): RemoteServerStatus {
    return this.status
  }

  getPort(): number {
    return this.port
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl
  }

  getConfig(): {
    enabled: boolean
    port: number
    isRunning: boolean
    connectedClients: number
    tunnelUrl: string | null
    cfHostname: string | null
    hasCfToken: boolean
  } {
    return {
      enabled: this.status === 'running',
      port: this.port,
      isRunning: this.status === 'running',
      connectedClients: this.getAuthenticatedClientCount(),
      tunnelUrl: this.tunnelUrl,
      cfHostname: this.cfHostname,
      hasCfToken: this.cfToken !== null
    }
  }

  getConnectedClients(): Array<{
    id: string
    ip: string
    userAgent: string
    connectedAt: string
    lastActivity: string
  }> {
    return Array.from(this.clients.values())
      .filter((c) => c.sessionToken !== null)
      .map((c) => ({
        id: c.id,
        ip: c.ip,
        userAgent: c.userAgent,
        connectedAt: c.connectedAt.toISOString(),
        lastActivity: c.lastActivity.toISOString()
      }))
  }

  disconnectClient(clientId: string): void {
    const client = this.clients.get(clientId)
    if (client) {
      this.sendToClient(clientId, { type: 'session-expired', reason: 'Disconnected by admin' })
      client.ws.close(4000, 'Disconnected by admin')
    }
  }

  private getAuthenticatedClientCount(): number {
    let count = 0
    for (const [, client] of this.clients) {
      if (client.sessionToken) count++
    }
    return count
  }

  // ── Status & notifications ────────────────────────────

  private setStatus(status: RemoteServerStatus): void {
    this.status = status
    this.notifyDesktop('remote-server:status-changed', {
      status,
      connectedClients: this.getAuthenticatedClientCount()
    })
  }

  private notifyDesktop(channel: string, data: unknown): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(channel, data)
  }
}

// Tiny nanoid for client IDs
function nanoid(size = 16): string {
  return crypto.randomBytes(size).toString('hex').slice(0, size)
}

export const remoteServerService = new RemoteServerService()
