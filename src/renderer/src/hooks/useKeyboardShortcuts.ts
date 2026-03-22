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
  /** Cmd+B — toggle workspace panel */
  onToggleWorkspace?: () => void
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

    if (callbacks.onToggleWorkspace) {
      const handler = callbacks.onToggleWorkspace
      bindings.push(['command+b,ctrl+b', handler])
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

    // Opt+Cmd+B — native listener (hotkeys-js can be flaky with option+command combos)
    const rightPanelHandler = callbacks.onToggleRightPanel
    function handleRightPanelKey(e: KeyboardEvent) {
      if (e.key === 'b' && e.metaKey && e.altKey && !e.ctrlKey) {
        e.preventDefault()
        rightPanelHandler?.()
      }
    }
    if (rightPanelHandler) {
      document.addEventListener('keydown', handleRightPanelKey)
    }

    return () => {
      for (const [keys] of bindings) {
        hotkeys.unbind(keys)
      }
      document.removeEventListener('keydown', handleSettingsKey)
      document.removeEventListener('keydown', handleRightPanelKey)
    }
  }, [
    callbacks.onNewConversation,
    callbacks.onCommandPalette,
    callbacks.onSettings,
    callbacks.onModelList,
    callbacks.onToggleWorkspace,
    callbacks.onToggleRightPanel,
    callbacks.onEscape,
  ])
}
