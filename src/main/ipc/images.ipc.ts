import { ipcMain, app } from 'electron'
import { z } from 'zod'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { nanoid } from 'nanoid'
import { desc } from 'drizzle-orm'
import { getDatabase } from '../db'
import { images } from '../db/schema'
import { generateImage } from '../llm/image'
import { createMessage } from '../db/queries/messages'
import { touchConversation } from '../db/queries/conversations'

const generateImageSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z
    .enum(['gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview', 'gpt-image-1.5'])
    .optional(),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
  conversationId: z.string().optional(),
  providerId: z.string().optional()
})

function getImagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'images')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function registerImagesIpc(): void {
  // ── Generate image ─────────────────────────────────────
  ipcMain.handle('images:generate', async (_event, payload: unknown) => {
    const parsed = generateImageSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { prompt, model, aspectRatio, conversationId, providerId } = parsed.data
    const modelId = model ?? 'gemini-3.1-flash-image-preview'

    // Save user message to DB if conversationId provided
    if (conversationId) {
      createMessage({
        conversationId,
        role: 'user',
        content: prompt
      })
    }

    const startTime = Date.now()

    // Generate image
    const result = await generateImage(prompt, { model, aspectRatio })

    const responseTimeMs = Date.now() - startTime

    // Save to filesystem
    const id = nanoid()
    const filename = `${id}.png`
    const filePath = path.join(getImagesDir(), filename)
    const buffer = Buffer.from(result.base64, 'base64')
    fs.writeFileSync(filePath, buffer)

    // Save image record to DB
    const db = getDatabase()
    const now = new Date()
    db.insert(images)
      .values({
        id,
        prompt,
        modelId,
        path: filePath,
        size: buffer.length,
        createdAt: now
      })
      .run()

    // Save assistant message with image contentData to DB
    if (conversationId) {
      createMessage({
        conversationId,
        role: 'assistant',
        content: prompt,
        modelId,
        providerId,
        responseTimeMs,
        contentData: {
          type: 'image',
          imageId: id,
          path: filePath
        }
      })

      // Touch conversation updatedAt
      touchConversation(conversationId)
    }

    return {
      id,
      path: filePath,
      base64: result.base64
    }
  })

  // ── List images ────────────────────────────────────────
  ipcMain.handle('images:list', async () => {
    const db = getDatabase()
    return db
      .select()
      .from(images)
      .orderBy(desc(images.createdAt))
      .all()
  })

  console.log('[IPC] Images handlers registered')
}
