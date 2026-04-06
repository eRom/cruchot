// tests/e2e/security/csp-and-navigation.spec.ts
import { test, expect } from '../fixtures/electron-app'

test.describe('CSP and navigation hardening', () => {
  /**
   * window.open() with a non-http(s) URL hits the early-return deny branch
   * in window.ts:49-51 (setWindowOpenHandler). The handler returns
   * { action: 'deny' }, so window.open returns null in the renderer.
   *
   * IMPORTANT: this test uses 'javascript:void(0)' specifically to AVOID
   * the dialog.showMessageBox path (which fires for untrusted https URLs)
   * and the shell.openExternal path (which fires for trusted domains).
   */
  test('window.open with non-http URL returns null (setWindowOpenHandler deny)', async ({
    window: page,
  }) => {
    const isDenied = await page.evaluate(() => {
      const opened = window.open('javascript:void(0)', '_blank')
      return opened === null
    })
    expect(isDenied).toBe(true)
  })

  /**
   * Even when window.open is called, NO new BrowserWindow appears in the
   * Electron app's window list. Validates the deny is honored at the
   * Chromium/Electron level, not just the renderer.
   *
   * Uses javascript:void(0) for the same reason as Test 1 — avoids
   * dialog.showMessageBox and shell.openExternal side effects.
   */
  test('no new BrowserWindow created when window.open is called', async ({
    window: page,
    electronApp,
  }) => {
    const before = electronApp.windows().length
    await page.evaluate(() => {
      // Same safe URL as Test 1 — non-http(s) to avoid dialog/shell side effects.
      // window.open() returns null when denied; it does NOT throw, so no try/catch needed.
      window.open('javascript:void(0)', '_blank')
    })
    // Allow one event-loop cycle for Electron to process the deny decision
    // (no deterministic event to await — increase if CI proves flaky)
    await page.waitForTimeout(500)
    const after = electronApp.windows().length
    expect(after).toBe(before)
  })

  /**
   * The will-navigate guard (window.ts:83-91) calls event.preventDefault()
   * for non-local URLs. Setting window.location.href to an external URL
   * should NOT change the URL.
   *
   * Note: window.ts will-navigate does NOT call dialog.showMessageBox, so
   * https://example.com is safe to use here (unlike for window.open above).
   */
  test('will-navigate guard blocks external URL changes', async ({ window: page }) => {
    const initialURL = page.url()
    await page.evaluate(() => {
      // Assigning to location.href does NOT throw when blocked by will-navigate;
      // the prevention happens asynchronously in the main process.
      window.location.href = 'https://example.com'
    })
    // Allow one event-loop cycle for the will-navigate guard to fire
    // (no deterministic event to await — increase if CI proves flaky)
    await page.waitForTimeout(500)
    // The URL should not have changed to example.com — the navigation is blocked
    expect(page.url()).not.toContain('example.com')
    // Sanity: the URL is still the initial (file:// or dev URL)
    expect(page.url()).toBe(initialURL)
  })

  /**
   * The CSP meta tag is present in the renderer document. Cruchot defines
   * CSP via <meta http-equiv="Content-Security-Policy"> in
   * src/renderer/index.html.
   *
   * (Note: this only checks the meta tag presence. Test 5 in
   * webpreferences.spec.ts is supposed to verify CSP enforcement at runtime
   * but is currently skipped due to the meta-vs-header limitation. See
   * _internal/specs/2026-04-06-csp-header-hardening.md.)
   */
  test('CSP meta tag is present in the renderer document', async ({ window: page }) => {
    const cspContent = await page.evaluate(() => {
      const meta = document.querySelector(
        'meta[http-equiv="Content-Security-Policy"]'
      )
      return meta?.getAttribute('content') ?? null
    })
    expect(cspContent).not.toBeNull()
    expect(cspContent).toContain('default-src')
    // Sanity floor: a real CSP has multiple directives, so the content
    // should be substantially longer than just "default-src 'none'" (~19 chars)
    expect(cspContent!.length).toBeGreaterThan(50)
  })
})
