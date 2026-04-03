import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { VcrEvent } from '../../preload/types'

interface AnonymizeRule {
  pattern: string
  flags?: string
  prefix: string
}

const DEFAULT_RULES: AnonymizeRule[] = [
  // IPv4 addresses
  { pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', prefix: 'IP' },
  // Email addresses
  { pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}', prefix: 'EMAIL' },
  // API keys — generic: long alphanumeric tokens (32+ chars)
  { pattern: '\\b[A-Za-z0-9_\\-]{32,}\\b', prefix: 'TOKEN' },
  // URL secrets: ?key=..., ?token=..., ?secret=..., ?password=...
  {
    pattern: '(?<=[?&](?:key|token|secret|password|api_key|apikey)=)[^&\\s"\']+',
    flags: 'gi',
    prefix: 'SECRET'
  },
  // Bearer tokens in headers
  {
    pattern: '(?<=Bearer\\s)[A-Za-z0-9._\\-]+',
    flags: 'g',
    prefix: 'BEARER'
  }
]

class VcrAnonymizerService {
  private mapping: Map<string, string> = new Map()
  private counters: Map<string, number> = new Map()
  private rules: Array<{ regex: RegExp; prefix: string }> = []
  private username: string | null = null

  constructor() {
    this.username = process.env.HOME?.split('/').pop() ?? process.env.USERPROFILE?.split('\\').pop() ?? null
    this.loadRules()
  }

  private loadRules(): void {
    const customRules: AnonymizeRule[] = []
    try {
      const rulesPath = join(app.getPath('userData'), 'vcr-anonymize-rules.json')
      if (existsSync(rulesPath)) {
        const raw = readFileSync(rulesPath, 'utf-8')
        const parsed = JSON.parse(raw) as AnonymizeRule[]
        if (Array.isArray(parsed)) {
          customRules.push(...parsed)
        }
      }
    } catch {
      // Ignore — use defaults only
    }

    const allRules = [...DEFAULT_RULES, ...customRules]
    this.rules = allRules.map((r) => ({
      regex: new RegExp(r.pattern, r.flags ?? 'g'),
      prefix: r.prefix
    }))
  }

  private getReplacement(value: string, prefix: string): string {
    const existing = this.mapping.get(value)
    if (existing) return existing

    const count = (this.counters.get(prefix) ?? 0) + 1
    this.counters.set(prefix, count)
    const replacement = `${prefix}-${String(count).padStart(3, '0')}`
    this.mapping.set(value, replacement)
    return replacement
  }

  private anonymizeString(text: string): string {
    // First, anonymize user home paths (e.g. /Users/john/ → /Users/user1/)
    if (this.username) {
      const homePattern = new RegExp(
        `(/Users/${this.username}/|/home/${this.username}/|C:\\\\Users\\\\${this.username}\\\\)`,
        'g'
      )
      text = text.replace(homePattern, (match) => {
        return this.getReplacement(match, 'PATH').replace(/PATH-\d+/, '/Users/user1/')
      })
    }

    // Apply all regex rules
    for (const { regex, prefix } of this.rules) {
      // Reset lastIndex for global regexes
      regex.lastIndex = 0
      text = text.replace(regex, (match) => this.getReplacement(match, prefix))
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
   * The internal mapping accumulates across calls (same input → same replacement).
   */
  anonymizeEvents(events: VcrEvent[]): VcrEvent[] {
    return events.map((event) => this.anonymizeEventData(event))
  }

  /**
   * Returns the correspondence table built during anonymization.
   */
  getMapping(): Map<string, string> {
    return new Map(this.mapping)
  }

  /**
   * Reset state (mapping + counters) — useful between exports.
   */
  reset(): void {
    this.mapping.clear()
    this.counters.clear()
  }
}

export const vcrAnonymizerService = new VcrAnonymizerService()
