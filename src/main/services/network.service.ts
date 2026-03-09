import { net } from 'electron'

type StatusChangeCallback = (online: boolean) => void

const listeners: StatusChangeCallback[] = []
let pollInterval: ReturnType<typeof setInterval> | null = null
let lastStatus: boolean | null = null

/**
 * Returns the current online status using Electron's net module.
 */
export function isOnline(): boolean {
  return net.isOnline()
}

/**
 * Registers a callback to be notified when network status changes.
 * Starts polling if this is the first listener.
 */
export function onStatusChange(callback: StatusChangeCallback): void {
  listeners.push(callback)

  if (!pollInterval) {
    lastStatus = isOnline()
    // Poll every 3 seconds for network changes
    pollInterval = setInterval(() => {
      const current = isOnline()
      if (current !== lastStatus) {
        lastStatus = current
        for (const cb of listeners) {
          cb(current)
        }
      }
    }, 3000)
  }
}

/**
 * Removes a previously registered status change callback.
 * Stops polling if no more listeners.
 */
export function offStatusChange(callback: StatusChangeCallback): void {
  const idx = listeners.indexOf(callback)
  if (idx !== -1) {
    listeners.splice(idx, 1)
  }

  if (listeners.length === 0 && pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
    lastStatus = null
  }
}

/**
 * Cleans up all listeners and stops polling.
 */
export function disposeNetworkService(): void {
  listeners.length = 0
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
    lastStatus = null
  }
}
