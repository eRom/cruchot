import type { VcrEvent } from '../../preload/types'

const MASK = '*********'

// PII detection patterns — always active, always mask with *********
const PII_PATTERNS: Array<{ regex: RegExp }> = [
  // IPv4 addresses
  { regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
  // Email addresses
  { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  // Phone numbers (international & local formats)
  { regex: /(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g },
  // API keys — generic: long alphanumeric tokens (32+ chars)
  { regex: /\b[A-Za-z0-9_\-]{32,}\b/g },
  // URL secrets: ?key=..., ?token=..., ?secret=..., ?password=...
  { regex: /(?<=[?&](?:key|token|secret|password|api_key|apikey)=)[^&\s"']+/gi },
  // Bearer tokens in headers
  { regex: /(?<=Bearer\s)[A-Za-z0-9._\-]+/g }
]

class VcrAnonymizerService {
  private username: string | null = null

  constructor() {
    this.username = process.env.HOME?.split('/').pop() ?? process.env.USERPROFILE?.split('\\').pop() ?? null
  }

  private anonymizeString(text: string): string {
    // Anonymize user home paths
    if (this.username) {
      const homePattern = new RegExp(
        `(/Users/${this.username}/|/home/${this.username}/|C:\\\\Users\\\\${this.username}\\\\)`,
        'g'
      )
      text = text.replace(homePattern, MASK)
    }

    // Apply all PII patterns — replace with *********
    for (const { regex } of PII_PATTERNS) {
      regex.lastIndex = 0
      text = text.replace(regex, MASK)
    }

    return text
  }

  private anonymizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.anonymizeString(value)
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.anonymizeValue(item))
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        result[k] = this.anonymizeValue(v)
      }
      return result
    }
    return value
  }

  private anonymizeEventData(event: VcrEvent): VcrEvent {
    const data = { ...event.data }

    switch (event.type) {
      case 'user-message': {
        if (typeof data['content'] === 'string') {
          data['content'] = this.anonymizeString(data['content'] as string)
        }
        // Strip image attachments
        if (Array.isArray(data['attachments'])) {
          data['attachments'] = []
        }
        break
      }
      case 'text-delta':
      case 'reasoning-delta': {
        if (typeof data['text'] === 'string') {
          data['text'] = this.anonymizeString(data['text'] as string)
        }
        break
      }
      case 'tool-call': {
        if (data['args'] !== undefined) {
          data['args'] = this.anonymizeValue(data['args'])
        }
        break
      }
      case 'tool-result': {
        if (data['result'] !== undefined) {
          data['result'] = this.anonymizeValue(data['result'])
        }
        break
      }
      case 'file-diff': {
        if (typeof data['filePath'] === 'string') {
          data['filePath'] = this.anonymizeString(data['filePath'] as string)
        }
        if (typeof data['oldContent'] === 'string') {
          data['oldContent'] = this.anonymizeString(data['oldContent'] as string)
        }
        if (typeof data['newContent'] === 'string') {
          data['newContent'] = this.anonymizeString(data['newContent'] as string)
        }
        break
      }
      default:
        break
    }

    return { ...event, data }
  }

  /**
   * Anonymize an array of VCR events. Returns new array with anonymized copies.
   * All PII is replaced with *********.
   */
  anonymizeEvents(events: VcrEvent[]): VcrEvent[] {
    return events.map((event) => this.anonymizeEventData(event))
  }

  /**
   * Anonymize a recording header (workspace paths, etc.)
   */
  anonymizeHeader(header: Record<string, unknown>): Record<string, unknown> {
    const result = { ...header }
    if (typeof result.workspacePath === 'string') {
      result.workspacePath = this.anonymizeString(result.workspacePath as string)
    }
    return result
  }
}

export const vcrAnonymizerService = new VcrAnonymizerService()
