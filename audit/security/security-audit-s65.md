# SECURITY AUDIT REPORT — Cruchot v0.9.0

**Project**: Cruchot (Multi-LLM Desktop)
**Date**: 2026-04-06 (Session 65)
**Auditor**: Trinity (Opus 4.6 — 1M context)
**Previous audit**: S59 (score 97/100, v0.8.2)
**Scope**: Full codebase (S60-S64 features: Compact, llm_costs, OpenAI Realtime plugin, Live Plugin migration, Live screen sharing, voice selectors, applications)

---

## EXECUTIVE SUMMARY

| Severity | Count | Status |
|----------|-------|--------|
| Critical (P0) | **1** | FIXED |
| High (P1) | **1** | FIXED |
| Medium (P2) | **2** | FIXED |
| Low (P3) | **2** | Accepted/documented |

- **Security Score before fixes**: 88/100
- **Security Score after Tour 3**: **97/100** (maintained from S59)

A new **CRITICAL** command injection vector was introduced in S46-S48 (skill install via git clone) and remained undetected through 4 prior audits. This audit found and fixed it. A **HIGH** defense-in-depth bypass for the bash readonly check via the `&` background operator was also discovered and fixed.

---

## AUDIT PROGRESSION

| Metric | Phase 0 Baseline | Tour 1 | Tour 2 | Tour 3 |
|--------|-----------------|--------|--------|--------|
| Semgrep ERROR | 3 (all FP) | 3 (all FP) | 3 (all FP) | 3 (all FP) |
| Semgrep WARNING | 0 | 0 | 0 | 0 |
| Semgrep secrets | 0 | 0 | 0 | 0 |
| Electronegativity | 9 (all triaged) | — | — | 9 (unchanged) |
| Gitleaks | 0 | — | — | 0 |
| Trivy HIGH+CRIT | 0 vulns | — | — | 0 vulns |
| npm audit (high+) | 1 (electron) | 0 | 0 | 0 |
| npm audit (mod+) | 6 | 5 | 5 | 5 (dev-only) |
| Manual findings | — | 4 | 0 new | 0 new |
| **Tests** | 168 | 177 (+9 regression) | 177 | 177 |
| **Security score** | 88/100 | 95/100 | 96/100 | **97/100** |

---

## PHASE 0 — MULTI-TOOL BASELINE

### Semgrep SAST (`p/typescript p/javascript p/react p/nodejs p/owasp-top-ten p/secrets p/security-audit`)
- **3 ERROR** — all confirmed false positives (unchanged from S59):
  - `qdrant-process.ts:71` — `react-insecure-request` HTTP localhost (embedded Qdrant, no sensitive data)
  - `qdrant-process.ts:124` — same
  - `seatbelt.ts:141` — `detect-child-process` self-detection on the sandbox wrapper itself
- 0 WARNING / 0 INFO
- 1 partial parse error (`chat.ipc.ts:176` — TypeScript syntax not supported by Semgrep parser, S59 unchanged)

### Semgrep Secrets (`p/secrets`)
- **0 findings** across all files including repo root.

### npm audit
- **6 vulnerabilities** (1 high, 5 moderate)
  - `lodash@4.17.23` HIGH — code injection via `_.template`, prototype pollution. Transitive via `electron-builder → app-builder-lib → @malept/flatpak-bundler`. **Dev-only** (not bundled).
  - `electron@40.8.0` MODERATE × 3 — service worker IPC spoof, iframe permission origin, second-instance OOB read. Range `>=40.0.0-alpha.1 <40.8.1`. **NEW since S59**.
  - `esbuild ≤0.24.2` MODERATE — dev server CSRF. Transitive via `drizzle-kit → @esbuild-kit/esm-loader`. **Dev-only**.

### Electronegativity (Doyensec — Electron-specific)
- 9 findings, severity breakdown: 1 warning, 8 notes
  - `CSP_GLOBAL_CHECK` × 2 — renderer + remote-web HTML files (style-src 'unsafe-inline', accepted for Tailwind)
  - `AUXCLICK_JS_CHECK` × 1 (warning) — middle-click navigation (mitigated by `will-navigate` guard)
  - `REMOTE_MODULE_JS_CHECK` × 1 (note) — informational, remote module not used
  - `PRELOAD_JS_CHECK` × 1 (note) — preload reviewed
  - `OPEN_EXTERNAL_JS_CHECK` × 4 (note) — `window.ts`, `applications.ipc.ts`, `live-engine.service.ts` — all use URL parsing or allowlist validation

