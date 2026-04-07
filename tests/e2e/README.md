# Cruchot E2E tests

Suite Playwright Electron pour valider Cruchot en runtime sur le binaire reel.

## Layers (test strategy 3-tier hourglass)

| Layer | Path | When | Count | Where |
|---|---|---|---|---|
| Unit | `src/main/**/__tests__/*.test.ts` | `npm test` (vitest) | 251 (10 suites, ~1.5s) | local + CI (PR + release) |
| **E2E security** | `tests/e2e/security/*.spec.ts` | `npm run test:e2e:security` | 22 + 2 skipped (~12s) | local + CI (PR via ci.yml) |
| **E2E flows** | `tests/e2e/flows/*.spec.ts` | `npm run test:e2e:flows` | 6 specs (~1.4 min on Ollama qwen3.5:4b) | **local only** (pre-release via `cruchot-release` skill etape 2.6) |

**Total at Phase 2b2** : 251 vitest + 22 security + 6 flows = **279 passing + 2 skipped**.

**Why E2E flows are local-only** : a CI job on `gemini-3-flash-preview` was attempted in Phase 2b2 (run 24067368479) but 5/6 specs failed because they were over-fitted to qwen3.5:4b's specific output format. Plus the CI duration was ~20 min, frustrating for solo dev workflow. The pivot decision (2026-04-06) keeps the flows running on Ollama locally, gated by the `cruchot-release` skill etape 2.6 — same protection (a regression blocks the tag), much faster (~1.4 min vs ~20 min), no API cost. See `.claude/skills/cruchot-release/SKILL.md` etape 2.6 for the runtime contract.

This README documents the E2E layer only. For the full strategy, see
`_internal/specs/2026-04-06-test-strategy-design.md`.

## Prerequisites

- `npm run build` must have run (the fixture launches `out/main/index.js`)
- For the `fuses.spec.ts` security test: `npm run dist:mac` + `CRUCHOT_TEST_PACKAGED=1`
- For the **flow specs** (`npm run test:e2e:flows`):
  - **Required**: Ollama running with `qwen3.5:4b` installed (`ollama pull qwen3.5:4b` then `ollama serve`)
  - The `scripts/test-e2e-setup.sh` script invoked by the `test:e2e:flows` npm script handles the warmup automatically. If Ollama is down or the model is missing, the script fails clean with a clear error.

## Commands

