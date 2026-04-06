/**
 * Sanitize a value for safe inclusion in a log line.
 *
 * Why this matters: Live plugins receive untrusted strings from the
 * transport (WebSocket payloads, tool call names, error messages, etc.)
 * and log them via template literals. Without sanitization, a malicious
 * upstream (compromised provider account, MITM with rogue root cert) could
 * inject:
 *   - Newlines / carriage returns to forge fake log entries
 *   - ANSI escape sequences to colour, hide, or overwrite log content
 *   - Other terminal control characters to corrupt the log stream
 *
 * CodeQL rule `js/format-string-injection` flagged this on
 * `openai-live.plugin.ts:214,217` (alerts #4, #5 — S67 first CodeQL pass).
 * The strict CodeQL classification (format-string injection) is technically
 * a false positive (template literals don't interpret %s), but the underlying
 * log-injection risk is real and worth the defence.
 *
 * Strategy:
 *   1. Coerce non-strings to a JSON-ish string
 *   2. Strip all C0/C1 control characters (\x00-\x1f, \x7f-\x9f) except
 *      tab (\x09) which is harmless
 *   3. Strip ANSI escape sequences (CSI / OSC / single-char)
 *   4. Cap the length to prevent log flooding from a single field
 *
 * Use this for ANY value that originates from a Live transport before
 * embedding it in a console.log/error/warn call.
 */

const DEFAULT_MAX_LEN = 200

// ANSI escape sequence regex — covers CSI (`\x1b[...`), OSC (`\x1b]...`),
// single-char escapes (`\x1b<char>`), and the older 8-bit C1 forms.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|[\x9b\x9d][^\x07\x1b]*(?:\x07|\x1b\\)/g

// All C0 control chars except tab (0x09); plus C1 control chars (0x80-0x9f)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/g

export function sanitizeForLog(value: unknown, maxLen: number = DEFAULT_MAX_LEN): string {
  let str: string
  if (value === null || value === undefined) {
    str = String(value)
  } else if (typeof value === 'string') {
    str = value
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value)
  } else {
    try {
      str = JSON.stringify(value)
    } catch {
      str = '[unserializable]'
    }
  }

  // Strip ANSI sequences first (before stripping individual control chars,
  // otherwise we'd leave dangling `[31m` or `]0;` fragments)
  str = str.replace(ANSI_ESCAPE_RE, '')
  // Strip all remaining control chars (newlines, BEL, ESC, etc.)
  str = str.replace(CONTROL_CHARS_RE, '')

  if (str.length > maxLen) {
    return str.slice(0, maxLen) + '…'
  }
  return str
}
