import { createWriteStream, readFileSync, existsSync, type WriteStream } from 'fs'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { app } from 'electron'
import { getVcrRecordingsPath } from '../utils/paths'
import { vcrEventBus, type VcrEventName, type VcrEventMap } from './vcr-event-bus'
import type {
  VcrRecordingHeader,
  VcrRecording,
  VcrEvent,
  ActiveRecordingInfo,
  VcrEventType
} from '../../preload/types'

interface ActiveRecording {
  recordingId: string
  conversationId: string
  filePath: string
  writeStream: WriteStream
  startedAt: number
  eventCount: number
  toolCallCount: number
  fullCapture: boolean
}

const LISTENED_EVENTS: VcrEventName[] = [
  'session-start', 'session-stop', 'user-message',
  'text-delta', 'reasoning-delta',
  'tool-call', 'tool-result',
  'permission-decision', 'permission-response',
  'plan-proposed', 'plan-approved', 'plan-step',
  'file-diff', 'finish'
]

class VcrRecorderService {
  private active: ActiveRecording | null = null
  private listeners: Map<string, (data: unknown) => void> = new Map()
  private lastRecordingFilePath: string | null = null

  startRecording(
    conversationId: string,
    options?: { fullCapture?: boolean; modelId?: string; providerId?: string; workspacePath?: string; roleId?: string }
  ): { recordingId: string } {
    if (this.active) {
      throw new Error('A recording is already active')
    }

    const timestamp = Date.now()
    const recordingId = `${conversationId}_${timestamp}_${nanoid(6)}`
    const filePath = join(getVcrRecordingsPath(), `${recordingId}.vcr`)
    // Always fullCapture
    const fullCapture = true

    const writeStream = createWriteStream(filePath, { flags: 'a', encoding: 'utf-8' })

    const header: VcrRecordingHeader = {
      recordingId,
      conversationId,
      modelId: options?.modelId ?? 'unknown',
      providerId: options?.providerId ?? 'unknown',
      workspacePath: options?.workspacePath ?? '',
      roleId: options?.roleId,
      fullCapture,
      startedAt: timestamp,
      metadata: { appVersion: app.getVersion() }
    }
    writeStream.write(JSON.stringify(header) + '\n')

    this.active = {
      recordingId,
      conversationId,
      filePath,
      writeStream,
      startedAt: timestamp,
      eventCount: 0,
      toolCallCount: 0,
      fullCapture
    }

    for (const eventName of LISTENED_EVENTS) {
      const listener = (data: unknown): void => {
        this.captureEvent(eventName as VcrEventType, data as Record<string, unknown>)
      }
      this.listeners.set(eventName, listener)
      vcrEventBus.onVcr(eventName, listener as (data: VcrEventMap[typeof eventName]) => void)
    }

    this.captureEvent('session-start', {})

    console.log(`[VCR] Recording started: ${recordingId}`)
    return { recordingId }
  }

  stopRecording(): { recordingId: string; duration: number; eventCount: number } {
    if (!this.active) {
      throw new Error('No active recording')
    }

    this.captureEvent('session-stop', { reason: 'manual' })

    for (const [eventName, listener] of this.listeners) {
      vcrEventBus.offVcr(eventName as VcrEventName, listener as (data: VcrEventMap[VcrEventName]) => void)
    }
    this.listeners.clear()

    const { recordingId, startedAt, eventCount, filePath } = this.active
    const duration = Date.now() - startedAt

    this.active.writeStream.end()
    this.lastRecordingFilePath = filePath
    this.active = null

    console.log(`[VCR] Recording stopped: ${recordingId} (${eventCount} events, ${duration}ms)`)
    return { recordingId, duration, eventCount }
  }

  isRecording(): boolean {
    return this.active !== null
  }

  getActiveRecording(): ActiveRecordingInfo | null {
    if (!this.active) return null
    return {
      recordingId: this.active.recordingId,
      conversationId: this.active.conversationId,
      startedAt: this.active.startedAt,
      eventCount: this.active.eventCount,
      toolCallCount: this.active.toolCallCount,
      fullCapture: this.active.fullCapture
    }
  }

  /**
   * Returns the file path of the just-stopped recording.
   */
  getLastRecordingPath(): string | null {
    return this.lastRecordingFilePath
  }

  /**
   * Parse a .vcr file into a VcrRecording object.
   */
  parseRecordingFile(filePath: string): VcrRecording {
    if (!existsSync(filePath)) {
      throw new Error(`Recording file not found: ${filePath}`)
    }

    const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
    if (lines.length === 0) {
      throw new Error(`Empty recording file: ${filePath}`)
    }

    const header = JSON.parse(lines[0]) as VcrRecordingHeader
    const events: VcrEvent[] = []

    for (let i = 1; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]) as [number, string, Record<string, unknown>]
        events.push({
          offsetMs: parsed[0],
          type: parsed[1] as VcrEventType,
          data: parsed[2]
        })
      } catch {
        // Skip malformed lines
      }
    }

    return { header, events }
  }

  private captureEvent(type: VcrEventType, data: Record<string, unknown>): void {
    if (!this.active) return
    // file-diff always captured (fullCapture is always true now)

    const offsetMs = Date.now() - this.active.startedAt
    const line = JSON.stringify([offsetMs, type, data])
    this.active.writeStream.write(line + '\n')
    this.active.eventCount++

    if (type === 'tool-call') {
      this.active.toolCallCount++
    }
  }
}

export const vcrRecorderService = new VcrRecorderService()