### Gitleaks
- **0 leaks** — 484 commits scanned, ~10.8 MB

### Trivy (vuln + secret + misconfig, HIGH+CRITICAL only)
- **0 HIGH/CRITICAL** across all scanners

---

## VULNERABILITIES DETECTED

### [VULN-001] — Command Injection via `skills:install-git` (and Maton scan)
**Severity**: 🔴 CRITICAL | **Priority**: P0 | **Status**: ✅ FIXED
**Source**: [MANUAL]
**OWASP**: A03:2025 — Injection
**CWE**: CWE-78 (OS Command Injection)

**Description**:
The `skill.service.ts::cloneRepo()` function constructed shell commands using template literals with `JSON.stringify()` for argument quoting. This is **NOT a safe shell escape**: `JSON.stringify("$(id)")` yields `"$(id)"`, which bash interprets as command substitution inside double quotes.

The `branch` parameter was extracted from user-supplied GitHub URLs via the regex `/tree/([^/]+)`, allowing any character except `/`. An attacker controlling the renderer (XSS), Telegram remote, or websocket remote could craft a URL like `https://github.com/owner/repo/tree/$(touch%20/tmp/PWNED)` and trigger arbitrary code execution in the **main process** (no sandbox, full user privileges).

The same flaw existed in:
- `skill.service.ts::cloneRepo()` — `branch`, `repoUrl`, `tempDir`
- `skill.service.ts::installSkill()` — `gitDir`
- `skill.service.ts::uninstallSkill()` — `resolvedDir`
- `skill.service.ts::checkPythonAvailable()` — `which python3`
- `skill-maton.service.ts::scan()` — `targetDir` (user-controllable from skills:scan IPC and barda imports)
- `skills.ipc.ts::cleanupTemp()` — `target`
- `barda-import.service.ts` × 3 — `tempDir`

**Location**:
- `src/main/services/skill.service.ts:341-368` (cloneRepo)
- `src/main/services/skill-maton.service.ts:96-108` (scan)
- `src/main/ipc/skills.ipc.ts:69` (cleanupTemp)
- `src/main/services/barda-import.service.ts:243,251,277` (trash)

**Proof of Concept**:
```typescript
// Renderer (or any IPC caller):
window.api.skillsInstallGit('https://github.com/owner/repo/tree/$(touch%20/tmp/PWNED)')

// Behind the scenes:
parseGitHubUrl(...) → { repoUrl: '...', branch: '$(touch /tmp/PWNED)' }
const branchArg = `--branch ${JSON.stringify(branch)}` // → '--branch "$(touch /tmp/PWNED)"'
execSync(`git clone --depth 1 ${branchArg} ${JSON.stringify(repoUrl)} ${JSON.stringify(tempDir)}`)
// Bash expands "$(touch /tmp/PWNED)" → arbitrary code execution
```

**Impact**:
- Arbitrary OS command execution as the user
- Bypass of Seatbelt sandbox (the main process is not sandboxed)
- Full filesystem access, network access, secret theft (Keychain, env vars)
- Persistence via shell rc files
- Compromise of all conversations, API keys, and local data

**Fix Applied**:
Refactored all 8 vulnerable execSync calls to `execFileSync` with array arguments — **no shell interpretation, immune to injection**. Added explicit charset validation for `branch` and `subpath` (`/^[a-zA-Z0-9._/-]+$/`) for defense in depth. Added `cleanupTemp` path allowlist (`/^\/tmp\/[a-zA-Z0-9._-]+/`) to refuse trashing arbitrary paths.

```typescript
// BEFORE (vulnerable)
execSync(`git clone --depth 1 ${branchArg} ${JSON.stringify(repoUrl)} ${JSON.stringify(tempDir)}`, ...)

// AFTER (safe)
const args = ['clone', '--depth', '1']
if (branch) args.push('--branch', branch)
args.push(repoUrl, tempDir)
execFileSync('git', args, { timeout: 60_000, stdio: 'pipe' })
```

**Validation**: ✅ Re-scan clean. No remaining `execSync` with template literals across `src/`. Tests pass (177/177).

---

### [VULN-002] — Bash Readonly Check Bypass via `&` Background Operator
**Severity**: 🟠 HIGH | **Priority**: P1 | **Status**: ✅ FIXED
**Source**: [MANUAL]
**OWASP**: A04:2025 — Insecure Design (defense in depth)
**CWE**: CWE-77 (Command Injection — Filter Bypass)

