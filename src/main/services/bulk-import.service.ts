import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { getDatabase } from '../db'
import { getAllProjects, createProject } from '../db/queries/projects'
import { createConversation } from '../db/queries/conversations'
import { createMessage } from '../db/queries/messages'
import { getInstanceToken } from './instance-token.service'
import type { ExportPayload } from './bulk-export.service'

// ── Zod validation schema ──────────────────────────────

const exportMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  modelId: z.string().nullable(),
  createdAt: z.string()
})

const exportConversationSchema = z.object({
  title: z.string(),
  projectName: z.string().nullable(),
  messages: z.array(exportMessageSchema),
  createdAt: z.string()
})

const exportProjectSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  systemPrompt: z.string().nullable(),
  defaultModelId: z.string().nullable(),
  color: z.string().nullable()
})

const exportPayloadSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  projects: z.array(exportProjectSchema),
  conversations: z.array(exportConversationSchema)
})

// ── Decrypt payload ────────────────────────────────────

export function decryptPayload(encrypted: Buffer, token: Buffer): ExportPayload {
  if (encrypted.length < 28) {
    throw new Error('Fichier trop court pour etre un export valide')
  }

  const iv = encrypted.subarray(0, 12)
  const authTag = encrypted.subarray(12, 28)
  const ciphertext = encrypted.subarray(28)

  const decipher = crypto.createDecipheriv('aes-256-gcm', token, iv)
  decipher.setAuthTag(authTag)

  let decrypted: Buffer
  try {
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('Dechiffrement echoue : token invalide ou fichier corrompu')
  }

  const json = JSON.parse(decrypted.toString('utf-8'))
  const parsed = exportPayloadSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error('Format de payload invalide : ' + parsed.error.message)
  }

  return parsed.data
}

// ── Try decrypt with local token ───────────────────────

export function tryDecryptWithLocalToken(filePath: string): {
  success: boolean
  payload?: ExportPayload
} {
  const encrypted = readFileSync(filePath)
  const token = getInstanceToken()

  try {
    const payload = decryptPayload(encrypted, token)
    return { success: true, payload }
  } catch {
    return { success: false }
  }
}

// ── Import payload into DB ─────────────────────────────

export interface BulkImportResult {
  projectsImported: number
  conversationsImported: number
  messagesImported: number
}

export function importPayload(payload: ExportPayload): BulkImportResult {
  const db = getDatabase()
  let projectsImported = 0
  let conversationsImported = 0
  let messagesImported = 0

  // Use a transaction for atomicity
  db.transaction((tx) => {
    // 1. Import projects — dedup by name
    const existingProjects = getAllProjects()
    const existingNames = new Set(existingProjects.map((p) => p.name))
    const nameToId = new Map<string, string>()

    // Also track names created in this batch for intra-batch dedup
    const batchNames = new Set<string>()

    for (const proj of payload.projects) {
      let finalName = proj.name
      if (existingNames.has(finalName) || batchNames.has(finalName)) {
        let suffix = 1
        while (existingNames.has(`${proj.name}-${suffix}`) || batchNames.has(`${proj.name}-${suffix}`)) {
          suffix++
        }
        finalName = `${proj.name}-${suffix}`
      }

      const created = createProject({
        name: finalName,
        description: proj.description ?? undefined,
        systemPrompt: proj.systemPrompt ?? undefined,
        defaultModelId: proj.defaultModelId ?? undefined,
        color: proj.color ?? undefined
        // No workspacePath — intentionally excluded from export
      })

      nameToId.set(proj.name, created.id)
      existingNames.add(finalName)
      batchNames.add(finalName)
      projectsImported++
    }

    // 2. Import conversations + messages
    for (const conv of payload.conversations) {
      const projectId = conv.projectName ? (nameToId.get(conv.projectName) ?? undefined) : undefined
      const created = createConversation(conv.title, projectId)

      conversationsImported++

      for (const msg of conv.messages) {
        createMessage({
          conversationId: created.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
          modelId: msg.modelId ?? undefined
        })
        messagesImported++
      }
    }
  })

  return { projectsImported, conversationsImported, messagesImported }
}
