import { useEffect } from 'react'
import hotkeys from 'hotkeys-js'

export interface KeyboardShortcutCallbacks {
  /** Cmd+N — new conversation */
  onNewConversation?: () => void
  /** Cmd+K — toggle command palette */
  onCommandPalette?: () => void
  /** Cmd+, — open settings */
  onSettings?: () => void
  /** Escape — stop streaming */
  onEscape?: () => void
}

/**
 * Registers global keyboard shortcuts via hotkeys-js.
 * Cleans up listeners on unmount.
 */
export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks) {
  useEffect(() => {
    // Allow hotkeys to fire even when focus is in input/textarea/select
    hotkeys.filter = () => true

    const bindings: Array<[string, () => void]> = []

    if (callbacks.onNewConversation) {
      const handler = callbacks.onNewConversation
      bindings.push(['command+n,ctrl+n', handler])
    }

    if (callbacks.onCommandPalette) {
      const handler = callbacks.onCommandPalette
      bindings.push(['command+k,ctrl+k', handler])
    }

    if (callbacks.onSettings) {
      const handler = callbacks.onSettings
      bindings.push(['command+,,ctrl+,', handler])
    }

    if (callbacks.onEscape) {
      const handler = callbacks.onEscape
      bindings.push(['escape', handler])
    }

    for (const [keys, handler] of bindings) {
      hotkeys(keys, (event) => {
        event.preventDefault()
        handler()
      })
    }

    return () => {
      for (const [keys] of bindings) {
        hotkeys.unbind(keys)
      }
    }
  }, [
    callbacks.onNewConversation,
    callbacks.onCommandPalette,
    callbacks.onSettings,
    callbacks.onEscape,
  ])
}