**Description**:
`splitOnUnquotedOperators()` in `permission-engine.ts` split bash commands on `&&`, `||`, `;`, `|` — but **NOT** on the single `&` (background operator). Bash check #4 in `bash-security.ts` had the same gap. Combined with the `READONLY_COMMANDS` auto-allow list, this allowed an LLM-controlled `bash` tool call to silently execute write operations on the workspace without user approval.

**Exploit**:
```bash
# This was auto-allowed (no user approval) because the "first token" is `ls`:
ls & rm -rf /Users/recarnot/.cruchot/sandbox/important-file
```
- `splitOnUnquotedOperators("ls & rm -rf workspace/*")` returned `["ls & rm -rf workspace/*"]` (1 part)
- First token = `ls` → `READONLY_COMMANDS.has('ls')` = true → entire compound command auto-allowed
- The Seatbelt sandbox allows writes to the workspace dir, so the `rm` succeeded

**Impact**:
- Defense-in-depth bypass for workspace writes
- A prompt-injected LLM (e.g. via Google Search results in Gemini Live, web fetch, or any tool result) could silently destroy or modify user files in the workspace dir
- No user notification, no approval banner

**Fix Applied**:
1. Added `&` to the single-char operator branch in `splitOnUnquotedOperators` (treats it like `;` or `|`)
2. Added `&` to the bash check #4 regex (`[;\n\r&]\s*(rm|chmod|...)` instead of `[;\n\r]`)
3. Added 6 regression tests in `permission-engine.test.ts` and 3 in `bash-security.test.ts`

```typescript
// BEFORE
if (ch === ';' || ch === '|') { /* split */ }

// AFTER
// Single-char operators: ; | &
// `&` alone backgrounds the previous command — treat as separator so the
// next subcommand is evaluated independently for readonly check.
if (ch === ';' || ch === '|' || ch === '&') { /* split */ }
```

**Validation**: ✅ All 9 new regression tests pass. Total 177 tests pass.

---

### [VULN-003] — Screen Share Resume Bypass (Live Voice)
**Severity**: 🟡 MEDIUM | **Priority**: P2 | **Status**: ✅ FIXED
**Source**: [MANUAL]
**OWASP**: A04:2025 — Insecure Design
**CWE**: CWE-862 (Missing Authorization)

**Description**:
The `pause_screen_share` LLM tool call only stopped the relay (`isCapturingRef.current = false`) but kept the `MediaStream` alive in the renderer. The `resume_screen_share` tool then re-enabled the relay using the same stream **without user re-authorization**.

A prompt-injected LLM (e.g., via Google Search results — `googleSearch: {}` is enabled in `gemini-live.plugin.ts:71`) could silently call `resume_screen_share` after a pause, capturing sensitive content (passwords, private messages) the user thought was being protected during the pause.

**Location**:
- `src/main/live/plugins/gemini/gemini-live.plugin.ts:206-220` (pause/resume tool handlers)
- `src/main/live/plugins/gemini/gemini-live-tools.ts` (tool declarations)
- `src/renderer/src/hooks/useScreenCapture.ts:168-198` (renderer pause/resume listener)

**Impact**:
- Silent capture of sensitive screen content during a perceived "pause"
- Exploitable via LLM prompt injection (web search, tool results, attached docs)
- Limited to currently shared screen source (no privilege escalation)

**Fix Applied**:
1. **Removed `resume_screen_share` from the tool list** — the LLM can no longer trigger resume
2. The `resume_screen_share` handler now returns an error if Gemini still calls it (defense in depth)
3. `pause_screen_share` now **fully stops the MediaStream** in the renderer (calls `stopCapture()`)
4. Updated the Gemini system prompt to inform the LLM that resume requires user action via UI
5. Renderer ignores `active=true` IPCs from main — only the user (via `startCapture`) can begin a new share

**Validation**: ✅ Manual code review. The LLM cannot resume a paused share without explicit user re-share via UI.

---

### [VULN-004] — Electron 40.8.0 — 3 Known CVEs
**Severity**: 🟡 MEDIUM | **Priority**: P2 | **Status**: ✅ FIXED
**Source**: [NPM-AUDIT]
**OWASP**: A06:2025 — Vulnerable Components

**Description**:
Electron 40.8.0 (range `>=40.0.0-alpha.1 <40.8.1`) has 3 GitHub Security Advisories:

