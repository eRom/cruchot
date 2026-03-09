import { ipcMain } from 'electron'
import { z } from 'zod'
import { showNotification, setBadgeCount, clearBadge } from '../services/notification.service'

const showNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000),
  silent: z.boolean().optional()
})

const setBadgeSchema = z.object({
  count: z.number().int().min(0).max(99999)
})

export function registerNotificationIpc(): void {
  ipcMain.handle('notification:show', async (_event, payload) => {
    const parsed = showNotificationSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    const { title, body, silent } = parsed.data
    showNotification(title, body, { silent })
  })

  ipcMain.handle('notification:setBadge', async (_event, payload) => {
    const parsed = setBadgeSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error(`Invalid payload: ${parsed.error.message}`)
    }

    setBadgeCount(parsed.data.count)
  })

  ipcMain.handle('notification:clearBadge', async () => {
    clearBadge()
  })

  console.log('[IPC] Notification handlers registered')
}
