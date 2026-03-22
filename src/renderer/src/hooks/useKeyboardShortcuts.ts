import { useEffect } from 'react'
import hotkeys from 'hotkeys-js'

export interface KeyboardShortcutCallbacks {
  /** Cmd+N — new conversation */
  onNewConversation?: () => void
  /** Cmd+K — toggle command palette */
  onCommandPalette?: () => void
  /** Cmd+, — open settings */
  onSettings?: () => void
  /** Cmd+M — open model list */
  onModelList?: () => void
  /** Cmd+B — toggle sidebar (conversations list) */
  onToggleSidebar?: () => void
  /** Opt+Cmd+B — toggle right panel */
  onToggleRightPanel?: () => void
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

    if (callbacks.onModelList) {
      const handler = callbacks.onModelList
      bindings.push(['command+m,ctrl+m', handler])
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

    // Cmd+, — hotkeys-js can't handle comma in its syntax, use native listener
    const settingsHandler = callbacks.onSettings
    function handleSettingsKey(e: KeyboardEvent) {
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        settingsHandler?.()
      }
    }
    if (settingsHandler) {
      document.addEventListener('keydown', handleSettingsKey)
    }

    // Cmd+B and Opt+Cmd+B — native listener
    // hotkeys-js with 'command+b' can conflict with Opt+Cmd+B, and macOS
    // remaps Opt+key to special chars (∫ for Opt+B), so we use keyCode/code instead
    const sidebarHandler = callbacks.onToggleSidebar
    const rightPanelHandler = callbacks.onToggleRightPanel
    function handleBKey(e: KeyboardEvent) {
      // Must be 'b' key (use e.code to ignore macOS alt remapping)
      if (e.code !== 'KeyB') return
      if (!e.metaKey && !e.ctrlKey) return

      if (e.altKey) {
        // Opt+Cmd+B → right panel
        e.preventDefault()
        rightPanelHandler?.()
      } else {
        // Cmd+B → sidebar
        e.preventDefault()
        sidebarHandler?.()
      }
    }
    if (sidebarHandler || rightPanelHandler) {
      document.addEventListener('keydown', handleBKey, true)
    }

    return () => {
      for (const [keys] of bindings) {
        hotkeys.unbind(keys)
      }
      document.removeEventListener('keydown', handleSettingsKey)
      document.removeEventListener('keydown', handleBKey, true)
    }
  }, [
    callbacks.onNewConversation,
    callbacks.onCommandPalette,
    callbacks.onSettings,
    callbacks.onModelList,
    callbacks.onToggleSidebar,
    callbacks.onToggleRightPanel,
    callbacks.onEscape,
  ])
}