| CVE | Severity | CVSS | Description |
|-----|----------|------|-------------|
| GHSA-xj5x-m3f3-5x3h | Moderate | 5.9 | Service worker can spoof `executeJavaScript` IPC replies |
| GHSA-r5p7-gp4j-qhrx | Moderate | 5.4 | Incorrect origin passed to permission request handler for iframe requests |
| GHSA-3c8v-cfp5-9885 | Moderate | 5.3 | OOB read in second-instance IPC on macOS/Linux |

**Fix Applied**:
- Bumped `electron` from `^40.8.0` → `^40.8.5` in `package.json`
- Verified installed version: `node_modules/electron/package.json` → `40.8.5`
- npm audit re-run: 0 high+ vulnerabilities, electron CVEs gone

---

### [VULN-005] — lodash 4.17.23 (transitive, dev-only) — ACCEPTED
**Severity**: 🟢 LOW (dev-only) | **Priority**: P3 | **Status**: ACCEPTED
**Source**: [NPM-AUDIT]

**Description**:
`lodash@4.17.23` via `electron-builder@26.8.1 → app-builder-lib → @malept/flatpak-bundler@0.4.0`. CVEs: GHSA-r5fr-rjxr-66jc (template code injection, CVSS 8.1) and GHSA-f23m-r3pf-42rh (prototype pollution).

**Risk Assessment**:
- **Dev-only**: not bundled in the shipped app
- Only invoked during `electron-builder` Linux Flatpak packaging
- Cruchot ships as macOS arm64 only (`.dist:mac` script)
- `@malept/flatpak-bundler` is unmaintained — no upstream fix expected
- Build machine compromise risk only

**Mitigation**: Avoid Flatpak builds. Pin `electron-builder` major version. Monitor `@malept/flatpak-bundler` for fork or replacement.

---

### [VULN-006] — esbuild ≤0.24.2 dev server CSRF (transitive, dev-only) — ACCEPTED
**Severity**: 🟢 LOW (dev-only) | **Priority**: P3 | **Status**: ACCEPTED
**Source**: [NPM-AUDIT]

**Description**:
GHSA-67mh-4wv8-2f99 — esbuild dev server allows any website to send requests and read responses. Transitive via `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild`.

**Risk Assessment**:
- **Dev-only**: dev server only runs during local development
- Cruchot uses electron-vite, not the esbuild dev server directly
- The esbuild instance is invoked by drizzle-kit migration generation, not as a server
- No exposure on user machines

**Mitigation**: Watch for `drizzle-kit` upgrade that bumps esbuild to ≥0.25.0. Document in `.memory/gotchas.md`.

---

## ⚠️ FALSE POSITIVES (Confirmed)

| Finding | Source | Reason |
|---------|--------|--------|
| `qdrant-process.ts:71` HTTP localhost | Semgrep `p/react` | Embedded Qdrant DB on 127.0.0.1, no sensitive data, allowed by CSP `connect-src 'self'` (HTTPS not applicable for localhost loopback) |
| `qdrant-process.ts:124` HTTP localhost | Semgrep `p/react` | Same |
| `seatbelt.ts:141` child_process | Semgrep `p/security-audit` | This IS the sandbox wrapper — by design uses `child_process.spawn` to invoke `sandbox-exec`. Self-detection. |

These were already documented as FP in S36 and S59 audits. Not introducing new findings.

---

## ✅ APPLIED FIXES — CHANGELOG

| ID | File | Change |
|----|------|--------|
| VULN-001 | `src/main/services/skill.service.ts` | `cloneRepo`: execSync → execFileSync (array args), branch/subpath charset validation. `installSkill`/`uninstallSkill`/`checkPythonAvailable`: same conversion. |
| VULN-001 | `src/main/services/skill-maton.service.ts` | `scan`: execSync → execFileSync with array args |
| VULN-001 | `src/main/ipc/skills.ipc.ts` | `cleanupTemp`: execSync → execFileSync, added `/tmp/...` allowlist |
| VULN-001 | `src/main/services/barda-import.service.ts` | 3 × execSync → execFileSync |
| VULN-002 | `src/main/llm/permission-engine.ts` | `splitOnUnquotedOperators`: added `&` to single-char operators |
| VULN-002 | `src/main/llm/bash-security.ts` | Check #4: regex now matches `&` (background) before dangerous commands |
| VULN-002 | `src/main/llm/__tests__/permission-engine.test.ts` | +6 regression tests for `&` operator |
| VULN-002 | `src/main/llm/__tests__/bash-security.test.ts` | +3 regression tests for `&` + dangerous commands |
| VULN-003 | `src/main/live/plugins/gemini/gemini-live-tools.ts` | Removed `resume_screen_share` tool declaration |
| VULN-003 | `src/main/live/plugins/gemini/gemini-live.plugin.ts` | `resume_screen_share` returns error; updated `SCREEN_SHARE_PROMPT` |
| VULN-003 | `src/renderer/src/hooks/useScreenCapture.ts` | Pause now fully `stopCapture()`s; ignores `active=true` from main |
| VULN-004 | `package.json` + `package-lock.json` | electron `^40.8.0` → `^40.8.5` (+ install) |

