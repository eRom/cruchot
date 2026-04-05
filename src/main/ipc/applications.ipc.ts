import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import {
  listAllowedApps,
  createAllowedApp,
  updateAllowedApp,
  deleteAllowedApp,
  toggleAllowedApp,
  getAllowedAppById,
  getAllowedAppByName
} from '../db/queries/applications'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  path: z.string().min(1).max(2000),
  type: z.enum(['local', 'web']),
  description: z.string().max(500).optional()
})

const updateSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200).optional(),
  path: z.string().min(1).max(2000).optional(),
  type: z.enum(['local', 'web']).optional(),
  description: z.string().max(500).nullable().optional()
})

const toggleSchema = z.object({
  id: z.string().min(1).max(100),
  isEnabled: z.boolean()
})

const deleteSchema = z.object({
  id: z.string().min(1).max(100)
})

const openByIdSchema = z.object({
  id: z.string().min(1).max(100)
})

const openByNameSchema = z.object({
  name: z.string().min(1).max(200)
})

export function registerApplicationsIpc(): void {
  // ── applications:list ──────────────────────────────────────
  ipcMain.handle('applications:list', async () => {
    return listAllowedApps()
  })

  // ── applications:create ────────────────────────────────────
  ipcMain.handle('applications:create', async (_event, payload: unknown) => {
    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    // Validate URL for web type
    if (parsed.data.type === 'web') {
      try {
        const url = new URL(parsed.data.path)
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Seules les URLs HTTP/HTTPS sont autorisees')
        }
      } catch (e: any) {
        if (e.message.includes('HTTP')) throw e
        throw new Error('URL invalide')
      }
    }

    return createAllowedApp(parsed.data)
  })

  // ── applications:update ────────────────────────────────────
  ipcMain.handle('applications:update', async (_event, payload: unknown) => {
    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    // Validate URL if type is web (or if path changed on a web app)
    const { id, ...data } = parsed.data
    if (data.type === 'web' || (data.path && !data.type)) {
      const existing = getAllowedAppById(id)
      const effectiveType = data.type ?? existing?.type
      if (effectiveType === 'web' && data.path) {
        try {
          const url = new URL(data.path)
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Seules les URLs HTTP/HTTPS sont autorisees')
          }
        } catch (e: any) {
          if (e.message.includes('HTTP')) throw e
          throw new Error('URL invalide')
        }
      }
    }

    const result = updateAllowedApp(id, data)
    if (!result) throw new Error('Application introuvable')
    return result
  })

  // ── applications:delete ────────────────────────────────────
  ipcMain.handle('applications:delete', async (_event, payload: unknown) => {
    const parsed = deleteSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    deleteAllowedApp(parsed.data.id)
  })

  // ── applications:toggle ────────────────────────────────────
  ipcMain.handle('applications:toggle', async (_event, payload: unknown) => {
    const parsed = toggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    toggleAllowedApp(parsed.data.id, parsed.data.isEnabled)
  })

  // ── applications:open (by id) ──────────────────────────────
  ipcMain.handle('applications:open', async (_event, payload: unknown) => {
    const parsed = openByIdSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const app = getAllowedAppById(parsed.data.id)
    if (!app) throw new Error('Application introuvable')
    if (!app.isEnabled) throw new Error('Application desactivee')

    return openApp(app.path, app.type as 'local' | 'web')
  })

  // ── applications:openByName (for /open command + Live) ─────
  ipcMain.handle('applications:openByName', async (_event, payload: unknown) => {
    const parsed = openByNameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const app = getAllowedAppByName(parsed.data.name)
    if (!app) throw new Error(`"${parsed.data.name}" n'est pas dans les applications autorisees`)
    if (!app.isEnabled) throw new Error(`"${parsed.data.name}" est desactivee`)

    return openApp(app.path, app.type as 'local' | 'web')
  })

  console.log('[IPC] Applications handlers registered')
}

// ── Helper ───────────────────────────────────────────────────

async function openApp(appPath: string, type: 'local' | 'web'): Promise<{ success: boolean }> {
  if (type === 'web') {
    const url = new URL(appPath)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Seules les URLs HTTP/HTTPS sont autorisees')
    }
    await shell.openExternal(appPath)
    return { success: true }
  }

  // Local app
  const errorMessage = await shell.openPath(appPath)
  if (errorMessage) {
    throw new Error(`Impossible d'ouvrir l'application : ${errorMessage}`)
  }
  return { success: true }
}
