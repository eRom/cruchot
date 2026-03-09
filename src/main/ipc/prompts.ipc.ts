import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllPrompts,
  getPromptsByCategory,
  getPromptsByType,
  searchPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt
} from '../db/queries/prompts'

const variableSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
})

const createPromptSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  type: z.enum(['complet', 'complement', 'system']),
  variables: z.array(variableSchema).max(50).optional()
})

const updatePromptSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(50000).optional(),
  category: z.string().max(100).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).nullable().optional(),
  type: z.enum(['complet', 'complement', 'system']).optional(),
  variables: z.array(variableSchema).max(50).nullable().optional()
})

export function registerPromptsIpc(): void {
  ipcMain.handle('prompts:list', async () => {
    return getAllPrompts()
  })

  ipcMain.handle('prompts:byCategory', async (_event, category: string) => {
    if (!category) throw new Error('Category required')
    return getPromptsByCategory(category)
  })

  ipcMain.handle('prompts:byType', async (_event, type: string) => {
    if (!type) throw new Error('Type required')
    return getPromptsByType(type as 'complet' | 'complement' | 'system')
  })

  ipcMain.handle('prompts:search', async (_event, query: string) => {
    if (!query) throw new Error('Query required')
    return searchPrompts(query)
  })

  ipcMain.handle('prompts:create', async (_event, data: unknown) => {
    const parsed = createPromptSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid prompt data')
    return createPrompt(parsed.data)
  })

  ipcMain.handle('prompts:update', async (_event, id: string, data: unknown) => {
    if (!id) throw new Error('Prompt ID required')
    const parsed = updatePromptSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid prompt data')
    return updatePrompt(id, parsed.data)
  })

  ipcMain.handle('prompts:delete', async (_event, id: string) => {
    if (!id) throw new Error('Prompt ID required')
    deletePrompt(id)
  })

  console.log('[IPC] Prompts handlers registered')
}
