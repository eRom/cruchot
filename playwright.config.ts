// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 5_000,
  },
  // GitHub Actions sets CI=true automatically
  retries: process.env.CI ? 2 : 0,
  // Electron tests must NOT run in parallel in CI: each worker spawns a full
  // Electron process and they would fight over the display server and races.
  workers: process.env.CI ? 1 : undefined,
  // Catch accidental `test.only(...)` committed to CI
  forbidOnly: !!process.env.CI,
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['list'],
  ],
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  // Pas de `projects` (pas de matrix navigateur) — Electron uniquement
})
