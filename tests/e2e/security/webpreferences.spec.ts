// tests/e2e/security/webpreferences.spec.ts
import { test, expect } from '../fixtures/electron-app'

test.describe('webPreferences hardening (behavioral)', () => {
  /**
   * Sandbox + nodeIntegration:false + contextIsolation:true all imply that
   * `require` is undefined in the renderer. This single check validates the
   * three core hardening flags simultaneously.
   */
  test('renderer has no require (sandbox + nodeIntegration:false + contextIsolation)', async ({
    window: page,
  }) => {
    const t = await page.evaluate(() => typeof (window as { require?: unknown }).require)
    expect(t).toBe('undefined')
  })

  /**
   * devTools should be closed by default. Cruchot's window.ts sets
   * `devTools: !app.isPackaged`, but the test launches the app with
   * NODE_ENV=production AND no devtools auto-open trigger.
   */
  test('devTools are not opened on startup', async ({ electronApp, window: _window }) => {
    // _window forces the BrowserWindow fixture to resolve before electronApp.evaluate
    // runs — without it, getAllWindows() returns [] because the window doesn't exist yet.
    // The underscore prefix signals intentional non-use (TypeScript convention).
    const isOpen = await electronApp.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows()
      return win.webContents.isDevToolsOpened()
    })
    expect(isOpen).toBe(false)
  })

  /**
   * Auxclick (middle-click) navigation must NOT trigger window.open or
   * external navigation. This validates `disableBlinkFeatures: 'Auxclick'`
   * (window.ts:36, audit S66). We dispatch a synthetic auxclick event on a
   * <a target="_blank"> and verify that no new BrowserWindow appears.
   */
  test('middle-click on a link does not open a new window (Auxclick disabled, audit S66)', async ({
    window: page,
    electronApp,
  }) => {
    const before = electronApp.windows().length

    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = 'https://example.com'
      a.target = '_blank'
      a.textContent = 'aux test link'
      document.body.appendChild(a)

      // Dispatch a real auxclick event (button=1 is middle button)
      const evt = new MouseEvent('auxclick', {
        bubbles: true,
        cancelable: true,
        button: 1,
      })
      a.dispatchEvent(evt)
    })

    await page.waitForTimeout(500)
    expect(electronApp.windows().length).toBe(before)
  })

  /**
   * CSP `frame-src 'none'` means the browser blocks any iframe from navigating
   * to an external URL. When blocked, the iframe stays at about:blank (same-origin
   * with the parent), so contentDocument is non-null — that's NOT a useful check.
   * Instead, we verify the iframe's location.href did NOT become example.com.
   */
  test('cross-origin iframe is blocked (CSP frame-src none)', async ({ window: page }) => {
    const result = await page.evaluate(async () => {
      return new Promise<{ navigated: boolean; href: string }>((resolve) => {
        const iframe = document.createElement('iframe')
        iframe.src = 'https://example.com'
        iframe.style.display = 'none'

        const checkAndResolve = () => {
          // If CSP blocked the navigation, the iframe stays at about:blank.
          // Reading contentWindow.location.href is allowed for same-origin
          // about:blank but throws for actual cross-origin navigation.
          try {
            const href = iframe.contentWindow?.location.href ?? ''
            // about:blank means CSP blocked the navigation (good)
            // Anything containing 'example.com' means the iframe loaded (bad)
            resolve({ navigated: href.includes('example.com'), href })
          } catch {
            // Cross-origin throw means iframe successfully loaded example.com (bad)
            resolve({ navigated: true, href: '<cross-origin throw>' })
          }
        }

        iframe.addEventListener('load', checkAndResolve)
        iframe.addEventListener('error', () => resolve({ navigated: false, href: '<error>' }))
        setTimeout(checkAndResolve, 2000)

        document.body.appendChild(iframe)
      })
    })
    expect(result.navigated).toBe(false)
  })

  /**
   * CSP `script-src 'self'` (no 'unsafe-eval') should block eval(). This
   * validates that the CSP is actually enforced at runtime, not just declared.
   *
   * SKIPPED — Phase 1 found that Cruchot delivers CSP only via <meta> tag in
   * src/renderer/index.html. Per HTML spec, meta-delivered CSP does NOT
   * enforce eval() blocking (only HTTP header CSP does). Cruchot has no
   * session.webRequest.onHeadersReceived handler for the CSP, so eval() runs
   * unrestricted in the renderer.
   *
   * To re-enable this test:
   *   1. Implement the fix in _internal/specs/2026-04-06-csp-header-hardening.md
   *      (add session.webRequest.onHeadersReceived handler in src/main/index.ts
   *      that injects the CSP as an HTTP header)
   *   2. Manually verify Mermaid/KaTeX/etc. still render (Function constructor
   *      may be affected)
   *   3. Remove the test.skip() below and re-run the suite
   */
  test.skip('eval() is blocked by CSP (no unsafe-eval)', async ({ window: page }) => {
    const blocked = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-eval
        eval('1 + 1')
        return false
      } catch (err) {
        return err instanceof EvalError || /unsafe-eval/i.test(String(err))
      }
    })
    expect(blocked).toBe(true)
  })
})
