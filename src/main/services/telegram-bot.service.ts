import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { encryptApiKey, decryptApiKey } from './credential.service'
import { serviceRegistry } from './registry'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import {
  getActiveSession,
  createSession,
  updateSession,
  deactivateSession,
  touchSessionActivity
} from '../db/queries/remote-sessions'
import { createConversation } from '../db/queries/conversations'

// ── Types ─────────────────────────────────────────────────

export type RemoteStatus = 'disconnected' | 'configuring' | 'pairing' | 'connected' | 'expired' | 'error'

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean }
    chat: { id: number; first_name?: string; username?: string }
    text?: string
    date: number
  }
  callback_query?: {
    id: string
    from: { id: number; first_name?: string }
    message?: { message_id: number; chat: { id: number } }
    data?: string
  }
}

interface PendingApproval {
  resolve: (approved: boolean) => void
  timer: ReturnType<typeof setTimeout>
  messageId?: number
}

// ── Sensitive patterns to sanitize ─────────────────────────

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/gi,
  /sk-proj-[a-zA-Z0-9_-]+/gi,
  /sk-ant-[a-zA-Z0-9_-]+/gi,
  /AIza[a-zA-Z0-9_-]{35}/gi,
  /xai-[a-zA-Z0-9_-]+/gi,
  /-----BEGIN[\s\S]*?-----END[^\n]+/g,
  /\d+:[A-Za-z0-9_-]{35,}/g, // Bot tokens
]

// ── Constants ─────────────────────────────────────────────

const TELEGRAM_API = 'https://api.telegram.org/bot'
const POLL_TIMEOUT = 30 // seconds
const MAX_MESSAGE_LENGTH = 4000
const STREAMING_DEBOUNCE_MS = 500
const PAIRING_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes
const MAX_PAIRING_ATTEMPTS = 5
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes
const CREDENTIAL_KEY = 'multi-llm:remote:telegram-token'
const ALLOWED_USER_KEY = 'multi-llm:remote:allowed-user-id'

// ── Service ───────────────────────────────────────────────

