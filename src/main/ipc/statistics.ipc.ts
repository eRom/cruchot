import { ipcMain } from 'electron'
import {
  getDailyStats,
  getProviderStats,
  getModelStats,
  getGlobalStats,
  getProjectStats
} from '../db/queries/statistics'

export function registerStatisticsIpc(): void {
  ipcMain.handle('statistics:daily', async (_event, days?: number) => {
    return getDailyStats(days ?? 30)
  })

  ipcMain.handle('statistics:providers', async (_event, days?: number) => {
    return getProviderStats(days)
  })

  ipcMain.handle('statistics:models', async (_event, days?: number) => {
    return getModelStats(days)
  })

  ipcMain.handle('statistics:total', async (_event, days?: number) => {
    return getGlobalStats(days)
  })

  ipcMain.handle('statistics:projects', async (_event, days?: number) => {
    return getProjectStats(days)
  })

  console.log('[IPC] Statistics handlers registered')
}
