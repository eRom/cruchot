import { ipcMain } from 'electron'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDatabase } from '../db'
import { customModels } from '../db/schema'

const createSchema = z.object({
  providerId: z.string().min(1),
  label: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200),
  type: z.enum(['text', 'image'])
})

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  modelId: z.string().min(1).max(200).optional(),
  type: z.enum(['text', 'image']).optional()
})

export function registerCustomModelsIpc(): void {
  // ── List custom models (optionally filtered by providerId) ──
  ipcMain.handle('custom-models:list', async (_event, providerId?: string) => {
    const db = getDatabase()
    if (providerId) {
      return db.select().from(customModels).where(eq(customModels.providerId, providerId)).all()
    }
    return db.select().from(customModels).all()
  })

  // ── Create custom model ──
  ipcMain.handle('custom-models:create', async (_event, data: unknown) => {
    const parsed = createSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid payload: ' + parsed.error.message)

    const db = getDatabase()
    const now = new Date()
    const id = randomUUID()

    const record = {
      id,
      providerId: parsed.data.providerId,
      label: parsed.data.label,
      modelId: parsed.data.modelId,
      type: parsed.data.type,
      isEnabled: true,
      createdAt: now,
      updatedAt: now
    }

    db.insert(customModels).values(record).run()

    return record
  })

  // ── Update custom model ──
  ipcMain.handle('custom-models:update', async (_event, id: string, data: unknown) => {
    if (!id || typeof id !== 'string') throw new Error('ID is required')

    const parsed = updateSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid payload: ' + parsed.error.message)

    const db = getDatabase()
    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (parsed.data.label !== undefined) updates.label = parsed.data.label
    if (parsed.data.modelId !== undefined) updates.modelId = parsed.data.modelId
    if (parsed.data.type !== undefined) updates.type = parsed.data.type

    db.update(customModels).set(updates).where(eq(customModels.id, id)).run()

    return db.select().from(customModels).where(eq(customModels.id, id)).get()
  })

  // ── Delete custom model ──
  ipcMain.handle('custom-models:delete', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID is required')

    const db = getDatabase()
    db.delete(customModels).where(eq(customModels.id, id)).run()
  })

  console.log('[IPC] Custom models handlers registered')
}
