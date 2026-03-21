import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'

// Check interval: every 4 hours
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let checkTimer: ReturnType<typeof setInterval> | null = null

/**
 * Broadcast an event to all renderer windows.
 */
function broadcast(channel: string, data: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}

/**
 * Initialize auto-updater with event forwarding to renderer.
 * Call once from main/index.ts after app ready.
 */
export function initAutoUpdater(): void {
  // Don't auto-download — let the user trigger it
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    broadcast('updater:available', {
      version: info.version,
      releaseNotes: typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map((n) => n.note).join('\n')
          : undefined,
      releaseDate: info.releaseDate
    })
  })

  autoUpdater.on('update-not-available', () => {
    broadcast('updater:not-available', {})
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcast('updater:progress', {
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast('updater:downloaded', {
      version: info.version
    })
  })

  autoUpdater.on('error', (err: Error) => {
    // Log silently — don't broadcast raw errors to the renderer
    console.error('[Updater] Error:', err.message)
  })

  // Initial check after a short delay (let the app settle)
  setTimeout(() => checkForUpdates(), 10_000)

  // Periodic checks
  checkTimer = setInterval(() => checkForUpdates(), CHECK_INTERVAL_MS)

  console.log('[Updater] Auto-updater initialized')
}

/**
 * Check for updates (non-blocking).
 */
export function checkForUpdates(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] Check failed:', err.message)
  })
}

/**
 * Start downloading the available update.
 */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate().catch((err) => {
    console.error('[Updater] Download failed:', err.message)
  })
}

/**
 * Install the downloaded update and restart the app.
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

/**
 * Cleanup timer on shutdown.
 */
export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}
