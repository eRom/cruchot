// tests/e2e/security/fuses.spec.ts
import { test, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers'
import { existsSync } from 'fs'

/**
 * Fuses are baked into the binary by `scripts/afterPack.js` (via
 * @electron/fuses). They can only be inspected on a packaged build, so this
 * spec is skipped unless CRUCHOT_TEST_PACKAGED=1 (set in CI release post-build).
 *
 * The 8 fuses we expect (per audit S66):
 *   - RunAsNode: false
 *   - EnableNodeOptionsEnvironmentVariable: false
 *   - EnableNodeCliInspectArguments: false
 *   - EnableEmbeddedAsarIntegrityValidation: true   ← critical
 *   - OnlyLoadAppFromAsar: true
 *   - LoadBrowserProcessSpecificV8Snapshot: false
 *   - GrantFileProtocolExtraPrivileges: false
 *   - EnableCookieEncryption: true
 *
 * NOTE: imports test/expect from @playwright/test directly (NOT from
 * the electron-app fixture) because this spec doesn't launch Electron —
 * it just reads the binary.
 */

test.describe('@electron/fuses', () => {
  test.skip(
    process.env.CRUCHOT_TEST_PACKAGED !== '1',
    'Packaged mode only (set CRUCHOT_TEST_PACKAGED=1 after `npm run dist:mac`)'
  )

  test.skip(
    !existsSync('dist/'),
    '`dist/` directory missing — run `npm run dist:mac` first'
  )

  test('fuses are flipped correctly on the packaged binary', () => {
    const latestBuild = findLatestBuild('dist/')
    const appInfo = parseElectronApp(latestBuild)

    // Run @electron/fuses CLI in read mode against the packaged binary.
    // Use execFileSync (NOT execSync) to avoid shell metachar interpretation.
    const output = execFileSync(
      'npx',
      ['@electron/fuses', 'read', '--app', appInfo.executable],
      { encoding: 'utf-8' }
    )

    // Parse the human-readable output. Each fuse appears on its own line.
    expect(output).toMatch(/RunAsNode\s+is\s+Disabled/i)
    expect(output).toMatch(/EnableNodeOptionsEnvironmentVariable\s+is\s+Disabled/i)
    expect(output).toMatch(/EnableNodeCliInspectArguments\s+is\s+Disabled/i)
    expect(output).toMatch(/EnableEmbeddedAsarIntegrityValidation\s+is\s+Enabled/i)
    expect(output).toMatch(/OnlyLoadAppFromAsar\s+is\s+Enabled/i)
    expect(output).toMatch(/GrantFileProtocolExtraPrivileges\s+is\s+Disabled/i)
  })
})
