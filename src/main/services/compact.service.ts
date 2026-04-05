import { generateText, type LanguageModel } from 'ai'

const COMPACT_THRESHOLD = 0.75 // 75% of context window
const MICROCOMPACT_TARGET = 0.6 // Stop microcompacting at 60%
const RECENT_BUDGET_RATIO = 0.25 // 25% of context window for recent messages
const CLEARED_PLACEHOLDER = '[Resultat supprime]'

const COMPACT_PROMPT = `Resume cette conversation en preservant :
1. L'intention principale de l'utilisateur
2. Les decisions techniques prises
3. Les fichiers et sections de code mentionnes
4. Les erreurs rencontrees et leurs solutions
5. Le travail en cours et les prochaines etapes

Sois concis mais precis. Ne perds aucune information technique critique.
Format : prose structuree, pas de liste a puces sauf pour les fichiers.`

interface DbMessage {
  id: string
  conversationId: string
  parentMessageId: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  contentData: Record<string, unknown> | null
  modelId: string | null
  providerId: string | null
  tokensIn: number | null
  tokensOut: number | null
  cost: number | null
  responseTimeMs: number | null
  createdAt: Date
}

export interface MessageRound {
  messages: DbMessage[]
  estimatedTokens: number
}

export interface PrepareResult {
  messages: DbMessage[]
  needsFullCompact: boolean
  tokenEstimate: number
}

export interface CompactResult {
  summary: string
  keptMessages: DbMessage[]
  tokensBefore: number
  tokensAfter: number
  usage: { inputTokens: number; outputTokens: number } | null
}

class CompactService {
  /**
   * Main entry point — called by chat.ipc.ts before streamText().
   * 1. If conversation has a compactSummary, inject it + post-boundary messages only
   * 2. Estimate tokens and microcompact if above threshold
   * 3. Signal needsFullCompact if still above threshold after microcompact
   */
  prepareMessages(
    conversationId: string,
    messages: DbMessage[],
    contextWindow: number,
    compactSummary?: string | null,
    compactBoundaryId?: string | null
  ): PrepareResult {
    let effectiveMessages = messages

    // If already compacted, inject summary + post-boundary messages only
    if (compactSummary && compactBoundaryId) {
      const boundaryIndex = messages.findIndex((m) => m.id === compactBoundaryId)
      if (boundaryIndex >= 0) {
        const summaryMessage: DbMessage = {
          id: 'compact-summary',
          conversationId,
          parentMessageId: null,
          role: 'user',
          content: `<conversation-summary>\n${compactSummary}\n</conversation-summary>`,
          contentData: null,
          modelId: null,
          providerId: null,
          tokensIn: null,
          tokensOut: null,
          cost: null,
          responseTimeMs: null,
          createdAt: messages[0]?.createdAt ?? new Date()
        }
        const postBoundary = messages.slice(boundaryIndex + 1)
        effectiveMessages = [summaryMessage, ...postBoundary]
      }
    }

    const estimate = this.estimateTokens(effectiveMessages)
    const threshold = contextWindow * COMPACT_THRESHOLD

    if (estimate <= threshold) {
      return {
        messages: effectiveMessages,
        needsFullCompact: false,
        tokenEstimate: estimate
      }
    }

    // Microcompact: clear old tool results
    const microcompacted = this.microcompact(effectiveMessages, contextWindow)
    const postMicroEstimate = this.estimateTokens(microcompacted)

    return {
      messages: microcompacted,
      needsFullCompact: postMicroEstimate > threshold,
      tokenEstimate: postMicroEstimate
    }
  }

  /**
   * Estimate tokens for a single message.
   * Heuristic: 1 token ~ 4 characters. Includes contentData if present.
   */
  estimateMessageTokens(msg: DbMessage): number {
    let chars = msg.content.length
    if (msg.contentData) {
      const cd = msg.contentData
      if (Array.isArray(cd.toolCalls)) {
        for (const tc of cd.toolCalls as Array<{
          result?: string
          args?: Record<string, unknown>
        }>) {
          if (tc.result) chars += tc.result.length
          if (tc.args) chars += JSON.stringify(tc.args).length
        }
      }
      if (cd.reasoning && typeof cd.reasoning === 'string') {
        chars += (cd.reasoning as string).length
      }
    }
    return Math.ceil(chars / 4)
  }

  /**
   * Estimate total tokens for an array of messages.
   */
  estimateTokens(messages: DbMessage[]): number {
    return messages.reduce((sum, msg) => sum + this.estimateMessageTokens(msg), 0)
  }

