import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllMemoryFragments,
  getActiveMemoryFragments,
  createMemoryFragment,
  updateMemoryFragment,
  deleteMemoryFragment,
  toggleMemoryFragment,
  reorderMemoryFragments,
  buildMemoryBlock
} from '../db/queries/memory-fragments'

const MAX_FRAGMENTS = 50

const createSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  isActive: z.boolean().optional().default(true)
})

const updateSchema = z.object({
  id: z.string().min(1),
  content: z.string().trim().min(1).max(2000).optional(),
  isActive: z.boolean().optional()
})

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(100)
})

export function registerMemoryFragmentsIpc(): void {
  ipcMain.handle('memory:list', async () => {
    return getAllMemoryFragments()
  })

  ipcMain.handle('memory:get-active-block', async () => {
    return buildMemoryBlock()
  })

  ipcMain.handle('memory:create', async (_event, payload) => {
    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    // Check max fragments limit
    const existing = getAllMemoryFragments()
    if (existing.length >= MAX_FRAGMENTS) {
      throw new Error(`Nombre maximum de fragments atteint (${MAX_FRAGMENTS})`)
    }

    return createMemoryFragment(parsed.data.content, parsed.data.isActive)
  })

  ipcMain.handle('memory:update', async (_event, payload) => {
    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { id, ...updates } = parsed.data
    return updateMemoryFragment(id, updates)
  })

  ipcMain.handle('memory:delete', async (_event, payload) => {
    const parsed = z.object({ id: z.string().min(1) }).safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    deleteMemoryFragment(parsed.data.id)
  })

  ipcMain.handle('memory:reorder', async (_event, payload) => {
    const parsed = reorderSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    reorderMemoryFragments(parsed.data.orderedIds)
  })

  ipcMain.handle('memory:toggle', async (_event, payload) => {
    const parsed = z.object({ id: z.string().min(1) }).safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    return toggleMemoryFragment(parsed.data.id)
  })

  console.log('[IPC] Memory fragments handlers registered')
}
