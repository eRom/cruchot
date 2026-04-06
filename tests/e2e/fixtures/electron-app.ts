// tests/e2e/fixtures/electron-app.ts
import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers'
import path from 'path'
import os from 'os'
import { mkdtempSync, rmSync, existsSync } from 'fs'

type Fixtures = {
  /** Per-test temp dir for userData, used by the TEST_MODE app. */
  userDataDir: string
  /** App launched with CRUCHOT_TEST_MODE=1 (test helpers exposed). */
  electronApp: ElectronApplication
  /** First window of the TEST_MODE app, awaited until DOM is loaded. */
  window: Page

  /** Per-test temp dir for the prod variant (uses --user-data-dir CLI flag). */
  userDataDirProd: string
  /** App launched WITHOUT CRUCHOT_TEST_MODE — represents prod posture. */
  electronAppProd: ElectronApplication
  /** First window of the prod app. */
  windowProd: Page
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
   * Launches the Electron binary in TEST_MODE. In dev mode (default), targets
   * `out/main/index.js` (electron-vite output). In CRUCHOT_TEST_PACKAGED
   * mode (CI release post-build), uses electron-playwright-helpers to find
   * the .app bundle in `dist/`.
   */
  electronApp: async ({ userDataDir }, use) => {
    const isPackaged = process.env.CRUCHOT_TEST_PACKAGED === '1'
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
        executablePath: appInfo.executable,
      }
    } else {
      const mainPath = path.join(process.cwd(), 'out/main/index.js')
      if (!existsSync(mainPath)) {
        throw new Error('out/main/index.js not found. Run `npm run build` first.')
      }
      launchOptions = { args: [mainPath] }
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
    try {
      await app.close()
    } catch {
      // Electron may have already exited (e.g. test called app.quit()).
    }
  },

  /** First BrowserWindow of the TEST_MODE app, awaited until DOM is loaded. */
  window: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },

  // ── Prod-posture variant ────────────────────────────────────
  // Used by tests that need to verify the production-like configuration:
  // CRUCHOT_TEST_MODE is NOT set, so:
  //   - test-helpers.ipc.ts is never dynamic-imported
  //   - window.api.test is undefined
  //   - app.setPath('userData') is NOT called from test-mode
  //
  // Isolation: we cannot rely on CRUCHOT_TEST_USERDATA here. Instead, we
  // pass Electron's native --user-data-dir CLI flag, which redirects
  // userData without requiring any code change in src/main/.
  // See https://www.electronjs.org/docs/latest/api/command-line-switches#--user-data-dirpath

  userDataDirProd: async ({}, use) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'cruchot-prod-test-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },

  electronAppProd: async ({ userDataDirProd }, use) => {
    const isPackaged = process.env.CRUCHOT_TEST_PACKAGED === '1'
    let launchOptions: Parameters<typeof electron.launch>[0]

    if (isPackaged) {
      const distDir = path.join(process.cwd(), 'dist')
      if (!existsSync(distDir)) {
        throw new Error('dist/ not found. Run `npm run dist:mac` first.')
      }
      const latestBuild = findLatestBuild('dist/')
      const appInfo = parseElectronApp(latestBuild)
      launchOptions = {
        args: [appInfo.main, `--user-data-dir=${userDataDirProd}`],
        executablePath: appInfo.executable,
      }
    } else {
      const mainPath = path.join(process.cwd(), 'out/main/index.js')
      if (!existsSync(mainPath)) {
        throw new Error('out/main/index.js not found. Run `npm run build` first.')
      }
      launchOptions = {
        args: [mainPath, `--user-data-dir=${userDataDirProd}`],
      }
    }

    // CRITICAL: build env WITHOUT CRUCHOT_TEST_MODE / CRUCHOT_TEST_USERDATA.
    // We strip them defensively in case the developer's shell has them set.
    const cleanEnv = { ...process.env }
    delete cleanEnv.CRUCHOT_TEST_MODE
    delete cleanEnv.CRUCHOT_TEST_USERDATA
    delete cleanEnv.CRUCHOT_TEST_PROVIDER
    delete cleanEnv.CRUCHOT_TEST_MODEL
    delete cleanEnv.CRUCHOT_TEST_API_KEY

    const app = await electron.launch({
      ...launchOptions,
      env: {
        ...cleanEnv,
        NODE_ENV: 'production',
      },
      timeout: 20_000,
    })

    await use(app)
    try {
      await app.close()
    } catch {
      // Electron may have already exited.
    }
  },

  windowProd: async ({ electronAppProd }, use) => {
    const win = await electronAppProd.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})

export { expect } from '@playwright/test'
