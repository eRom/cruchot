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
    let launchOptions: Parameters<typeof electron.launch>[0]

    if (isPackaged) {
      const latestBuild = findLatestBuild('dist/')
      const appInfo = parseElectronApp(latestBuild)
      launchOptions = {
        args: [appInfo.main],
        executablePath: appInfo.executable, // required on macOS arm64
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
      env: {
        ...process.env,
        NODE_ENV: 'production',
        CRUCHOT_TEST_MODE: '1',
        CRUCHOT_TEST_USERDATA: userDataDir,
      },
      timeout: 20_000,
    })

    await use(app)
    await app.close()
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
