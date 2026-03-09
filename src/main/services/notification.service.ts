import { Notification, app } from 'electron'

interface NotificationOptions {
  /** Whether to play the system notification sound (default: false) */
  silent?: boolean
}

/**
 * Shows a native system notification using Electron's Notification API.
 */
export function showNotification(
  title: string,
  body: string,
  options: NotificationOptions = {}
): void {
  if (!Notification.isSupported()) {
    console.warn('[Notification] System notifications are not supported on this platform')
    return
  }

  const notification = new Notification({
    title,
    body,
    silent: options.silent ?? false
  })

  notification.show()
}

/**
 * Sets the badge count on the dock icon (macOS) or taskbar (Windows).
 * On macOS, uses app.dock.setBadge().
 */
export function setBadgeCount(count: number): void {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : '')
  } else {
    // On Windows/Linux, use the generic badge count API
    app.setBadgeCount(count)
  }
}

/**
 * Clears the badge on the dock icon / taskbar.
 */
export function clearBadge(): void {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge('')
  } else {
    app.setBadgeCount(0)
  }
}
