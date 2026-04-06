// tests/e2e/fixtures/electron-app.ts
import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers'
import path from 'path'
import os from 'os'
import { mkdtempSync, rmSync, existsSync } from 'fs'

type Fixtures = {
  electronApp: ElectronApplication
  window: Page
  userDataDir: string
}

export const test = base.extend<Fixtures>({
  /**
   * Per-test temp directory for `userData`. Cruchot's main process will
   * call `app.setPath('userData', this)` because we set CRUCHOT_TEST_MODE=1
   * and CRUCHOT_TEST_USERDATA below. Cleaned up after each test.
   */
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cruchot-test-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },

  /**
   * Launches the Electron binary. In dev mode (default), targets
   * `out/main/index.js` (electron-vite output). In CRUCHOT_TEST_PACKAGED
   * mode (CI release post-build), uses electron-playwright-helpers to find
   * the .app bundle in `dist/`.
   */
  electronApp: async ({ userDataDir }, use) => {
    const isPackaged = process.env.CRUCHOT_TEST_PACKAGED === '1'
    // No named ElectronLaunchOptions export from @playwright/test — Parameters<> is the right approach.
    let launchOptions: Parameters<typeof electron.launch>[0]

    if (isPackaged) {
      const distDir = path.join(process.cwd(), 'dist')
      if (!existsSync(distDir)) {
        throw new Error('dist/ not found. Run `npm run dist:mac` first.')
      }
      const latestBuild = findLatestBuild('dist/')
      const appInfo = parseElectronApp(latestBuild)
      launchOptions = {
        args: [appInfo.main],
        // required in packaged mode — Playwright cannot find the executable inside .app on its own
        executablePath: appInfo.executable,
      }
    } else {
      const mainPath = path.join(process.cwd(), 'out/main/index.js')
      if (!existsSync(mainPath)) {
        throw new Error(
          'out/main/index.js not found. Run `npm run build` first.'
        )
      }
      launchOptions = {
        args: [mainPath],
      }
    }

    const app = await electron.launch({
      ...launchOptions,
      // NOTE: spreads process.env to inherit PATH/HOME/LANG/etc. needed by Electron.
      // This also leaks dev API keys (OPENAI_API_KEY, etc.) into the subprocess —
      // harmless for Phase 1 security specs, but Phase 2 (LLM tests) should consider
      // an env allowlist if any spec might log or persist env contents.
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CRUCHOT_TEST_MODE: '1',
        CRUCHOT_TEST_USERDATA: userDataDir,
      },
      timeout: 20_000,
    })

    await use(app)
    try {
      await app.close()
    } catch {
      // Electron may have already exited (e.g. test called app.quit()).
      // Swallow to ensure userDataDir teardown still runs.
    }
  },

  /**
   * The first BrowserWindow created by the app, awaited until DOM is loaded.
   */
  window: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})

export { expect } from '@playwright/test'
