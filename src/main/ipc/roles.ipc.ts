import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  seedBuiltinRoles
} from '../db/queries/roles'

const createRoleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  systemPrompt: z.string().max(10000).optional(),
  icon: z.string().max(50).optional()
})

const updateRoleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  systemPrompt: z.string().max(10000).nullable().optional(),
  icon: z.string().max(50).nullable().optional()
})

export function registerRolesIpc(): void {
  // Seed built-in roles on first registration
  seedBuiltinRoles()

  ipcMain.handle('roles:list', async () => {
    return getAllRoles()
  })

  ipcMain.handle('roles:create', async (_event, data: unknown) => {
    const parsed = createRoleSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid role data')
    return createRole(parsed.data)
  })

  ipcMain.handle('roles:update', async (_event, id: string, data: unknown) => {
    if (!id) throw new Error('Role ID required')
    const parsed = updateRoleSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid role data')
    return updateRole(id, parsed.data)
  })

  ipcMain.handle('roles:delete', async (_event, id: string) => {
    if (!id) throw new Error('Role ID required')
    deleteRole(id)
  })

  console.log('[IPC] Roles handlers registered')
}
