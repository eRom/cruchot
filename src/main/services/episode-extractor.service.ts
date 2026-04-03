import { generateText } from 'ai'
import { getModel } from '../llm/router'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getMessagesForConversation } from '../db/queries/messages'
import { getConversation } from '../db/queries/conversations'
import {
  getAllEpisodes,
  createEpisode,
  reinforceEpisode,
  updateEpisode,
  updateLastEpisodeMessageId,
  getLastEpisodeMessageId,
  type EpisodeCategory
} from '../db/queries/episodes'

const EXTRACTION_PROMPT = `Tu es un analyseur comportemental. A partir de cet echange, extrais les faits notables sur l'utilisateur (preferences, habitudes, competences, style, contexte).

Regles :
- Chaque fait doit etre une phrase courte et affirmative
- category : "preference" | "behavior" | "context" | "skill" | "style"
- confidence : 0.0 a 1.0 (1.0 = certain)
- Si un fait existant est re-observe, utilise "reinforce" avec son id
- Si un fait existant a evolue, utilise "update" avec son id et le nouveau contenu
- Retourne [] si rien de notable

Retourne UNIQUEMENT un JSON array valide. Pas de texte avant ou apres.`

interface ExtractionAction {
  action: 'create' | 'reinforce' | 'update'
  content?: string
  category?: EpisodeCategory
  confidence: number
  episodeId?: string
}

class EpisodeExtractorService {
  async extract(conversationId: string): Promise<number> {
    const { providerId, modelId } = this.getConfiguredModel()
    if (!providerId || !modelId) {
      console.log('[Episode] No model configured, skipping extraction')
      return 0
    }

    const lastMsgId = getLastEpisodeMessageId(conversationId)
    const allMessages = getMessagesForConversation(conversationId)

    let deltaMessages = allMessages
    if (lastMsgId) {
      const lastIdx = allMessages.findIndex(m => m.id === lastMsgId)
      if (lastIdx >= 0) {
        deltaMessages = allMessages.slice(lastIdx + 1)
      }
    }

    if (deltaMessages.length < 4) {
      console.log(`[Episode] Delta too small (${deltaMessages.length} msgs), skipping`)
      return 0
    }

    const existingEpisodes = getAllEpisodes().filter(e => e.isActive)
    const conv = getConversation(conversationId)
    const projectId = conv?.projectId ?? null

    const existingBlock = existingEpisodes.length > 0
      ? existingEpisodes.map(e =>
        `[id: "${e.id}"] (x${e.occurrences}, ${e.confidence.toFixed(2)}) ${e.category}: "${e.content}"`
      ).join('\n')
      : '(aucun episode existant)'

    const deltaBlock = deltaMessages.map(m => {
      const role = m.role === 'user' ? 'Utilisateur' : 'Assistant'
      const content = m.content.slice(0, 500)
      return `[${role}] : ${content}`
    }).join('\n')

    const userPrompt = `Episodes deja connus :\n<existing-episodes>\n${existingBlock}\n</existing-episodes>\n\nConversation a analyser :\n<conversation-delta>\n${deltaBlock}\n</conversation-delta>`

    try {
      const model = getModel(providerId, modelId)
      const result = await generateText({
        model,
        system: EXTRACTION_PROMPT,
        prompt: userPrompt,
        temperature: 0.3,
        maxTokens: 2000
      })

      const text = await result.text

      const actions = this.parseActions(text)
      if (actions.length === 0) {
        console.log('[Episode] No episodes extracted')
      }

      let count = 0
      for (const action of actions) {
        try {
          if (action.action === 'create' && action.content && action.category) {
            createEpisode({
              content: action.content,
              category: action.category,
              confidence: Math.max(0, Math.min(1, action.confidence)),
              projectId,
              sourceConversationId: conversationId
            })
            count++
          } else if (action.action === 'reinforce' && action.episodeId) {
            reinforceEpisode(action.episodeId, Math.max(0, Math.min(1, action.confidence)))
            count++
          } else if (action.action === 'update' && action.episodeId && action.content) {
            updateEpisode(action.episodeId, {
              content: action.content,
              confidence: Math.max(0, Math.min(1, action.confidence))
            })
            count++
          }
        } catch (err) {
          console.error('[Episode] Failed to apply action:', action, err)
        }
      }

      if (allMessages.length > 0) {
        updateLastEpisodeMessageId(conversationId, allMessages[allMessages.length - 1].id)
      }

      console.log(`[Episode] Extracted ${count} episodes from conversation ${conversationId}`)
      return count
    } catch (err) {
      console.error('[Episode] Extraction failed:', err)
      return 0
    }
  }

  private parseActions(text: string): ExtractionAction[] {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed)) return []

      return parsed.filter((a: unknown) => {
        if (typeof a !== 'object' || a === null) return false
        const obj = a as Record<string, unknown>
        return typeof obj.action === 'string' && typeof obj.confidence === 'number'
      })
    } catch {
      console.error('[Episode] Failed to parse extraction JSON')
      return []
    }
  }

  private getConfiguredModel(): { providerId: string | null; modelId: string | null } {
    try {
      const db = getDatabase()
      const row = db.select().from(settings).where(eq(settings.key, 'multi-llm:episode-model-id')).get()
      if (!row?.value) return { providerId: null, modelId: null }

      const parts = row.value.split('::')
      if (parts.length !== 2) return { providerId: null, modelId: null }

      return { providerId: parts[0], modelId: parts[1] }
    } catch {
      return { providerId: null, modelId: null }
    }
  }
}

export const episodeExtractorService = new EpisodeExtractorService()
