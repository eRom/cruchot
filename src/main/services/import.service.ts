import { createConversation } from '../db/queries/conversations'
import { createMessage, CreateMessageParams } from '../db/queries/messages'

export type ImportFormat = 'json' | 'chatgpt' | 'claude'

export interface ImportResult {
  conversationId: string
  messagesCount: number
}

// ── Native JSON format (exported by our app) ─────────────────
interface NativeExport {
  title: string
  exportedAt?: string
  messages: Array<{
    role: string
    content: string
    modelId?: string
    createdAt?: string
  }>
}

// ── ChatGPT export format ─────────────────────────────────────
interface ChatGPTConversation {
  title?: string
  mapping?: Record<
    string,
    {
      message?: {
        author?: { role?: string }
        content?: { parts?: string[] }
        create_time?: number
      }
    }
  >
}

// ── Claude export format ──────────────────────────────────────
interface ClaudeExport {
  name?: string
  chat_messages?: Array<{
    sender?: string
    text?: string
    created_at?: string
    content?: Array<{ type?: string; text?: string }>
  }>
}

function normalizeRole(role: string): 'user' | 'assistant' | 'system' {
  const lower = role.toLowerCase()
  if (lower === 'user' || lower === 'human') return 'user'
  if (lower === 'system') return 'system'
  return 'assistant'
}

function parseNativeJson(raw: string): { title: string; messages: Omit<CreateMessageParams, 'conversationId'>[] } {
  const data: NativeExport = JSON.parse(raw)

  if (!data.messages || !Array.isArray(data.messages)) {
    throw new Error('Invalid native JSON format: missing messages array')
  }

  const messages = data.messages.map((m) => ({
    role: normalizeRole(m.role),
    content: m.content,
    modelId: m.modelId
  }))

  return { title: data.title || 'Conversation importée', messages }
}

function parseChatGPT(raw: string): { title: string; messages: Omit<CreateMessageParams, 'conversationId'>[] } {
  const parsed = JSON.parse(raw)

  // ChatGPT exports can be an array of conversations — take the first one
  const data: ChatGPTConversation = Array.isArray(parsed) ? parsed[0] : parsed
  if (!data) throw new Error('Invalid ChatGPT format: empty data')

  const messages: Omit<CreateMessageParams, 'conversationId'>[] = []

  if (data.mapping) {
    // ChatGPT's tree-based format
    const entries = Object.values(data.mapping)
      .filter((node) => node.message?.content?.parts?.length)
      .sort((a, b) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0))

    for (const node of entries) {
      const msg = node.message!
      const role = msg.author?.role ?? 'assistant'
      if (role === 'tool') continue // skip tool messages

      const content = msg.content!.parts!.filter((p) => typeof p === 'string').join('\n')
      if (!content.trim()) continue

      messages.push({
        role: normalizeRole(role),
        content
      })
    }
  }

  if (messages.length === 0) {
    throw new Error('Invalid ChatGPT format: no messages found')
  }

  return { title: data.title || 'Import ChatGPT', messages }
}

function parseClaude(raw: string): { title: string; messages: Omit<CreateMessageParams, 'conversationId'>[] } {
  const parsed = JSON.parse(raw)

  // Claude exports can be an array — take the first one
  const data: ClaudeExport = Array.isArray(parsed) ? parsed[0] : parsed
  if (!data) throw new Error('Invalid Claude format: empty data')

  const messages: Omit<CreateMessageParams, 'conversationId'>[] = []

  if (data.chat_messages && Array.isArray(data.chat_messages)) {
    for (const msg of data.chat_messages) {
      // Extract content: either direct text or from content array
      let content = msg.text || ''
      if (!content && msg.content && Array.isArray(msg.content)) {
        content = msg.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text!)
          .join('\n')
      }

      if (!content.trim()) continue

      messages.push({
        role: normalizeRole(msg.sender || 'assistant'),
        content
      })
    }
  }

  if (messages.length === 0) {
    throw new Error('Invalid Claude format: no messages found')
  }

  return { title: data.name || 'Import Claude', messages }
}

export function importConversation(fileContent: string, format: ImportFormat): ImportResult {
  let parsed: { title: string; messages: Omit<CreateMessageParams, 'conversationId'>[] }

  switch (format) {
    case 'json':
      parsed = parseNativeJson(fileContent)
      break
    case 'chatgpt':
      parsed = parseChatGPT(fileContent)
      break
    case 'claude':
      parsed = parseClaude(fileContent)
      break
  }

  // Create conversation
  const conversation = createConversation(parsed.title)

  // Insert all messages
  for (const msg of parsed.messages) {
    createMessage({
      conversationId: conversation.id,
      role: msg.role,
      content: msg.content,
      modelId: msg.modelId
    })
  }

  return {
    conversationId: conversation.id,
    messagesCount: parsed.messages.length
  }
}
