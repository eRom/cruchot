import crypto from 'node:crypto'
import { getAllProjects } from '../db/queries/projects'
import { getAllConversations } from '../db/queries/conversations'
import { getMessagesForConversation } from '../db/queries/messages'

// ── Types ──────────────────────────────────────────────

export interface ExportProject {
  name: string
  description: string | null
  systemPrompt: string | null
  defaultModelId: string | null
  color: string | null
}

export interface ExportMessage {
  role: string
  content: string
  modelId: string | null
  createdAt: string // ISO
}

export interface ExportConversation {
  title: string
  projectName: string | null
  messages: ExportMessage[]
  createdAt: string // ISO
}

export interface ExportPayload {
  version: number
  exportedAt: string // ISO
  projects: ExportProject[]
  conversations: ExportConversation[]
}

// ── Build payload ──────────────────────────────────────

export function buildExportPayload(): ExportPayload {
  const projects = getAllProjects()
  const conversations = getAllConversations()

  // Map projectId → projectName for conversation lookup
  const projectIdToName = new Map<string, string>()
  for (const p of projects) {
    projectIdToName.set(p.id, p.name)
  }

  const exportProjects: ExportProject[] = projects.map((p) => ({
    name: p.name,
    description: p.description,
    systemPrompt: p.systemPrompt,
    defaultModelId: p.defaultModelId,
    color: p.color
  }))

  const exportConversations: ExportConversation[] = conversations.map((conv) => {
    const msgs = getMessagesForConversation(conv.id)
    return {
      title: conv.title,
      projectName: conv.projectId ? (projectIdToName.get(conv.projectId) ?? null) : null,
      createdAt: conv.createdAt instanceof Date
        ? conv.createdAt.toISOString()
        : new Date(conv.createdAt as unknown as number * 1000).toISOString(),
      messages: msgs.map((m) => ({
        role: m.role,
        content: m.content,
        modelId: m.modelId ?? null,
        createdAt: m.createdAt instanceof Date
          ? m.createdAt.toISOString()
          : new Date(m.createdAt as unknown as number * 1000).toISOString()
      }))
    }
  })

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: exportProjects,
    conversations: exportConversations
  }
}

// ── Encrypt payload ────────────────────────────────────

/**
 * Encrypts the export payload with AES-256-GCM.
 * Returns: [IV(12)][AuthTag(16)][Ciphertext(N)]
 */
export function encryptPayload(payload: ExportPayload, token: Buffer): Buffer {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', token, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, encrypted])
}
