import { getSqliteDatabase } from '../index'

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: string
  content: string
  createdAt: number
}

export function searchMessages(query: string): SearchResult[] {
  const sqlite = getSqliteDatabase()

  const results = sqlite
    .prepare(
      `
      SELECT
        m.id AS messageId,
        m.conversation_id AS conversationId,
        c.title AS conversationTitle,
        m.role,
        m.content,
        m.created_at AS createdAt
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.rowid
      JOIN conversations c ON m.conversation_id = c.id
      WHERE messages_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `
    )
    .all(query) as SearchResult[]

  return results
}
