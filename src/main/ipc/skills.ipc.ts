import { ipcMain } from 'electron'
import { z } from 'zod'
import { skillService } from '../services/skill.service'

export function registerSkillsIpc(): void {
  ipcMain.handle('skills:list', async () => {
    return skillService.getAll()
  })

  ipcMain.handle('skills:refresh', async (_, payload) => {
    const { workspaceRoot } = z.object({
      workspaceRoot: z.string().optional()
    }).parse(payload ?? {})
    return skillService.refresh(workspaceRoot)
  })

  ipcMain.handle('skills:get', async (_, payload) => {
    const { name } = z.object({
      name: z.string().min(1).max(50)
    }).parse(payload)
    return skillService.get(name)
  })

  console.log('[IPC] Skills handlers registered')
}
