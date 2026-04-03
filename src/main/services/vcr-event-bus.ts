import { EventEmitter } from 'events'
import type { ToolResultMeta } from '../../preload/types'

export interface VcrEventMap {
  'session-start': Record<string, never>
  'session-stop': { reason: 'manual' | 'conversation-end' }
  'user-message': { content: string; attachments?: string[] }
  'text-delta': { text: string }
  'reasoning-delta': { text: string }
  'tool-call': { toolCallId: string; toolName: string; args: Record<string, unknown> }
  'tool-result': {
    toolCallId: string
    status: 'success' | 'error'
    result?: string
    error?: string
    meta?: ToolResultMeta
  }
  'permission-decision': {
    toolCallId: string
    decision: 'auto-allow' | 'allow' | 'deny' | 'ask'
    rule?: string
  }
  'permission-response': {
    toolCallId: string
    response: 'allow' | 'deny' | 'allow-session'
    responseTimeMs: number
  }
  'plan-proposed': { plan: Record<string, unknown> }
  'plan-approved': { editedSteps?: Record<string, unknown>[] }
  'plan-step': { stepIndex: number; status: 'running' | 'done' | 'failed' }
  'finish': { tokensIn: number; tokensOut: number; cost: number; responseTimeMs: number }
  'file-diff': { filePath: string; oldContent: string; newContent: string }
}

export type VcrEventName = keyof VcrEventMap

class VcrEventBusImpl extends EventEmitter {
  emitVcr<K extends VcrEventName>(event: K, data: VcrEventMap[K]): void {
    this.emit(event, data)
  }

  onVcr<K extends VcrEventName>(event: K, listener: (data: VcrEventMap[K]) => void): void {
    this.on(event, listener as (...args: unknown[]) => void)
  }

  offVcr<K extends VcrEventName>(event: K, listener: (data: VcrEventMap[K]) => void): void {
    this.off(event, listener as (...args: unknown[]) => void)
  }
}

export const vcrEventBus = new VcrEventBusImpl()
