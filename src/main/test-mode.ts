/**
 * Test mode flags read from environment variables.
 *
 * Phase 1 scope: TEST_MODE + TEST_USERDATA — used by index.ts to redirect
 * `app.setPath('userData', ...)` so Playwright E2E tests don't pollute the
 * real Cruchot install.
 *
 * Phase 2a adds: TEST_PROVIDER, TEST_MODEL, TEST_API_KEY (consumed by index.ts
 * to seed the LLM provider settings before whenReady, see Task 4) and
 * assertTestMode() (defense-in-depth guard for IPC test handlers).
 *
 * IMPORTANT: this module must NEVER import from outside `src/main/`.
 * It is also imported by test-helpers.ipc.ts (Phase 2a),
 * so keep it tiny and side-effect free.
 *
 * NOTE: values are captured at module load time. Mutating `process.env`
 * after import has no effect on the exported constants. Tests that need
 * fresh values must call `vi.resetModules()` and re-import.
 */
export const TEST_MODE = process.env.CRUCHOT_TEST_MODE === '1'
export const TEST_USERDATA = process.env.CRUCHOT_TEST_USERDATA
export const TEST_PROVIDER = process.env.CRUCHOT_TEST_PROVIDER
export const TEST_MODEL = process.env.CRUCHOT_TEST_MODEL
export const TEST_API_KEY = process.env.CRUCHOT_TEST_API_KEY

/**
 * Defense-in-depth guard to call from every IPC test handler before any
 * action. The dynamic import gate in index.ts already ensures the handler
 * is never registered in prod, but assertTestMode() catches any future
 * mistake (e.g. a developer accidentally importing test-helpers.ipc from
 * a non-test code path).
 *
 * Throws Error with a clear message if TEST_MODE is not set.
 */
export function assertTestMode(): void {
  if (!TEST_MODE) {
    throw new Error(
      '[test-mode] Test handler called outside CRUCHOT_TEST_MODE. ' +
      'This handler must NEVER be reachable in production.'
    )
  }
}
