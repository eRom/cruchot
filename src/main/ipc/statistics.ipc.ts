import { ipcMain } from 'electron'
import {
  getDailyStats,
  getProviderStats,
  getModelStats,
  getTotalCost
} from '../db/queries/statistics'

export function registerStatisticsIpc(): void {
  ipcMain.handle('statistics:daily', async (_event, days?: number) => {
    return getDailyStats(days ?? 30)
  })

  ipcMain.handle('statistics:providers', async () => {
    return getProviderStats()
  })

  ipcMain.handle('statistics:models', async () => {
    return getModelStats()
  })

  ipcMain.handle('statistics:total', async () => {
    return getTotalCost()
  })

  console.log('[IPC] Statistics handlers registered')
}
