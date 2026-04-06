// tests/e2e/security/preload-allowlist.spec.ts
import { test, expect } from '../fixtures/electron-app'

test.describe('preload allowlist', () => {
  test('window.api exposes the locked-down list of methods', async ({ window }) => {
    const exposedKeys = await window.evaluate(() =>
      Object.keys((window as { api?: Record<string, unknown> }).api ?? {}).sort()
    )

    // Snapshot pattern: the first run generates the .snap file. Commit it.
    // On subsequent runs, any added/removed key fails the test until the
    // snapshot is intentionally updated via `--update-snapshots`.
    // Note: Playwright appends the OS name automatically (e.g.
    // window-api-keys-darwin.txt). Commit all platform snapshots as they
    // are generated in CI.
    expect(exposedKeys.join('\n')).toMatchSnapshot('window-api-keys.txt')
  })

  test('ipcRenderer is NOT directly exposed on window', async ({ window }) => {
    const hasIpcRenderer = await window.evaluate(
      () => 'ipcRenderer' in window
    )
    expect(hasIpcRenderer).toBe(false)
  })

  test('window.api has at least one method (sanity)', async ({ window }) => {
    const count = await window.evaluate(
      () => Object.keys((window as { api?: Record<string, unknown> }).api ?? {}).length
    )
    expect(count).toBeGreaterThan(200) // currently 295; floor catches catastrophic preload wipe-out
  })
})
