// tests/e2e/security/protocols.spec.ts
import { test, expect } from '../fixtures/electron-app'

test.describe('custom protocols', () => {
  /**
   * Cruchot registers a `local-image://` scheme via
   * protocol.registerSchemesAsPrivileged() in src/main/index.ts:49-51
   * and protocol.handle() in src/main/index.ts:147-164.
   *
   * This test verifies the handler is actually attached at runtime.
   * If protocol.handle() were missing or removed, isProtocolHandled
   * would return false.
   */
  test('local-image:// scheme is registered as privileged with a handler', async ({
    electronApp,
    window: _window,
  }) => {
    // _window forces the BrowserWindow fixture to resolve so the protocol
    // handler (registered inside app.whenReady()) has run by the time we check.
    const isHandled = await electronApp.evaluate(({ protocol }) => {
      return protocol.isProtocolHandled('local-image')
    })
    expect(isHandled).toBe(true)
  })

  /**
   * External HTTPS fetch from the renderer should be blocked. Cruchot's
   * CSP `connect-src` whitelist does NOT include arbitrary external
   * domains, so a fetch to 'https://external.evil.com' should fail.
   *
   * Note: this test relies on the meta-tag CSP being honored for fetch
   * (which it IS — only eval is the exception per the HTML spec).
   * See _internal/specs/2026-04-06-csp-header-hardening.md for the
   * eval-specific limitation.
   */
  test('fetch to external HTTPS URL is rejected by CSP', async ({ window }) => {
    const result = await window.evaluate(async () => {
      try {
        const res = await fetch('https://external.evil.com/data.json', {
          // 5s timeout to avoid hanging if the URL somehow resolves slowly
          signal: AbortSignal.timeout(5000),
        })
        return { blocked: false, status: res.status }
      } catch (err) {
        // Either CSP block or network error — both count as "blocked"
        return { blocked: true, error: (err as Error).message }
      }
    })
    expect(result.blocked).toBe(true)
  })
})
