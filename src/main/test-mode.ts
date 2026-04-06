/**
 * Test mode flags read from environment variables.
 *
 * Phase 1 scope: only `TEST_MODE` and `TEST_USERDATA`. They allow Playwright
 * E2E tests to launch the Electron binary with an isolated `userData`
 * directory (each test run gets its own SQLite DB, Qdrant storage, settings).
 *
 * Phase 2 will add `TEST_PROVIDER`, `TEST_MODEL`, `TEST_API_KEY` and a
 * companion `assertTestMode()` helper for IPC test handlers.
 *
 * IMPORTANT: this module must NEVER import from outside `src/main/`.
 * It is also imported elsewhere (e.g. test-helpers.ipc.ts in Phase 2),
 * so keep it tiny and side-effect free.
 *
 * NOTE: values are captured at module load time. Mutating `process.env`
 * after import has no effect on the exported constants. Tests that need
 * fresh values must call `vi.resetModules()` and re-import.
 */
export const TEST_MODE = process.env.CRUCHOT_TEST_MODE === '1'
export const TEST_USERDATA = process.env.CRUCHOT_TEST_USERDATA