  /**
   * Group messages by API round.
   * A round = user message + assistant response (including tool calls/results).
   * Boundary: each new user message starts a new round.
   */
  groupByApiRound(messages: DbMessage[]): MessageRound[] {
    const rounds: MessageRound[] = []
    let currentRound: DbMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'user' && currentRound.length > 0) {
        rounds.push({
          messages: currentRound,
          estimatedTokens: this.estimateTokens(currentRound)
        })
        currentRound = []
      }
      currentRound.push(msg)
    }

    if (currentRound.length > 0) {
      rounds.push({
        messages: currentRound,
        estimatedTokens: this.estimateTokens(currentRound)
      })
    }

    return rounds
  }

  /**
   * Microcompact: replace old tool results with a placeholder.
   * Works in-memory only — DB is NOT modified.
   * Clears tool results from oldest rounds first until below target threshold.
   * Never touches rounds within the recent budget (last 25% of context window).
   */
  microcompact(messages: DbMessage[], contextWindow: number): DbMessage[] {
    const rounds = this.groupByApiRound(messages)
    if (rounds.length === 0) return messages

    // Calculate how many recent rounds to protect
    const recentBudget = contextWindow * RECENT_BUDGET_RATIO
    let recentTokens = 0
    let protectedFromIndex = rounds.length

    for (let i = rounds.length - 1; i >= 0; i--) {
      if (recentTokens + rounds[i].estimatedTokens > recentBudget) break
      recentTokens += rounds[i].estimatedTokens
      protectedFromIndex = i
    }

    // Deep clone messages so we don't mutate originals
    const cloned: DbMessage[] = messages.map((m) => ({
      ...m,
      contentData: m.contentData ? JSON.parse(JSON.stringify(m.contentData)) : null
    }))

    // Build a set of message IDs that are in unprotected rounds
    const unprotectedIds = new Set<string>()
    for (let i = 0; i < protectedFromIndex; i++) {
      for (const msg of rounds[i].messages) {
        unprotectedIds.add(msg.id)
      }
    }

    // Clear tool results in unprotected assistant messages (oldest first)
    let currentEstimate = this.estimateTokens(cloned)
    const target = contextWindow * MICROCOMPACT_TARGET

    for (const msg of cloned) {
      if (currentEstimate <= target) break
      if (!unprotectedIds.has(msg.id)) continue
      if (msg.role !== 'assistant' || !msg.contentData) continue

      const cd = msg.contentData
      if (!Array.isArray(cd.toolCalls)) continue

      for (const tc of cd.toolCalls as Array<{ result?: string }>) {
        if (tc.result && tc.result !== CLEARED_PLACEHOLDER) {
          const oldLen = tc.result.length
          tc.result = CLEARED_PLACEHOLDER
          currentEstimate -= Math.ceil((oldLen - CLEARED_PLACEHOLDER.length) / 4)
        }
      }
    }

    return cloned
  }

  /**
   * Full compaction: generate an LLM summary of old messages.
   * Keeps recent rounds within token budget, summarizes the rest.
   */
  async fullCompact(
    conversationId: string,
    messages: DbMessage[],
    model: LanguageModel,
    contextWindow: number,
    existingSummary?: string | null
  ): Promise<CompactResult> {
    const tokensBefore = this.estimateTokens(messages)
    const rounds = this.groupByApiRound(messages)

    // Determine which rounds to keep (most recent, within budget)
    const recentBudget = contextWindow * RECENT_BUDGET_RATIO
    const keptRounds: MessageRound[] = []
    let keptTokens = 0

    for (let i = rounds.length - 1; i >= 0; i--) {
      if (keptTokens + rounds[i].estimatedTokens > recentBudget) break
      keptRounds.unshift(rounds[i])
      keptTokens += rounds[i].estimatedTokens
    }

    // Everything else is to be summarized
    const summarizeRoundCount = rounds.length - keptRounds.length
    const toSummarize: DbMessage[] = []
    for (let i = 0; i < summarizeRoundCount; i++) {
      toSummarize.push(...rounds[i].messages)
    }

    if (toSummarize.length === 0) {
      return {
        summary: existingSummary ?? '',
        keptMessages: messages,
        tokensBefore,
        tokensAfter: tokensBefore,
        usage: null
      }
    }

    // Build transcript for summarization
    let transcript = ''
    if (existingSummary) {
      transcript += `<previous-summary>\n${existingSummary}\n</previous-summary>\n\n`
    }
    for (const msg of toSummarize) {
      const label = msg.role === 'user' ? 'Utilisateur' : 'Assistant'
      transcript += `[${label}]\n${msg.content}\n\n`
      if (msg.contentData && Array.isArray(msg.contentData.toolCalls)) {
        for (const tc of msg.contentData.toolCalls as Array<{
          toolName?: string
          args?: Record<string, unknown>
          result?: string
        }>) {
          if (tc.toolName) {
            transcript += `[Tool: ${tc.toolName}]`
            if (tc.result && tc.result !== CLEARED_PLACEHOLDER) {
              const truncatedResult =
                tc.result.length > 500
                  ? tc.result.slice(0, 500) + '... (tronque)'
                  : tc.result
              transcript += ` → ${truncatedResult}`
            }
            transcript += '\n'
          }
        }
        transcript += '\n'
      }
    }

    // Truncate transcript to avoid prompt-too-long
    const maxTranscriptChars = contextWindow * 3
    if (transcript.length > maxTranscriptChars) {
      transcript =
        transcript.slice(0, maxTranscriptChars) +
        '\n\n... (conversation tronquee pour la compaction)'
    }

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: COMPACT_PROMPT },
        { role: 'user', content: `Voici la conversation a resumer :\n\n${transcript}` }
      ],
      maxTokens: 4096,
      temperature: 0.3
    })

    const summary = result.text.trim()
    const usage = result.usage
    const keptMessages = keptRounds.flatMap((r) => r.messages)
    const tokensAfter = Math.ceil(summary.length / 4) + this.estimateTokens(keptMessages)

    return {
      summary,
      keptMessages,
      tokensBefore,
      tokensAfter,
      usage: usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } : null
    }
  }
}

export const compactService = new CompactService()
