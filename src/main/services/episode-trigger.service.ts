import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { episodeExtractorService } from './episode-extractor.service'

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

class EpisodeTriggerService {
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private extractingSet = new Set<string>()
  private activeConversationId: string | null = null
  private enabled = false

  init(): void {
    this.enabled = this.isEpisodeMemoryEnabled()
    if (this.enabled) {
      console.log('[EpisodeTrigger] Initialized')
    }
  }

  onConversationChanged(newConversationId: string): void {
    if (!this.enabled) return

    const previousId = this.activeConversationId
    this.activeConversationId = newConversationId

    if (previousId) {
      this.clearIdleTimer(previousId)
      this.triggerExtraction(previousId)
    }

    this.resetIdleTimer(newConversationId)
  }

  onMessageSent(conversationId: string): void {
    if (!this.enabled) return
    this.activeConversationId = conversationId
    this.resetIdleTimer(conversationId)
  }

  async onAppQuitting(): Promise<void> {
    if (!this.enabled) return

    for (const [, timer] of this.idleTimers) {
      clearTimeout(timer)
    }
    this.idleTimers.clear()

    if (this.activeConversationId && !this.extractingSet.has(this.activeConversationId)) {
      try {
        await episodeExtractorService.extract(this.activeConversationId)
      } catch (err) {
        console.error('[EpisodeTrigger] Quit extraction failed:', err)
      }
    }
  }

  refresh(): void {
    this.enabled = this.isEpisodeMemoryEnabled()
    if (!this.enabled) {
      for (const [, timer] of this.idleTimers) {
        clearTimeout(timer)
      }
      this.idleTimers.clear()
    }
  }

  isExtracting(): boolean {
    return this.extractingSet.size > 0
  }

  dispose(): void {
    for (const [, timer] of this.idleTimers) {
      clearTimeout(timer)
    }
    this.idleTimers.clear()
    this.extractingSet.clear()
  }

  private triggerExtraction(conversationId: string): void {
    if (this.extractingSet.has(conversationId)) return

    this.extractingSet.add(conversationId)

    episodeExtractorService.extract(conversationId)
      .catch(err => console.error('[EpisodeTrigger] Extraction error:', err))
      .finally(() => this.extractingSet.delete(conversationId))
  }

  private resetIdleTimer(conversationId: string): void {
    this.clearIdleTimer(conversationId)

    const timer = setTimeout(() => {
      this.idleTimers.delete(conversationId)
      this.triggerExtraction(conversationId)
    }, IDLE_TIMEOUT_MS)

    this.idleTimers.set(conversationId, timer)
  }

  private clearIdleTimer(conversationId: string): void {
    const existing = this.idleTimers.get(conversationId)
    if (existing) {
      clearTimeout(existing)
      this.idleTimers.delete(conversationId)
    }
  }

  private isEpisodeMemoryEnabled(): boolean {
    try {
      const db = getDatabase()
      const modelRow = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
      return !!modelRow?.value
    } catch {
      return false
    }
  }
}

export const episodeTriggerService = new EpisodeTriggerService()
