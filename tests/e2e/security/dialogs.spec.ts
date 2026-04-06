// tests/e2e/security/dialogs.spec.ts
import { test, expect } from '../fixtures/electron-app'
import { stubDialog } from 'electron-playwright-helpers'

/**
 * Smoke validation that electron-playwright-helpers' stubDialog can intercept
 * showOpenDialog and showSaveDialog. This pattern will be used in Phase 2 to
 * test the export/import .mlx flow without showing real native dialogs.
 *
 * These tests are NOT a security check per se — they ensure the helper
 * library works in our setup so Phase 2 can rely on it.
 */
test.describe('dialog stubbing (smoke)', () => {
  test('showOpenDialog can be stubbed', async ({ electronApp }) => {
    const fakeResult = {
      canceled: false,
      filePaths: ['/tmp/fake-file.json'],
    }
    await stubDialog(electronApp, 'showOpenDialog', fakeResult)

    const result = await electronApp.evaluate(async ({ dialog }) => {
      return await dialog.showOpenDialog({
        properties: ['openFile'],
      })
    })

    expect(result.canceled).toBe(false)
    expect(result.filePaths).toEqual(['/tmp/fake-file.json'])
  })

  test('showSaveDialog can be stubbed', async ({ electronApp }) => {
    const fakeResult = {
      canceled: false,
      filePath: '/tmp/fake-output.mlx',
    }
    await stubDialog(electronApp, 'showSaveDialog', fakeResult)

    const result = await electronApp.evaluate(async ({ dialog }) => {
      return await dialog.showSaveDialog({
        defaultPath: 'export.mlx',
      })
    })

    expect(result.canceled).toBe(false)
    expect(result.filePath).toBe('/tmp/fake-output.mlx')
  })
})
