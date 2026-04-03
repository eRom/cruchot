import { getSqliteDatabase } from '../index'

export interface SearchFilters {
  role?: 'user' | 'assistant'
  projectId?: string
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  projectId: string | null
  role: string
  content: string
  createdAt: number
}

function sanitizeFtsQuery(query: string): string {
  const stripped = query
    .replace(/[{}()*^"]/g, '')
    .replace(/\bAND\b/gi, '')
    .replace(/\bOR\b/gi, '')
    .replace(/\bNOT\b/gi, '')
    .replace(/\bNEAR\b/gi, '')
    .replace(/\w+\s*:/g, '')
    .trim()

  if (!stripped) return '""'

  const terms = stripped.split(/\s+/).filter(Boolean)
  return terms.map(t => `"${t}"`).join(' ')
}

export function searchMessages(query: string, filters?: SearchFilters): SearchResult[] {
  const sqlite = getSqliteDatabase()
  const sanitized = sanitizeFtsQuery(query)

  const conditions: string[] = ['messages_fts MATCH ?']
  const params: unknown[] = [sanitized]

  if (filters?.role) {
    conditions.push('m.role = ?')
    params.push(filters.role)
  }

  if (filters?.projectId) {
    conditions.push('c.project_id = ?')
    params.push(filters.projectId)
  }

  const whereClause = conditions.join(' AND ')

  const results = sqlite
    .prepare(
      `
      SELECT
        m.id AS messageId,
        m.conversation_id AS conversationId,
        c.title AS conversationTitle,
        c.project_id AS projectId,
        m.role,
        substr(m.content, 1, 500) AS content,
        m.created_at AS createdAt
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.rowid
      JOIN conversations c ON m.conversation_id = c.id
      WHERE ${whereClause}
      ORDER BY rank
      LIMIT 50
    `
    )
    .all(...params) as SearchResult[]

  return results
}
