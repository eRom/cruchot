import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getDailyStats,
  getProviderStats,
  getModelStats,
  getGlobalStats,
  getProjectStats,
  getBackgroundCostsByType,
  getPreviousPeriodCost
} from '../db/queries/statistics'

const daysSchema = z.number().int().min(1).max(3650).optional()

function parseDays(days?: unknown): number | undefined {
  if (days === undefined || days === null) return undefined
  const parsed = daysSchema.safeParse(days)
  return parsed.success ? parsed.data : 30
}

export function registerStatisticsIpc(): void {
  ipcMain.handle('statistics:daily', async (_event, days?: number) => {
    return getDailyStats(parseDays(days) ?? 30)
  })

  ipcMain.handle('statistics:providers', async (_event, days?: number) => {
    return getProviderStats(parseDays(days))
  })

  ipcMain.handle('statistics:models', async (_event, days?: number) => {
    return getModelStats(parseDays(days))
  })

  ipcMain.handle('statistics:total', async (_event, days?: number) => {
    return getGlobalStats(parseDays(days))
  })

  ipcMain.handle('statistics:projects', async (_event, days?: number) => {
    return getProjectStats(parseDays(days))
  })

  ipcMain.handle('statistics:backgroundCosts', async (_event, days?: number) => {
    return getBackgroundCostsByType(parseDays(days))
  })

  ipcMain.handle('statistics:previousPeriod', async (_event, days?: number) => {
    const d = parseDays(days)
    if (!d) return { totalCost: 0 }
    return getPreviousPeriodCost(d)
  })

  console.log('[IPC] Statistics handlers registered')
}