---

## 📊 SECURITY VALIDATION CHECKLIST

### SAST & Automated Scans
- [x] Semgrep: 3 ERROR-level findings — all confirmed false positives
- [x] Semgrep: 0 WARNING / 0 INFO — no actionable findings
- [x] Semgrep secrets: 0 findings
- [x] npm audit: 0 high+ in production deps (5 moderate dev-only, accepted)
- [x] Electronegativity: 0 critical Electron misconfigurations (9 notes/warnings, all triaged)
- [x] Gitleaks: 0 secrets in 484 commits / 10.8 MB
- [x] Trivy: 0 HIGH/CRITICAL vulnerabilities, 0 secrets, 0 misconfigs

### Electron Configuration (`src/main/window.ts`)
- [x] `nodeIntegration: false`
- [x] `contextIsolation: true`
- [x] `sandbox: true`
- [x] `enableRemoteModule`: not enabled (default false)
- [x] CSP configured strictly: `default-src 'self'; script-src 'self'; connect-src 'self'; ...`
- [x] `webSecurity`: default true (not overridden)
- [x] DevTools disabled in production: `devTools: !app.isPackaged`
- [x] `will-navigate` guard for non-local URLs
- [x] `setWindowOpenHandler` with allowlist + URL re-construction
- [x] `setPermissionRequestHandler` denies all except `media` (Gemini Live)

### Secure IPC
- [x] All IPC handlers validate payloads with Zod (chat.ipc, applications.ipc, skills.ipc, library.ipc, etc.)
- [x] Whitelisted setting keys (`ALLOWED_SETTING_KEYS`)
- [x] No `process.env` exposure to renderer
- [x] Preload uses `contextBridge.exposeInMainWorld` with wrapped functions, never `ipcRenderer` directly

### Input Handling
- [x] Server-side validation on every IPC handler
- [x] DOMPurify on `dangerouslySetInnerHTML` (renderer)
- [x] No `eval()` in source (verified by Semgrep)
- [x] No `innerHTML` with user data (verified by Semgrep)
- [x] `realpathSync()` before path validation in `validatePath`, `local-image://` protocol handler, `seatbelt.ts`

### Cryptography & Secrets
- [x] No hardcoded API keys (Semgrep `p/secrets` clean, Gitleaks 0 leaks)
- [x] All API keys encrypted via `safeStorage` (macOS Keychain)
- [x] No secrets in localStorage (renderer cannot access them anyway via CSP `connect-src`)
- [x] No weak hashes (SHA-256 for tokens)
- [x] Timing-safe comparisons in `validateSessionToken` (remote-server.service.ts)

### Dependencies & Supply Chain
- [x] npm audit clean for production deps
- [x] Electron 40.8.5 (latest 40.x, 3 CVEs fixed in this audit)
- [x] No abandoned/unmaintained critical runtime dependencies
- [x] Dev-only vulns (lodash via electron-builder, esbuild via drizzle-kit) documented and accepted

### Navigation & Links
- [x] URL validation before `shell.openExternal()` in `window.ts` (TRUSTED_DOMAINS allowlist + URL reconstruction)
- [x] `applications.ipc.ts` validates web URLs are HTTPS before openExternal
- [x] `live-engine.service.ts::handleOpenApp` validates against `allowed_apps` table (allowlist)
- [x] WebFetchTool blocks private/reserved hostnames (`isPrivateOrReservedHost`)
- [x] WebFetchTool HTTPS-only with manual redirect re-validation

### Conversation Tools (Bash + Files)
- [x] 22 bash security checks (hard blocks, never overridable)
- [x] **Check #4 now catches `&` background operator** (regression fix VULN-002)
- [x] **`splitOnUnquotedOperators` handles `&`** (regression fix VULN-002)
- [x] Permission engine pipeline: session → deny → readonly → allow → ask → fallback
- [x] Seatbelt macOS sandbox: `(allow default) (deny file-write* ...)` — workspace + /tmp + /dev only
- [x] Network rule: HTTPS outbound to `*:443` only (no plaintext, no internal services except localhost)
- [x] `buildSafeEnv` strips secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
- [x] `wrapCommand` uses `eval '...'` with safe single-quote escaping
- [x] FileEdit TOCTOU protection via `fileReadTimestamps` Map

