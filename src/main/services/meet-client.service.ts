import { BrowserWindow } from 'electron'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type { MeetPermissions } from '../../preload/types'

interface MeetClientState {
  sessionId: string | null
  guestName: string | null
  conversationId: string | null
  permissions: MeetPermissions
}

class MeetClientService extends EventEmitter {
  private mainWindow: BrowserWindow | null = null
  private ws: WebSocket | null = null
  private state: MeetClientState = {
    sessionId: null,
    guestName: null,
    conversationId: null,
    permissions: { guestCanLlm: false, guestAutoApprove: false, guestVisibility: 'response-only' }
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async join(hostUrl: string, inviteCode: string): Promise<void> {
    if (this.ws) {
      throw new Error('Already connected to a Meet session')
    }
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(hostUrl)
      this.ws.on('open', () => {
        this.ws!.send(JSON.stringify({ type: 'meet:join', inviteCode }))
      })
      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          this.handleMessage(msg, resolve, reject)
        } catch {
          /* ignore malformed messages */
        }
      })
      this.ws.on('close', (code, reason) => {
        this.cleanup()
        this.notifyRenderer({ type: 'meet:end' })
        this.emit('disconnected', { code, reason: reason.toString() })
      })
      this.ws.on('error', (err) => {
        this.cleanup()
        reject(err)
      })
    })
  }

  leave(): void {
    this.sendToHost({ type: 'meet:leave' })
    this.ws?.close()
    this.cleanup()
  }

  sendChat(messageId: string, content: string): void {
    this.sendToHost({ type: 'meet:chat', messageId, content, sender: 'guest' })
  }

  sendLlmRequest(messageId: string, content: string): void {
    if (!this.state.permissions.guestCanLlm) {
      throw new Error('LLM access disabled')
    }
    this.sendToHost({ type: 'meet:llm-request', messageId, content })
  }

  sendTyping(): void {
    this.sendToHost({ type: 'meet:typing', sender: 'guest' })
  }

  sendPresence(status: 'online' | 'away'): void {
    this.sendToHost({ type: 'meet:presence', sender: 'guest', status })
  }

  getState(): MeetClientState {
    return { ...this.state }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private handleMessage(
    msg: Record<string, unknown>,
    resolveJoin?: (value: void) => void,
    rejectJoin?: (reason: Error) => void
  ): void {
    switch (msg.type) {
      case 'meet:welcome':
        this.state.sessionId = String(msg.sessionId)
        this.state.guestName = String(msg.guestName)
        this.state.conversationId = String(msg.conversationId)
        this.state.permissions = msg.permissions as MeetPermissions
        this.notifyRenderer(msg)
        this.emit('connected', this.state)
        resolveJoin?.()
        break
      case 'meet:rejected':
        rejectJoin?.(new Error(String(msg.reason)))
        this.cleanup()
        break
      case 'meet:chat':
      case 'meet:chunk':
      case 'meet:message':
      case 'meet:llm-approved':
      case 'meet:llm-rejected':
      case 'meet:typing':
      case 'meet:presence':
        this.notifyRenderer(msg)
        break
      case 'meet:permissions':
        this.state.permissions = msg.permissions as MeetPermissions
        this.notifyRenderer(msg)
        break
      case 'meet:end':
        this.notifyRenderer(msg)
        this.cleanup()
        break
    }
  }

  private sendToHost(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private notifyRenderer(event: Record<string, unknown>): void {
    this.mainWindow?.webContents.send('meet:event', event)
  }

  private cleanup(): void {
    this.ws = null
    this.state = {
      sessionId: null,
      guestName: null,
      conversationId: null,
      permissions: { guestCanLlm: false, guestAutoApprove: false, guestVisibility: 'response-only' }
    }
  }
}

export const meetClientService = new MeetClientService()
