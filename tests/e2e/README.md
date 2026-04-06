# Cruchot E2E tests

Suite Playwright Electron pour valider Cruchot en runtime sur le binaire reel.

## Layers (test strategy 3-tier hourglass)

| Layer | Path | When |
|---|---|---|
| Unit | `src/main/**/__tests__/*.test.ts` | `npm test` (vitest) |
| **E2E security** | `tests/e2e/security/*.spec.ts` | `npm run test:e2e:security` |
| E2E flows (Phase 2) | `tests/e2e/flows/*.spec.ts` | `npm run test:e2e:flows` |

This README documents the E2E layer only. For the full strategy, see
`_internal/specs/2026-04-06-test-strategy-design.md`.

## Prerequisites

- `npm run build` must have run (the fixture launches `out/main/index.js`)
- For the `fuses.spec.ts` test: `npm run dist:mac` + `CRUCHOT_TEST_PACKAGED=1`

## Commands

```bash
# Run only the security suite (~30s, no LLM)
npm run test:e2e:security

# Run with visible window (debug)
npm run test:e2e:headed -- tests/e2e/security/

# Interactive debug mode
npm run test:e2e:debug -- tests/e2e/security/preload-allowlist.spec.ts

# Run a single spec
npm run test:e2e:security -- tests/e2e/security/webpreferences.spec.ts

# Open the HTML report after a failed run
npx playwright show-report
```

## Snapshots

The `preload-allowlist.spec.ts` test uses Playwright snapshots to lock down
the list of methods exposed by `window.api`. The snapshot lives at:

```
tests/e2e/security/preload-allowlist.spec.ts-snapshots/window-api-keys-darwin.txt
```

Note: Playwright auto-appends the OS name (`-darwin`, `-linux`, `-win32`).
If CI is added on Linux/Windows later, those platforms will generate their
own `-linux.txt` / `-win32.txt` snapshots that need to be committed.

When you intentionally add or remove a preload method:

```bash
npx playwright test --update-snapshots tests/e2e/security/preload-allowlist.spec.ts
git add tests/e2e/security/preload-allowlist.spec.ts-snapshots/
git commit -m "test(preload): update allowlist snapshot for new methods"
```

## Specs index

| Spec | Tests | What it validates |
|---|---|---|
| `preload-allowlist.spec.ts` | 3 | `window.api` exposes the snapshot-locked set, `ipcRenderer` not exposed, sanity floor (>200 methods) |
| `webpreferences.spec.ts` | 5 (1 skipped) | Behavioral checks: `require` undefined, devTools closed, Auxclick disabled, cross-origin iframe blocked, eval blocked (skipped — see CSP hardening spec) |
| `csp-and-navigation.spec.ts` | 4 | `setWindowOpenHandler` deny, no popup window created, will-navigate guard, CSP meta tag present |
| `protocols.spec.ts` | 2 | `local-image://` registered, external HTTPS fetch rejected |
| `renderer-no-node.spec.ts` | 6 | No `require`/`__dirname`/`__filename`/`Buffer`/`global`/`process` in renderer |
| `dialogs.spec.ts` | 2 | `stubDialog` smoke for showOpenDialog/showSaveDialog (Phase 2 reuse) |
| `fuses.spec.ts` | 1 (skipped in dev) | `@electron/fuses` flips on packaged binary (gated by `CRUCHOT_TEST_PACKAGED=1`) |

**Total**: ~23 tests, 21 passing + 2 skipped in dev mode (~12s on macOS).

## Adding a new security spec

1. Create `tests/e2e/security/<name>.spec.ts`
2. Import `test, expect` from `../fixtures/electron-app` (NOT directly from `@playwright/test`, unless your spec doesn't launch Electron — see `fuses.spec.ts` for that pattern)
3. Use `electronApp.evaluate(({ dialog, protocol, BrowserWindow }) => ...)` for main process introspection
4. Use `window.evaluate(() => window.something)` for renderer introspection
5. Assert on **structural facts** (e.g. `expect(sandbox).toBe(true)`), not on text content
6. If your test needs `window` only as a fixture dependency (not used directly), use `window: _window` rename
7. Run, validate, commit (and snapshot if applicable)

## Debugging a failure

1. Run `npx playwright show-report` to open the HTML report (screenshot + video + trace)
2. Re-run with `--headed` to see the window
3. Re-run with `--debug` for the Playwright Inspector
4. Check `playwright-report/` for artifacts

## CI

The security suite runs on every PR via `.github/workflows/ci.yml` (macos-latest).
On failure, the HTML report is uploaded as `playwright-security-report` artifact
(7-day retention).

## What is NOT tested here

See the full list of "trous laissés volontairement" in
`_internal/specs/2026-04-06-test-strategy-design.md` (section 11). Highlights:

- Live voice (Gemini/OpenAI) — too complex
- MCP servers runtime — handled in unit tests
- Auto-updater — manual validation post-release
- Library RAG / Arena — manual checklist in `cruchot-release` skill
- Multi-window scenarios — Cruchot is mono-window
- E2E flows with LLM — Phase 2 (separate plan)

## Known limitations

- **`eval()` not blocked by CSP**: Cruchot delivers CSP via `<meta>` tag only, which per HTML spec doesn't block eval. The test for this is currently `test.skip()`. Tracked in `_internal/specs/2026-04-06-csp-header-hardening.md` for fix.
- **Cross-platform snapshots**: Playwright auto-suffixes snapshots with OS name. The committed `-darwin.txt` snapshot won't match on a Linux/Windows runner. Add platform-specific snapshots when those CI runners are added.
