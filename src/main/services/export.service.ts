import { getConversation } from '../db/queries/conversations'
import { getMessagesForConversation } from '../db/queries/messages'

export type ExportFormat = 'md' | 'json' | 'txt' | 'html'

interface ExportedMessage {
  role: string
  content: string
  modelId?: string | null
  createdAt: Date | number
}

function formatTimestamp(date: Date | number): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString('fr-FR')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function exportConversation(
  conversationId: string,
  format: ExportFormat
): { content: string; filename: string; mimeType: string } {
  const conversation = getConversation(conversationId)
  if (!conversation) throw new Error('Conversation not found')

  const messages = getMessagesForConversation(conversationId) as ExportedMessage[]
  const title = conversation.title

  switch (format) {
    case 'md':
      return {
        content: exportAsMarkdown(title, messages),
        filename: `${sanitizeFilename(title)}.md`,
        mimeType: 'text/markdown'
      }
    case 'json':
      return {
        content: exportAsJson(title, messages),
        filename: `${sanitizeFilename(title)}.json`,
        mimeType: 'application/json'
      }
    case 'txt':
      return {
        content: exportAsText(title, messages),
        filename: `${sanitizeFilename(title)}.txt`,
        mimeType: 'text/plain'
      }
    case 'html':
      return {
        content: exportAsHtml(title, messages),
        filename: `${sanitizeFilename(title)}.html`,
        mimeType: 'text/html'
      }
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ _-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100)
}

function exportAsMarkdown(title: string, messages: ExportedMessage[]): string {
  let md = `# ${title}\n\n`
  md += `_Exporté le ${formatTimestamp(new Date())}_\n\n---\n\n`

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'Utilisateur' : msg.role === 'assistant' ? 'Assistant' : 'Système'
    const model = msg.modelId ? ` _(${msg.modelId})_` : ''
    md += `### ${roleLabel}${model}\n\n${msg.content}\n\n---\n\n`
  }

  return md
}

function exportAsJson(title: string, messages: ExportedMessage[]): string {
  return JSON.stringify(
    {
      title,
      exportedAt: new Date().toISOString(),
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        modelId: m.modelId ?? undefined,
        createdAt:
          m.createdAt instanceof Date ? m.createdAt.toISOString() : new Date(m.createdAt).toISOString()
      }))
    },
    null,
    2
  )
}

function exportAsText(title: string, messages: ExportedMessage[]): string {
  let txt = `${title}\n${'='.repeat(title.length)}\n\n`

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'Utilisateur' : msg.role === 'assistant' ? 'Assistant' : 'Système'
    txt += `[${roleLabel}]\n${msg.content}\n\n`
  }

  return txt
}

function exportAsHtml(title: string, messages: ExportedMessage[]): string {
  let html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #fafafa; }
    h1 { color: #1a1a1a; }
    .message { margin: 1rem 0; padding: 1rem; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f5f5f5; }
    .system { background: #fff3e0; font-style: italic; }
    .role { font-weight: bold; margin-bottom: 0.5rem; color: #555; }
    .content { white-space: pre-wrap; line-height: 1.6; }
    .meta { font-size: 0.8em; color: #999; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">Exporté le ${formatTimestamp(new Date())}</p>
`

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'Utilisateur' : msg.role === 'assistant' ? 'Assistant' : 'Système'
    html += `  <div class="message ${msg.role}">
    <div class="role">${roleLabel}${msg.modelId ? ` (${escapeHtml(msg.modelId)})` : ''}</div>
    <div class="content">${escapeHtml(msg.content)}</div>
  </div>\n`
  }

  html += `</body>\n</html>`
  return html
}
