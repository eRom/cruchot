/**
 * Build the <semantic-memory> block injected into the system prompt.
 * Contains recalled messages from previous conversations.
 */
import type { MemoryRecallResult } from '../services/qdrant-memory.service'

const MAX_CHARS = 3000

export function buildSemanticMemoryBlock(recalls: MemoryRecallResult[]): string {
  if (recalls.length === 0) return ''

  let block = '<semantic-memory>\nSouvenirs pertinents de conversations precedentes :\n\n'
  let currentLength = block.length

  for (const recall of recalls) {
    const date = new Date(recall.createdAt * 1000).toISOString().split('T')[0]
    const roleLabel = recall.role === 'user' ? 'Utilisateur' : 'Assistant'
    const scoreStr = recall.score.toFixed(2)

    // Sanitize content to prevent XML injection
    const content = recall.content
      .replace(/<\/semantic-memory>/gi, '&lt;/semantic-memory&gt;')
      .slice(0, 500)

    const entry = `[${date}] (score: ${scoreStr})\n[${roleLabel}] : ${content}\n\n`

    if (currentLength + entry.length > MAX_CHARS) break

    block += entry
    currentLength += entry.length
  }

  block += '</semantic-memory>'
  return block
}
