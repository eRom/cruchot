import { ipcMain, BrowserWindow } from 'electron'
import { isOnline, onStatusChange } from '../services/network.service'

export function registerNetworkIpc(): void {
  ipcMain.handle('network:status', async () => {
    return { online: isOnline() }
  })

  // Listen for network changes and broadcast to all renderer windows
  onStatusChange((online: boolean) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('network:changed', { online })
      }
    }
  })

  console.log('[IPC] Network handlers registered')
}
