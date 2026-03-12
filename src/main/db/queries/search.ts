import { getSqliteDatabase } from '../index'

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: string
  content: string
  createdAt: number
}

/**
 * Sanitize FTS5 query input to prevent query injection.
 * Strips FTS5 special operators and wraps terms in double quotes.
 */
function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special characters/operators that could inject syntax
  // FTS5 special: AND, OR, NOT, NEAR, *, ^, column:, {, }, (, )
  const stripped = query
    .replace(/[{}()*^"]/g, '')        // Remove structural chars
    .replace(/\bAND\b/gi, '')         // Remove boolean operators
    .replace(/\bOR\b/gi, '')
    .replace(/\bNOT\b/gi, '')
    .replace(/\bNEAR\b/gi, '')
    .replace(/\w+\s*:/g, '')          // Remove column: prefix
    .trim()

  if (!stripped) return '""'

  // Wrap each word in double quotes for literal matching
  const terms = stripped.split(/\s+/).filter(Boolean)
  return terms.map(t => `"${t}"`).join(' ')
}

export function searchMessages(query: string): SearchResult[] {
  const sqlite = getSqliteDatabase()

  const sanitized = sanitizeFtsQuery(query)

  const results = sqlite
    .prepare(
      `
      SELECT
        m.id AS messageId,
        m.conversation_id AS conversationId,
        c.title AS conversationTitle,
        m.role,
        substr(m.content, 1, 500) AS content,
        m.created_at AS createdAt
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.rowid
      JOIN conversations c ON m.conversation_id = c.id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `
    )
    .all(sanitized) as SearchResult[]

  return results
}
