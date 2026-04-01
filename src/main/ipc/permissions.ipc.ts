import { ipcMain } from 'electron'
import { z } from 'zod'
import { getAllPermissionRules, addPermissionRule, deletePermissionRule, resetPermissionRules } from '../db/queries/permissions'

const addRuleSchema = z.object({
  toolName: z.string().min(1).max(100),
  ruleContent: z.string().max(500).nullable(),
  behavior: z.enum(['allow', 'deny', 'ask'])
})

const deleteRuleSchema = z.object({
  id: z.string().min(1)
})

export function registerPermissionsIpc(): void {
  ipcMain.handle('permissions:list', async () => {
    return getAllPermissionRules()
  })

  ipcMain.handle('permissions:add', async (_event, payload: unknown) => {
    const parsed = addRuleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid permissions:add payload')
    const { toolName, ruleContent, behavior } = parsed.data
    return addPermissionRule(toolName, ruleContent, behavior)
  })

  ipcMain.handle('permissions:delete', async (_event, payload: unknown) => {
    const parsed = deleteRuleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid permissions:delete payload')
    deletePermissionRule(parsed.data.id)
  })

  ipcMain.handle('permissions:reset', async () => {
    resetPermissionRules()
  })
}