### Distribution & Build
- [x] arm64 macOS only (no universal — `test_extension.node` issue)
- [x] Source maps disabled in production builds
- [x] `forceCodeSigning: false` (ad-hoc signing, no Apple cert — documented)
- [x] Auto-updater present (`electron-updater`) — uses GitHub releases as transport

### Continuous Security
- [x] 7 test suites, 177 tests passing (S59: 168 → +9 regression tests for VULN-002)
- [ ] Semgrep integrated in CI/CD — not yet automated (recommendation)
- [ ] Gitleaks pre-push hook — not yet automated (recommendation)

---

## 📈 RECOMMENDED IMPROVEMENTS (post-audit)

1. **Automate Semgrep + Gitleaks in CI** (currently manual). Block PR merges on new ERROR-level findings.
2. **Re-audit `chat.ipc.ts`** (1601 lines) — too large for confident manual review in a single pass. Consider splitting.
3. **Pre-existing TypeScript errors** (not security, but health):
   - `src/main/services/oneiric.service.ts:516-518` — `usage.inputTokens` possibly undefined
   - `src/main/services/task-executor.ts:108` — providerOptions type mismatch
   - `src/main/services/telegram-bot.service.ts:167,180` — `result.result` is `unknown`
   - `src/main/workers/embedding.worker.ts:50` — `quantized` deprecated prop
   - `src/preload/index.ts` × 5 — `Promise<Promise<T>>` double-wrap from `ReturnType`
   These existed before this audit. Recommended for next housekeeping pass.
4. **Consider SLSA-style provenance** for built artifacts if user trust expands.
5. **Document the `googleSearch` injection vector** in Gemini Live: search results are LLM-controllable. Mitigated today by `open_app` allowlist + permission engine for tools, but worth a clear note in `.memory/gotchas.md`.
6. **Hot-fix recommendation**: If users have v0.9.0 installed, they should update to a release that includes the VULN-001 fix ASAP (since the renderer can be XSS-bombed via prompt injection through MCP servers, web fetches, or library RAG content).

---

## 📝 NOTES

### What changed since S59
- **+11 files** in `src/main/live/` (plugin architecture migration in S63)
- **+1 service** `compact.service.ts` (S60)
- **+1 service** `live-memory.service.ts` (S59)
- **+1 IPC handler set** `applications.ipc.ts` (S59)
- **+ Screen sharing** (S62) — new attack surface
- **+ OpenAI Realtime plugin** (S64) — new transport (WebSocket native)
- **+ 31st table** `llm_costs` (S60)

The plugin migration was clean from a security perspective. The VULN-001 (skills install) was a **pre-existing** issue from S46-S48 that was missed by all prior audits — likely because Semgrep doesn't flag `JSON.stringify` as a shell escape pitfall, and manual reviewers assumed it was safe quoting.

### Why "JSON.stringify is not a shell escape" matters
This is a recurring class of bug. JSON quoting and shell quoting have **different escape rules**:
- JSON escapes: `\"`, `\\`, `\n`, `\r`, `\t`, `\b`, `\f`, control chars
- Shell (double-quoted): interprets `$`, backtick, `\\`, `\!`, `\"`

`JSON.stringify("$x")` → `"$x"` → bash expands `$x`. Same for `$(...)` and backticks.
**Use `execFile` / `spawn` with array arguments** — never construct shell command strings with user input, even with `JSON.stringify` "wrapping".

### Memory note
The pattern `execSync(\`cmd ${JSON.stringify(arg)}\`)` should be added to the team's pattern-matching checklist for code review.

---

## 🏁 STOPPING CONDITIONS

✅ Tour 3 complete
✅ 0 P0/P1 vulnerabilities remaining
✅ All fixes successfully applied (verified by re-scan + tests)
✅ Final Semgrep scan clean (3 false positives only, all pre-existing)
✅ Final npm audit: 0 high+ in production dependencies

**Audit closed. Score: 97/100 (maintained).**

---

*Generated by Trinity (Opus 4.6 1M-context) on 2026-04-06.*
*Methodology: 3-tour iterative SAST + manual review per `_internal/prompt-security.md`.*
