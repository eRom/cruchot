// tests/e2e/security/renderer-no-node.spec.ts
import { test, expect } from '../fixtures/electron-app'

/**
 * The renderer process must NOT have Node.js globals. With sandbox: true,
 * contextIsolation: true, and nodeIntegration: false (validated separately
 * in webpreferences.spec.ts), the following globals should all be undefined:
 *
 * - require: would allow loading native modules
 * - __dirname / __filename: CommonJS file path globals
 * - Buffer: Node.js binary type
 * - global: Node.js global object
 * - process: Node.js process info (env, argv, etc.)
 *
 * Any of these being defined indicates a serious sandbox bypass.
 *
 * The test loops over a const array, generating one test per global. This
 * makes the test report show 6 individual passes/failures, not 1 aggregate.
 */

const FORBIDDEN_GLOBALS = [
  'require',
  '__dirname',
  '__filename',
  'Buffer',
  'global',
  'process',
] as const

test.describe('renderer process has NO Node.js access', () => {
  for (const name of FORBIDDEN_GLOBALS) {
    test(`global "${name}" is undefined in renderer`, async ({ window: page }) => {
      const typeofValue = await page.evaluate((g) => {
        return typeof (window as unknown as Record<string, unknown>)[g]
      }, name)
      expect(typeofValue).toBe('undefined')
    })
  }
})
