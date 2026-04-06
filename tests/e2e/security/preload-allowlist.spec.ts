// tests/e2e/security/preload-allowlist.spec.ts
import { test, expect } from '../fixtures/electron-app'

test.describe('preload allowlist', () => {
  test('window.api exposes the locked-down list (TEST_MODE — includes test helpers)', async ({ window: page }) => {
    const exposedKeys = await page.evaluate(() =>
      Object.keys((window as { api?: Record<string, unknown> }).api ?? {}).sort()
    )

    // Snapshot pattern: any added/removed key fails the test until the
    // snapshot is intentionally updated via `--update-snapshots`.
    // This snapshot represents TEST_MODE: it includes the `test` key.
    expect(exposedKeys.join('\n') + '\n').toMatchSnapshot('window-api-keys-with-test.txt')

    // Sentinel: in TEST_MODE the `test` namespace MUST be present.
    expect(exposedKeys).toContain('test')
  })

  test('window.api exposes the prod posture (no test helpers)', async ({ windowProd }) => {
    const exposedKeys = await windowProd.evaluate(() =>
      Object.keys((window as { api?: Record<string, unknown> }).api ?? {}).sort()
    )

    // Prod-base snapshot: same as TEST_MODE minus the `test` key.
    expect(exposedKeys.join('\n') + '\n').toMatchSnapshot('window-api-keys.txt')

    // Sentinel: in prod posture the `test` namespace MUST be absent.
    expect(exposedKeys).not.toContain('test')
  })

  test('ipcRenderer is NOT directly exposed on window', async ({ window: page }) => {
    const hasIpcRenderer = await page.evaluate(
      () => 'ipcRenderer' in window
    )
    expect(hasIpcRenderer).toBe(false)
  })

  test('window.api has at least one method (sanity)', async ({ window: page }) => {
    const count = await page.evaluate(
      () => Object.keys((window as { api?: Record<string, unknown> }).api ?? {}).length
    )
    // currently 296 in TEST_MODE (295 base + `test`); floor catches catastrophic preload wipe-out
    expect(count).toBeGreaterThan(200)
  })
})
