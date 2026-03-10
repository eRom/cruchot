import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject
} from '../db/queries/projects'

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  defaultModelId: z.string().optional(),
  color: z.string().max(20).optional(),
  workspacePath: z.string().max(1000).optional()
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().max(10000).nullable().optional(),
  defaultModelId: z.string().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  workspacePath: z.string().max(1000).nullable().optional()
})

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', async () => {
    return getAllProjects()
  })

  ipcMain.handle('projects:create', async (_event, data: unknown) => {
    const parsed = createProjectSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid project data')
    return createProject(parsed.data)
  })

  ipcMain.handle('projects:update', async (_event, id: string, data: unknown) => {
    if (!id) throw new Error('Project ID required')
    const parsed = updateProjectSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid project data')
    return updateProject(id, parsed.data)
  })

  ipcMain.handle('projects:delete', async (_event, id: string) => {
    if (!id) throw new Error('Project ID required')
    deleteProject(id)
  })

  console.log('[IPC] Projects handlers registered')
}