class TelegramBotService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private token: string | null = null
  private botUsername: string | null = null
  private allowedUserId: number | null = null
  private status: RemoteStatus = 'disconnected'
  private pollAbortController: AbortController | null = null
  private pollOffset = 0
  private isPolling = false
  private chatId: number | null = null
  private sessionId: string | null = null

  // Pairing
  private pairingCode: string | null = null
  private pairingExpiry: number | null = null
  private pairingAttempts = 0

  // Streaming
  private isStreaming = false
  private streamBuffer = ''
  private streamMessageId: number | null = null
  private streamDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastStreamUpdate = 0

  // Message queue (during streaming)
  private messageQueue: string[] = []

  // Tool approval
  private pendingApprovals = new Map<string, PendingApproval>()

  // Conversation bridge
  private pendingConversationId: string | null = null

  // Reconnection
  private reconnectDelay = 1000
  private maxReconnectDelay = 60000
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null

  // ── Lifecycle ─────────────────────────────────────────

  async init(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow

    // Load allowed user ID
    this.loadAllowedUserId()

    // Try to restore active session (only if allowedUserId is set — security gate)
    try {
      const session = getActiveSession()
      if (session && session.telegramChatId && this.allowedUserId) {
        // Restore token from credentials
        const db = getDatabase()
        const stored = db.select().from(settings).where(eq(settings.key, CREDENTIAL_KEY)).get()
        if (stored?.value) {
          try {
            this.token = decryptApiKey(stored.value)
            this.chatId = parseInt(session.telegramChatId, 10)
            this.sessionId = session.id
            this.botUsername = session.botUsername ?? null

            // Resume polling
            console.log('[Telegram] Resuming session from DB')
            this.setStatus('connected')
            this.startPolling()
            this.sendMessage('Session reprise apres redemarrage.')
            this.resetInactivityTimer()
          } catch {
            console.warn('[Telegram] Failed to decrypt stored token — deactivating stale session')
            deactivateSession(session.id)
          }
        } else {
          // Token missing from DB — clean up stale session
          console.warn('[Telegram] No token found for active session — deactivating')
          deactivateSession(session.id)
        }
      } else if (session && !this.allowedUserId) {
        // Security gate: no allowedUserId — clean up stale session
        console.warn('[Telegram] Active session without allowedUserId — deactivating')
        deactivateSession(session.id)
      }
    } catch (err) {
      console.warn('[Telegram] Failed to restore session:', err)
    }

    serviceRegistry.register('telegram', { stop: () => this.destroy() })
  }

  async configure(token: string): Promise<{ botUsername: string }> {
    // Validate token with getMe
    const result = await this.callTelegramApi('getMe', {}, token)
    if (!result.ok) {
      throw new Error('Token invalide — impossible de contacter le bot')
    }

    this.token = token
    this.botUsername = result.result.username

    // Store encrypted token
    const encrypted = encryptApiKey(token)
    const db = getDatabase()
    db.insert(settings)
      .values({ key: CREDENTIAL_KEY, value: encrypted, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: encrypted, updatedAt: new Date() }
      })
      .run()

    return { botUsername: result.result.username }
  }

  /**
   * Start a remote session.
   * @param conversationId — the active desktop conversation to continue on Telegram.
   *                          If omitted, a fallback "[Remote]" conversation is created at pairing time.
   */
  async start(conversationId?: string): Promise<{ pairingCode: string }> {
    if (!this.token) throw new Error('Token non configure')
    if (!this.allowedUserId) throw new Error('User ID Telegram requis avant de demarrer une session')

    // Deactivate any existing session
    const existing = getActiveSession()
    if (existing) {
      deactivateSession(existing.id)
    }

    // Create new session — store the conversationId the user was on
    const session = createSession({ botUsername: this.botUsername ?? undefined })
    this.sessionId = session.id

    // Pre-attach the active desktop conversation if provided
    if (conversationId) {
      updateSession(session.id, { conversationId })
    }
    this.pendingConversationId = conversationId ?? null

    // Generate pairing code
    this.pairingCode = this.generatePairingCode()
    this.pairingExpiry = Date.now() + PAIRING_EXPIRY_MS
    this.pairingAttempts = 0

    this.setStatus('pairing')
    this.startPolling()

    return { pairingCode: this.pairingCode }
  }

  async stop(): Promise<void> {
    // Send goodbye message
    if (this.chatId && this.token) {
      try {
        const session = this.sessionId ? getActiveSession() : null
        const duration = session?.pairedAt
          ? Math.round((Date.now() - session.pairedAt.getTime()) / 1000 / 60)
          : 0
        await this.sendMessage(`Session terminee. Duree : ${duration} min.`)
      } catch { /* ignore */ }
    }

    this.stopPolling()
    this.clearInactivityTimer()
    this.clearPendingApprovals()

    if (this.sessionId) {
      deactivateSession(this.sessionId)
    }

    this.chatId = null
    this.sessionId = null
    this.pairingCode = null
    this.pairingExpiry = null
    this.pendingConversationId = null
    this.isStreaming = false
    this.streamBuffer = ''
    this.streamMessageId = null
    this.messageQueue = []

    this.setStatus('disconnected')
  }

  async destroy(): Promise<void> {
    // Send final message before app quit
    if (this.chatId && this.token && this.status === 'connected') {
      try {
        await this.sendMessage('Application fermee. Session terminee.')
      } catch { /* ignore */ }
    }

    this.stopPolling()
    this.clearInactivityTimer()
    this.clearPendingApprovals()

    if (this.sessionId) {
      deactivateSession(this.sessionId)
    }
  }

  // ── Getters ─────────────────────────────────────────

  getStatus(): RemoteStatus {
    return this.status
  }

  getChatId(): number | null {
    return this.chatId
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  getConfig(): {
    hasToken: boolean
    botUsername: string | null
    allowedUserId: number | null
    status: RemoteStatus
    session: { id: string; chatId: string | null; isActive: boolean; autoApproveRead: boolean; autoApproveWrite: boolean; autoApproveBash: boolean; autoApproveList: boolean; autoApproveMcp: boolean } | null
  } {
    const session = this.sessionId ? getActiveSession() : null
    return {
      hasToken: this.token !== null,
      botUsername: this.botUsername,
      allowedUserId: this.allowedUserId,
      status: this.status,
      session: session ? {
        id: session.id,
        chatId: session.telegramChatId ?? null,
        isActive: session.isActive,
        autoApproveRead: session.autoApproveRead,
        autoApproveWrite: session.autoApproveWrite,
        autoApproveBash: session.autoApproveBash,
        autoApproveList: session.autoApproveList,
        autoApproveMcp: session.autoApproveMcp
      } : null
    }
  }

  // ── Pairing ─────────────────────────────────────────

  private generatePairingCode(): string {
    const n = crypto.randomInt(0, 1_000_000)
    return String(n).padStart(6, '0')
  }

  private async handlePairCommand(chatId: number, code: string): Promise<void> {
    // Check expiry
    if (!this.pairingCode || !this.pairingExpiry || Date.now() > this.pairingExpiry) {
      await this.sendMessageTo(chatId, 'Code expire. Relancez le pairing depuis le desktop.')
      return
    }

    // Check attempts
    this.pairingAttempts++
    if (this.pairingAttempts >= MAX_PAIRING_ATTEMPTS) {
      await this.sendMessageTo(chatId, 'Trop de tentatives. Relancez le pairing depuis le desktop.')
      this.pairingCode = null
      this.pairingExpiry = null
      return
    }

    // Validate code (timing-safe comparison to prevent side-channel attacks)
    // Normalize to exactly 6 chars to ensure equal buffer lengths for timingSafeEqual
    const codeStr = code.trim().slice(0, 6).padEnd(6)
    const expectedStr = this.pairingCode.padEnd(6)
    if (!crypto.timingSafeEqual(Buffer.from(codeStr), Buffer.from(expectedStr))) {
      await this.sendMessageTo(chatId, `Code incorrect (tentative ${this.pairingAttempts}/${MAX_PAIRING_ATTEMPTS}).`)
      return
    }

    // Pairing successful
    this.chatId = chatId
    this.pairingCode = null
    this.pairingExpiry = null

    // Use the desktop conversation if provided, otherwise create a fallback
    let convTitle = '[Remote] Session'
    if (this.pendingConversationId) {
      const { getConversation } = await import('../db/queries/conversations')
      const existing = getConversation(this.pendingConversationId)
      if (existing) {
        convTitle = existing.title
      }
    }
    const conversationId = this.pendingConversationId
      ?? createConversation(`[Remote] Session ${new Date().toLocaleDateString('fr-FR')}`).id

    if (this.sessionId) {
      updateSession(this.sessionId, {
        telegramChatId: String(chatId),
        pairedAt: new Date(),
        lastActivity: new Date(),
        conversationId
      })
    }
    this.pendingConversationId = null

    this.setStatus('connected')
    this.resetInactivityTimer()

    await this.sendMessage(`Connecte ! Conversation: "${convTitle}"\n\nCommandes:\n/status — infos session\n/model — modele actif\n/clear — nouvelle conversation\n/stop — terminer\n/help — aide`)

    // Notify desktop
    this.notifyDesktop('remote:status-changed', {
      status: 'connected',
      chatId: String(chatId)
    })
  }

  // ── Polling ─────────────────────────────────────────

  private startPolling(): void {
    if (this.isPolling) return
    this.isPolling = true
    this.reconnectDelay = 1000
    this.pollLoop()
  }

  private stopPolling(): void {
    this.isPolling = false
    if (this.pollAbortController) {
      this.pollAbortController.abort()
      this.pollAbortController = null
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.isPolling) {
      try {
        this.pollAbortController = new AbortController()

        const result = await this.callTelegramApi('getUpdates', {
          offset: this.pollOffset,
          timeout: POLL_TIMEOUT,
          allowed_updates: ['message', 'callback_query']
        }, undefined, this.pollAbortController.signal)

        if (!result.ok) {
          if (result.error_code === 401) {
            // Token revoked
            this.setStatus('disconnected')
            this.stopPolling()
            return
          }
          throw new Error(result.description || 'Poll failed')
        }

        // Reset reconnect delay on success
        this.reconnectDelay = 1000

        for (const update of (result.result as TelegramUpdate[])) {
          this.pollOffset = update.update_id + 1
          await this.handleUpdate(update)
        }
      } catch (err) {
        if (!this.isPolling) return // Stopped intentionally

        const errorMsg = err instanceof Error ? err.message : String(err)
        if (errorMsg.includes('aborted') || errorMsg.includes('AbortError')) return

        console.warn(`[Telegram] Poll error: ${errorMsg}, reconnecting in ${this.reconnectDelay}ms`)

        // Check inactivity
        const session = this.sessionId ? getActiveSession() : null
        if (session?.lastActivity && Date.now() - session.lastActivity.getTime() > INACTIVITY_TIMEOUT_MS) {
          this.setStatus('expired')
          this.stopPolling()
          return
        }

        // Backoff
        await new Promise(resolve => setTimeout(resolve, this.reconnectDelay))
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
      }
    }
  }

  // ── Update handler ──────────────────────────────────

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    // Handle callback queries (tool approval)
    if (update.callback_query) {
      // Reject if no allowedUserId configured or mismatch
      if (!this.allowedUserId || update.callback_query.from.id !== this.allowedUserId) return
      await this.handleCallbackQuery(update.callback_query)
      return
    }

    if (!update.message?.text) return

    const chatId = update.message.chat.id
    const text = update.message.text.trim()

    // Check allowed user ID on every message (mandatory — reject if not configured)
    const fromUserId = update.message.from?.id ?? update.message.chat.id
    if (!this.allowedUserId || fromUserId !== this.allowedUserId) {
      // Silently ignore messages from unauthorized users
      return
    }

    // During pairing, accept /pair from anyone (already filtered by allowedUserId above)
    if (text.startsWith('/pair')) {
      const code = text.replace('/pair', '').trim()
      await this.handlePairCommand(chatId, code)
      return
    }

    // After pairing, verify chatId
    if (this.chatId && chatId !== this.chatId) {
      await this.sendMessageTo(chatId, 'Session non autorisee.')
      return
    }

    // Must be paired
    if (!this.chatId) {
      await this.sendMessageTo(chatId, 'Envoyez /pair CODE pour vous connecter.')
      return
    }

    // Update activity
    this.resetInactivityTimer()
    if (this.sessionId) {
      touchSessionActivity(this.sessionId)
    }

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(text)
      return
    }

    // Queue message if streaming
    if (this.isStreaming) {
      this.messageQueue.push(text)
      await this.sendMessage('Message en attente (reponse en cours)...')
      return
    }

    // Forward to chat handler
    this.emit('message', {
      text,
      chatId,
      sessionId: this.sessionId
    })
  }

  private async handleCommand(text: string): Promise<void> {
    const cmd = text.split(' ')[0].toLowerCase()

    switch (cmd) {
      case '/stop':
        await this.stop()
        break

      case '/status': {
        const session = this.sessionId ? getActiveSession() : null
        const duration = session?.pairedAt
          ? Math.round((Date.now() - session.pairedAt.getTime()) / 1000 / 60)
          : 0
        await this.sendMessage(
          `Status: ${this.status}\n` +
          `Duree: ${duration} min\n` +
          `Bot: @${this.botUsername ?? '?'}`
        )
        break
      }

      case '/model':
        // Will be populated by chat integration
        this.emit('command:model')
        break

      case '/clear': {
        // Create new conversation
        const conv = createConversation(`[Remote] Session ${new Date().toLocaleDateString('fr-FR')} (suite)`)
        if (this.sessionId) {
          updateSession(this.sessionId, { conversationId: conv.id })
        }
        await this.sendMessage(`Nouvelle conversation : "${conv.title}"`)
        this.emit('command:clear', { conversationId: conv.id })
        break
      }

      case '/help':
        await this.sendMessage(
          'Commandes :\n' +
          '/status — infos session\n' +
          '/model — modele actif\n' +
          '/clear — nouvelle conversation\n' +
          '/stop — terminer la session\n' +
          '/help — cette aide\n\n' +
          'Tout autre message est envoye au LLM.'
        )
        break

      default:
        await this.sendMessage(`Commande inconnue : ${cmd}. Tapez /help.`)
    }
  }

  private async handleCallbackQuery(query: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
    if (!query.data) return

    // Verify callback comes from the correct chat
    if (this.chatId && query.message?.chat?.id !== this.chatId) return

    // Answer callback to remove loading state
    await this.callTelegramApi('answerCallbackQuery', { callback_query_id: query.id })

    // Parse: "approve:toolCallId" or "deny:toolCallId"
    const [action, toolCallId] = query.data.split(':')
    if (!toolCallId) return

    const pending = this.pendingApprovals.get(toolCallId)
    if (!pending) {
      // Already resolved or expired
      return
    }

    clearTimeout(pending.timer)
    this.pendingApprovals.delete(toolCallId)

    const approved = action === 'approve'
    pending.resolve(approved)

    // Edit the message to show the result
    if (pending.messageId && query.message?.chat?.id) {
      const emoji = approved ? '✓' : '✗'
      await this.callTelegramApi('editMessageReplyMarkup', {
        chat_id: query.message.chat.id,
        message_id: pending.messageId,
        reply_markup: { inline_keyboard: [] }
      })
    }
  }

  // ── Telegram API ────────────────────────────────────

  private async callTelegramApi(
    method: string,
    body: Record<string, unknown>,
    tokenOverride?: string,
    signal?: AbortSignal
  ): Promise<{ ok: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } }> {
    const t = tokenOverride ?? this.token
    if (!t) throw new Error('No token')

    const url = `${TELEGRAM_API}${t}/${method}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      })

      const data = await response.json() as { ok: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } }

      // Handle rate limit (429)
      if (data.error_code === 429 && data.parameters?.retry_after) {
        const retryAfter = data.parameters.retry_after * 1000
        await new Promise(resolve => setTimeout(resolve, retryAfter))
        // Retry once
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal
        })
        return await retryResponse.json() as typeof data
      }

      return data
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        throw err
      }
      throw new Error(`Telegram API error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Sending messages ────────────────────────────────

  async sendMessage(text: string): Promise<number | null> {
    if (!this.chatId) return null
    return this.sendMessageTo(this.chatId, text)
  }

  private async sendMessageTo(chatId: number, text: string): Promise<number | null> {
    const sanitized = this.sanitizeForTelegram(text)
    const chunks = this.splitText(sanitized, MAX_MESSAGE_LENGTH)
    let lastMessageId: number | null = null

    for (const chunk of chunks) {
      // Try with MarkdownV2 first, fallback to plain text
      let result = await this.callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: this.formatForTelegram(chunk),
        parse_mode: 'MarkdownV2'
      })

      if (!result.ok && result.error_code === 400) {
        // Fallback to plain text
        result = await this.callTelegramApi('sendMessage', {
          chat_id: chatId,
          text: chunk
        })
      }

      if (result.ok && result.result) {
        lastMessageId = (result.result as { message_id: number }).message_id
      }
    }

    return lastMessageId
  }

  private async editMessage(messageId: number, text: string): Promise<void> {
    if (!this.chatId) return

    const sanitized = this.sanitizeForTelegram(text)

    // If text is too long, just send the last part
    const truncated = sanitized.length > MAX_MESSAGE_LENGTH
      ? '...' + sanitized.slice(-(MAX_MESSAGE_LENGTH - 3))
      : sanitized

    let result = await this.callTelegramApi('editMessageText', {
      chat_id: this.chatId,
      message_id: messageId,
      text: this.formatForTelegram(truncated),
      parse_mode: 'MarkdownV2'
    })

    if (!result.ok && result.error_code === 400) {
      // Fallback to plain text
      await this.callTelegramApi('editMessageText', {
        chat_id: this.chatId,
        message_id: messageId,
        text: truncated
      })
    }
  }

  // ── Streaming ───────────────────────────────────────

  async startStreaming(): Promise<void> {
    if (!this.chatId) return
    this.isStreaming = true
    this.streamBuffer = ''

    const msgId = await this.sendMessage('▍')
    this.streamMessageId = msgId
    this.lastStreamUpdate = Date.now()
  }

  pushChunk(text: string): void {
    if (!this.isStreaming || !this.streamMessageId) return
    this.streamBuffer += text

    // Debounce updates
    if (this.streamDebounceTimer) clearTimeout(this.streamDebounceTimer)
    this.streamDebounceTimer = setTimeout(() => {
      this.flushStreamBuffer()
    }, STREAMING_DEBOUNCE_MS)
  }

  private async flushStreamBuffer(): Promise<void> {
    if (!this.streamMessageId || !this.streamBuffer) return

    // Limit frequency to avoid rate limiting
    const now = Date.now()
    if (now - this.lastStreamUpdate < 400) return

    this.lastStreamUpdate = now
    await this.editMessage(this.streamMessageId, this.streamBuffer + ' ▍')
  }

  async endStreaming(finalText: string): Promise<void> {
    if (this.streamDebounceTimer) {
      clearTimeout(this.streamDebounceTimer)
      this.streamDebounceTimer = null
    }

    this.isStreaming = false

    if (this.streamMessageId && this.chatId) {
      const sanitized = this.sanitizeForTelegram(finalText)
      if (sanitized.length <= MAX_MESSAGE_LENGTH) {
        await this.editMessage(this.streamMessageId, sanitized)
      } else {
        // Delete the streaming message and send splits
        try {
          await this.callTelegramApi('deleteMessage', {
            chat_id: this.chatId,
            message_id: this.streamMessageId
          })
        } catch { /* ignore */ }
        await this.sendMessage(finalText)
      }
    }

    this.streamMessageId = null
    this.streamBuffer = ''

    // Drain queued messages
    while (this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift()!
      this.emit('message', {
        text: queued,
        chatId: this.chatId,
        sessionId: this.sessionId
      })
      // Wait a bit between queued messages
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  async sendToolResult(toolName: string, output: unknown): Promise<void> {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2)
    const truncated = outputStr.length > 1000 ? outputStr.slice(0, 1000) + '...' : outputStr
    // Sanitize tool output to avoid leaking API keys or sensitive data
    const sanitized = this.sanitizeForTelegram(truncated)
    await this.sendMessage(`[${toolName}] ${sanitized}`)
  }

  // ── Tool Approval ───────────────────────────────────

  async requestApproval(toolCallId: string, toolName: string, args: Record<string, unknown>): Promise<boolean> {
    if (!this.chatId) return true // No remote, auto-approve

    const argsStr = JSON.stringify(args, null, 2)
    const truncatedArgs = argsStr.length > 500 ? argsStr.slice(0, 500) + '...' : argsStr

    const text = `Outil: ${toolName}\nArgs: ${truncatedArgs}`

    const result = await this.callTelegramApi('sendMessage', {
      chat_id: this.chatId,
      text,
      reply_markup: {
        inline_keyboard: [[
          { text: 'Approuver', callback_data: `approve:${toolCallId}` },
          { text: 'Refuser', callback_data: `deny:${toolCallId}` }
        ]]
      }
    })

    const messageId = result.ok ? (result.result as { message_id: number }).message_id : undefined

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(toolCallId)
        resolve(false) // Timeout = deny
      }, APPROVAL_TIMEOUT_MS)

      this.pendingApprovals.set(toolCallId, { resolve, timer, messageId })
    })
  }

  // ── MarkdownV2 formatting ──────────────────────────

  private formatForTelegram(text: string): string {
    // Split on code blocks, escape only non-code parts
    const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g)

    return parts.map((part, i) => {
      if (part.startsWith('```') || part.startsWith('`')) {
        // Code block — escape only the special chars that Telegram requires
        return part
      }
      // Regular text — escape MarkdownV2 special chars per Telegram spec:
      // \ _ * [ ] ( ) ~ ` > # + - = | { } . !
      // The backslash MUST be escaped FIRST, otherwise the escape characters
      // we add for the other chars would themselves get re-escaped on a
      // second pass and double up.
      // History: alert #3 added the backtick (S67 first CodeQL pass);
      // alert #6 added the backslash (S67 second CodeQL pass).
      return part
        .replace(/\\/g, '\\\\')
        .replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1')
    }).join('')
  }

  // ── Text splitting ─────────────────────────────────

  private splitText(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text]

    const chunks: string[] = []
    let remaining = text
    let inCodeBlock = false

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push((inCodeBlock ? '```\n' : '') + remaining)
        break
      }

      let cutPoint = maxLength

      // Try to cut on paragraph boundary
      const paraIdx = remaining.lastIndexOf('\n\n', maxLength)
      if (paraIdx > maxLength * 0.3) {
        cutPoint = paraIdx
      } else {
        // Try line boundary
        const lineIdx = remaining.lastIndexOf('\n', maxLength)
        if (lineIdx > maxLength * 0.3) {
          cutPoint = lineIdx
        }
      }

      let chunk = remaining.slice(0, cutPoint)

      // Handle code block boundaries
      const openBlocks = (chunk.match(/```/g) || []).length
      if (openBlocks % 2 !== 0) {
        chunk += '\n```'
        inCodeBlock = true
      } else {
        inCodeBlock = false
      }

      chunks.push(chunk)
      remaining = remaining.slice(cutPoint).trimStart()

      if (inCodeBlock && remaining.length > 0) {
        remaining = '```\n' + remaining
      }
    }

    return chunks
  }

  // ── Sanitization ───────────────────────────────────

  private sanitizeForTelegram(text: string): string {
    let sanitized = text
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }
    return sanitized
  }

  // ── Status & Notifications ─────────────────────────

  private setStatus(status: RemoteStatus): void {
    this.status = status
    this.notifyDesktop('remote:status-changed', { status })
  }

  private notifyDesktop(channel: string, data: unknown): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send(channel, data)
  }

  // ── Inactivity timer ──────────────────────────────

  private resetInactivityTimer(): void {
    this.clearInactivityTimer()
    this.inactivityTimer = setTimeout(() => {
      if (this.status === 'connected') {
        this.setStatus('expired')
        this.sendMessage('Session expiree (inactivite 10 min). Envoyez un message pour reprendre.')
          .catch(() => {})
      }
    }, INACTIVITY_TIMEOUT_MS)
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer)
      this.inactivityTimer = null
    }
  }

  // ── Pending approvals cleanup ─────────────────────

  private clearPendingApprovals(): void {
    for (const [id, pending] of this.pendingApprovals.entries()) {
      clearTimeout(pending.timer)
      pending.resolve(false)
    }
    this.pendingApprovals.clear()
  }

  // ── Token management ──────────────────────────────

  async deleteToken(): Promise<void> {
    if (this.status !== 'disconnected') {
      await this.stop()
    }

    this.token = null
    this.botUsername = null

    // Remove from DB
    const db = getDatabase()
    db.delete(settings).where(eq(settings.key, CREDENTIAL_KEY)).run()
  }

  hasToken(): boolean {
    return this.token !== null
  }

  // ── Allowed User ID ────────────────────────────────

  private loadAllowedUserId(): void {
    try {
      const db = getDatabase()
      const stored = db.select().from(settings).where(eq(settings.key, ALLOWED_USER_KEY)).get()
      if (stored?.value) {
        const parsed = parseInt(stored.value, 10)
        if (!isNaN(parsed) && parsed > 0) {
          this.allowedUserId = parsed
        }
      }
    } catch {
      console.warn('[Telegram] Failed to load allowed user ID')
    }
  }

  setAllowedUserId(userId: number | null): void {
    this.allowedUserId = userId
    const db = getDatabase()
    if (userId) {
      db.insert(settings)
        .values({ key: ALLOWED_USER_KEY, value: String(userId), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: String(userId), updatedAt: new Date() }
        })
        .run()
    } else {
      db.delete(settings).where(eq(settings.key, ALLOWED_USER_KEY)).run()
    }
  }

  getAllowedUserId(): number | null {
    return this.allowedUserId
  }
}

export const telegramBotService = new TelegramBotService()