```bash
# Run only the security suite (~12s, no LLM)
npm run test:e2e:security

# Run only the flow specs (~1.4 min on Ollama qwen3.5:4b)
npm run test:e2e:flows

# Run a single flow spec
npm run test:e2e:flows -- tests/e2e/flows/03-compact.spec.ts

# Run vitest + security + flows in one go (the "victory lap" — same as cruchot-release etape 2.6)
npm run test:all

# Run with visible window (debug)
npm run test:e2e:headed -- tests/e2e/security/

# Interactive debug mode
npm run test:e2e:debug -- tests/e2e/security/preload-allowlist.spec.ts

# Run a single security spec
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

**Total**: ~23 tests, 22 passing + 2 skipped in dev mode (~12s on macOS).

## Flow specs index (Phase 2a + 2b1)

| Spec | Phase | What it validates | Notable behaviors |
|---|---|---|---|
| `01-chat-basic.spec.ts` | 2a (S69) | Chat send → DB row counts → reload survival | PoC, the simplest end-to-end |
| `02-multi-provider.spec.ts` | 2b1 T4 (S70) | Switch Ollama → openai (no key) → switch back | 2 conversations forced by ChatView re-pin (`InputZone:695` stamps `modelId`); error asserted by row absence (no `messages.error` column) |
| `03-compact.spec.ts` | 2b1 T6 (S70) | Compact persistence + boundary id + llm_costs row | Uses `summaryOverride` bypass to skip the real `fullCompact()` LLM call (qwen3.5:4b is reasoning-only and hangs on the compact prompt; the bypass mirrors the production rounds-walk + persistence + cost tracking) |
| `04-conversation-tools.spec.ts` | 2b1 T7 (S70) | Tool approval flow → bash/writeFile execution | Prompt asks "Create empty file" (qwen tool-calls `writeFile()` deterministically). NOTE: `echo HELLO > file` does NOT trigger the banner because `echo` is in `READONLY_COMMANDS` and `splitOnUnquotedOperators` does NOT split on `>` |
| `05-memory-layers.spec.ts` | 2b1 T9 (S70) | Memory fragment → system prompt injection | Pure plumbing, no LLM call. Uses `test:get-system-prompt` IPC helper |
| `06-export-import-mlx.spec.ts` | 2b1 T10 (S70) | Export → import .mlx round trip | `.mlx` is AES-256-GCM encrypted (NOT a ZIP). Asserts `size > 28` (header bytes) + successful round-trip via `importBulk()` decrypt |

**Side-effects-only assertion convention** : NEVER assert on the textual content of an LLM response. Legal asserts: DB row counts, `provider_id`/`model_id` columns, file existence, encrypted file header bytes, IPC return values, system prompt CONSTRUCTION (via `test:get-system-prompt`). The `FAKE_SUMMARY` constant in `03-compact.spec.ts` is a legal exact-equality assertion because it's the test's own input round-tripped through the persistence layer, not an LLM output.

**Provider lock** : the flow specs are tightly coupled to Ollama `qwen3.5:4b`'s specific output format (tool-call timing, content shape, response structure). A Phase 2b2 attempt to run them on `gemini-3-flash-preview` failed 5/6 specs (run 24067368479). For now, the specs are **Ollama-only** by convention. If Cruchot needs to validate against multiple providers in the future, each spec needs provider-conditional assertions.

## Test-mode IPC helpers

The flow specs use 4 test-only IPC handlers exposed under `window.api.test.*` when `CRUCHOT_TEST_MODE=1`. They are dynamic-imported in `src/main/ipc/test-helpers.ipc.ts` (NOT bundled into the production build, gated by `assertTestMode()`):

| Handler | Purpose | Validation |
|---|---|---|
| `test:db-select` | Read-only SELECT against the SQLite DB | 7-stage SQL pipeline + `READABLE_TABLES` whitelist (5 tables : `conversations`, `messages`, `memory_fragments`, `llm_costs`, `roles`) + FORBIDDEN_TOKENS regex |
| `test:seed-messages` | Insert N synthetic messages into a conversation | Zod count 1..500 + role enum |
| `test:trigger-compact` | Direct call to `compactService.fullCompact()` orchestration mirror | Zod conversationId + `contextWindowOverride?: number` (force small window) + `summaryOverride?: string` (bypass total LLM call) |
| `test:get-system-prompt` | Build the system prompt via `buildSystemPrompt` | Computes memory + profile blocks (Phase 2b1 scope) |

The `test` key is a single top-level entry on `window.api`, so the preload allowlist snapshot stays at 296 lines (`window-api-keys-with-test-darwin.txt`) while the production snapshot is 295 (`window-api-keys-darwin.txt`).

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

Two CI workflows exercise SOME of the test layers — the flow specs are NOT in CI by design (see "Why E2E flows are local-only" at the top of this file) :

1. **`.github/workflows/ci.yml`** runs on every PR (macos-latest) :
   - `npm test` (vitest)
   - `npm run test:e2e:security` (no LLM)
   - On failure, uploads `playwright-security-report` artifact (7-day retention)

2. **`.github/workflows/release.yml`** runs on tag push (`v*`) :
   - Job `security-gate` (npm audit + lockfile-lint + Dependabot security PR check)
   - Job `release` matrix 3 OS (mac/win/linux), depends on `security-gate`
   - **No `e2e-flows` job** — the flow specs run locally as part of the `cruchot-release` skill etape 2.6 pre-check (see `.claude/skills/cruchot-release/SKILL.md`). A regression blocks the tag because the skill stops the pipeline before pushing.

The flow specs are exclusively local because :
- They take ~1.4 min on Ollama qwen3.5:4b vs ~20 min in CI on Linux runners
- They are tightly coupled to qwen3.5:4b's output format (Phase 2b2 attempt on `gemini-3-flash-preview` failed 5/6 specs in run 24067368479)
- The `cruchot-release` skill enforces the local check on every release tag, providing the same protection

## What is NOT tested here

See the full list of "trous laissés volontairement" in
`_internal/specs/2026-04-06-test-strategy-design.md` (section 11). Highlights:

- Live voice (Gemini/OpenAI) — too complex
- MCP servers runtime — handled in unit tests
- Auto-updater — manual validation post-release
- Library RAG / Arena — manual checklist in `cruchot-release` skill
- Multi-window scenarios — Cruchot is mono-window
- The real `compactService.fullCompact()` LLM call — `03-compact.spec.ts` uses the `summaryOverride` bypass to stay deterministic regardless of model behavior. Future work: add a vitest unit test for `compactService` if/when the maxTokens is parameterized
- The real `generateImage()` flow — out of scope for Phase 2b1, can be added later
- Telegram + Remote Web E2E — out of scope, validated manually
- **Multi-provider flow validation** — flows are Ollama qwen3.5:4b only (see "Provider lock" in the Flow specs index). A future task could add provider-conditional setup if needed

## Known limitations

- **`eval()` not blocked by CSP**: Cruchot delivers CSP via `<meta>` tag only, which per HTML spec doesn't block eval. The test for this is currently `test.skip()`. Tracked in `_internal/specs/2026-04-06-csp-header-hardening.md` for fix.
- **Cross-platform snapshots**: Playwright auto-suffixes snapshots with OS name. The committed `-darwin.txt` snapshot won't match on a Linux/Windows runner. As of Phase 2b2 the only snapshotted spec is `preload-allowlist.spec.ts` which lives in the security layer (macos-latest CI), so this is not a problem in practice yet.
- **`03-compact` does not exercise the real LLM compact call** : intentional, see "What is NOT tested here" above. The `summaryOverride` bypass keeps the test deterministic on Ollama qwen3.5:4b.
- **qwen3.5:4b is reasoning-only** : it emits everything in `<think>` tags for "structured prose" prompts, leaving `result.text` empty. This breaks the real `compactService.fullCompact()` LLM call locally. The 03-compact spec works around it via `summaryOverride`. Tool calling for simple deterministic prompts (like 04-conversation-tools `Create empty file`) works fine — the issue is specific to long structured outputs.
- **Cruchot has no `gemini-2.5-flash` model** : the registry (`src/main/llm/registry.ts:235/249`) only defines `gemini-3-flash-preview` and `gemini-3.1-pro-preview`. Phase 2b2 originally planned to use one of these for CI but pivoted to local-only (see top of file).
- **Flow specs are Ollama-only** : Phase 2b2 attempted to run them on `gemini-3-flash-preview` in CI (run 24067368479) but 5/6 specs failed. The specs are tightly coupled to qwen3.5:4b's output format. Provider portability is a separate workstream.
- **`instance-token.service.ts` race in fresh userDataDir** : observed in the failed CI run (run 24067368479, spec 06-export-import-mlx). The deferred init in `index.ts:250` may not finish before the test calls `export:bulk`. Locally not a problem because Ollama warmup gives time for init. If you ever need to run the flows without Ollama warmup, you'll hit this race — fix by making `ensureInstanceToken()` synchronous in the IPC handler entry.
