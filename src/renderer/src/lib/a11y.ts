// ── Standard aria-labels used across the application ──────────────

export const ARIA_LABELS = {
  // Navigation
  sidebar: 'Conversation sidebar',
  mainContent: 'Main content area',
  conversationList: 'Conversation list',

  // Chat
  messageInput: 'Message input',
  sendMessage: 'Send message',
  cancelGeneration: 'Cancel generation',
  messageList: 'Message list',
  userMessage: 'User message',
  assistantMessage: 'Assistant message',

  // Voice
  startVoiceInput: 'Start voice input',
  stopVoiceInput: 'Stop voice input',
  readAloud: 'Read aloud',
  pauseReading: 'Pause reading',
  stopReading: 'Stop reading',

  // Settings
  settingsPanel: 'Settings panel',
  modelSelector: 'Model selector',
  providerSettings: 'Provider settings',

  // General
  closeDialog: 'Close dialog',
  searchInput: 'Search',
  loading: 'Loading',
  notification: 'Notification'
} as const

// ── Screen reader announcements ──────────────────────────────────

let announceElement: HTMLElement | null = null

/**
 * Announces a message to screen readers via an aria-live region.
 *
 * Creates a visually-hidden element with `aria-live="polite"` and
 * sets its text content. Screen readers will announce the message
 * without visual disruption.
 *
 * @param message - The text to announce
 * @param priority - 'polite' (default) or 'assertive' for urgent messages
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
  if (!announceElement) {
    announceElement = document.createElement('div')
    announceElement.setAttribute('aria-live', priority)
    announceElement.setAttribute('aria-atomic', 'true')
    announceElement.setAttribute('role', 'status')
    // Visually hidden but accessible to screen readers
    Object.assign(announceElement.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: '0',
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: '0'
    })
    document.body.appendChild(announceElement)
  }

  // Update priority if it changed
  announceElement.setAttribute('aria-live', priority)

  // Clear and re-set to trigger announcement
  announceElement.textContent = ''
  requestAnimationFrame(() => {
    if (announceElement) {
      announceElement.textContent = message
    }
  })
}

// ── Focus trap ───────────────────────────────────────────────────

interface FocusTrapCleanup {
  /** Remove the focus trap and restore normal tab behavior */
  release: () => void
}

/**
 * Traps keyboard focus within a container element.
 *
 * Useful for modals and dialogs: pressing Tab or Shift+Tab cycles
 * through focusable elements inside the container without escaping.
 *
 * @param container - The HTML element to trap focus within
 * @returns An object with a `release()` method to remove the trap
 */
export function trapFocus(container: HTMLElement): FocusTrapCleanup {
  const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ')

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS))
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey) {
      // Shift+Tab — go to last element if on first
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      // Tab — go to first element if on last
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  container.addEventListener('keydown', handleKeyDown)

  // Focus the first focusable element
  const focusable = getFocusableElements()
  if (focusable.length > 0) {
    focusable[0].focus()
  }

  return {
    release() {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }
}
