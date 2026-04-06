# Security Policy — Cruchot

> Last updated: 2026-04-06 (S66)
> Owner: Romain (eRom)
> Audit history: `audit/security/security-audit-sNN.md`

## Severity SLA

When a vulnerability is reported, detected by an audit, or surfaced by an automated scanner (Dependabot, Semgrep, CodeQL, npm audit, lockfile-lint, audit-bundle, Trivy, Gitleaks, Socket), the following SLA applies:

| Severity | First response | Patch SLA | Release SLA | Block release? |
|----------|---------------|-----------|-------------|----------------|
| 🔴 **Critical** (P0) | < 4h | < 24h | Hot-fix immediate | YES |
| 🟠 **High** (P1) | < 24h | < 7 days | Next planned release (may be hot-fix) | YES |
| 🟡 **Medium** (P2) | < 3 days | < 30 days | Next minor release | NO |
| 🟢 **Low** (P3) | < 7 days | Backlog (review quarterly) | Next major release | NO |

**"Block release"** means the GitHub Actions release workflow refuses to publish an artifact. See `.github/workflows/release.yml` security-gate job.

## What counts as Critical / High / Medium / Low?

### 🔴 Critical (P0) — IMMEDIATE
- Remote code execution (RCE) reachable from any external input (renderer XSS, MCP, Telegram, WS, web fetch, library RAG, prompt injection)
- Arbitrary command execution in the main process
- Mass data theft (all conversations, all API keys)
- Complete sandbox escape from the LLM bash tool
- Hardcoded production secret leaked publicly
- Auto-updater compromise allowing tampered asar to load

### 🟠 High (P1) — < 7 days
- Defense-in-depth bypass that requires a precondition (e.g. local file access)
- Single-user data exfiltration via a tool
- Privilege escalation within the sandbox
- Supply-chain compromise of a transitive dep used at runtime
- Stored XSS in conversation rendering
- SQL injection in a Drizzle raw query
- Bypass of `forceCodeSigning: false` compensating controls (asar integrity, fuses)

### 🟡 Medium (P2) — < 30 days
- Reflected XSS requiring user interaction
- Information disclosure of non-sensitive metadata
- CSRF on a non-sensitive endpoint
- Missing input validation on a low-impact path
- Permission engine misconfiguration (rule order, glob mismatches)
- Dev-server CSRF / data leak (esbuild, drizzle-kit)
- Sourcemap leak in production binary

### 🟢 Low (P3) — backlog
- Minor configuration drift
- Version information exposure
- Missing security headers on a non-shipped surface
- Unmaintained dev-only deps (electron-builder transitives)
- Non-exploitable code smell

## Process per severity

### Critical (P0) hot-fix
1. **Triage** (within 4h): confirm exploitability, document scope
2. **Fix** (within 24h):
   - Branch from `main`
   - Apply minimal patch
   - Add regression test (`src/main/llm/__tests__/`)
   - Run full test suite (177+)
   - Pass through `/cruchot-security-review` skill (delta audit)
3. **Release**:
   - `/cruchot-push-main` → commit + push
   - `/release patch` → bump patch + tag + GitHub Actions release
   - GitHub Release notes prefixed `[SECURITY]`
4. **Disclose**:
   - Post-release security advisory in GitHub Releases
   - Update `audit/security/security-audit-sNN.md` with the new vulnerability ID
   - Add the pattern to the `cruchot-security-review` skill if generalizable

### High (P1)
Same as P0 but the patch can ride a planned release (check if one is scheduled within 7 days). If not, hot-fix.

### Medium (P2)
- Logged in `audit/security/POLICY.md` as a tracked exception OR fixed in the next minor release
- No release block

### Low (P3)
- Backlog item, reviewed quarterly during a security audit pass
- Acceptable to defer indefinitely if no upgrade path exists

## Accepted exceptions (current)

These are known issues that have been triaged and explicitly accepted with documented compensating controls. Re-evaluate at every audit.

| ID | Severity | Description | Compensating control | Re-eval |
|----|----------|-------------|----------------------|---------|
| `lodash@4.17.23` (transitive via `@malept/flatpak-bundler`) | High (dev-only) | CVE-2026-4800 code injection + prototype pollution | **Dev-only** — not bundled in the shipped app. Cruchot ships macOS arm64 only via electron-builder, no Flatpak target. Build machine compromise risk only. | Watch for `@malept/flatpak-bundler` successor |
| `esbuild ≤ 0.24.2` (transitive via `drizzle-kit`) | Moderate (dev-only) | Dev server CSRF (GHSA-67mh-4wv8-2f99) | **Dev-only** — Cruchot uses electron-vite, not the esbuild dev server. drizzle-kit only invokes esbuild for migration generation, not as a server. | Watch for `drizzle-kit` esbuild bump ≥ 0.25 |
| `forceCodeSigning: false` + `notarize: false` + `hardenedRuntime: false` | High | No Apple Developer cert, ad-hoc signing only | **Compensated by `@electron/fuses`** flipped via `scripts/afterPack.js`: `EnableEmbeddedAsarIntegrityValidation: true` refuses tampered asar at load time. **Critical** — if fuses are disabled, this exception becomes unacceptable. | Re-evaluate when an Apple Developer cert is acquired |
| Auxclick suspected on older builds (< S66) | Medium | Middle-click could bypass `setWindowOpenHandler` | Fixed in S66 via `disableBlinkFeatures: 'Auxclick'` in `window.ts` | n/a (closed) |

**Removing an exception**: file a PR that touches both this table AND the underlying issue (or its mitigation). Single-side removals are not allowed.

## Reporting a vulnerability

**Public disclosure**: open a GitHub issue at `eRom/cruchot` with the `security` label. For non-critical findings, public reporting is fine.

**Coordinated disclosure** (critical or high): email the maintainer privately or use GitHub Security Advisories (`Security` tab → `Report a vulnerability`). 4h first response SLA applies.

## Continuous security stack

| Tool | Trigger | Where |
|------|---------|-------|
| **CI workflow** (`ci.yml`) | Every push to main + every PR | npm audit (high+), lockfile-lint, typecheck, build |
| **Release workflow** (`release.yml`) | Every `v*` tag push | security-gate job (npm audit high+, lockfile-lint, Dependabot alerts), build, audit-bundle, fuses verification |
| **Dependabot security updates** | On every new GHSA matching a dep | Auto-PR opened, must be merged before next release |
| **Dependabot version updates** | Weekly Mondays 06:00 Europe/Paris | Auto-PR opened, grouped by patch/minor |
| **`/cruchot-security-review` skill** | On-demand (manual) or after major refactor | 3-tour audit pipeline with 9 scanners + STRIDE + runtime tests |
| **Audit cadence** | After every `release/X.Y.0` minor (planned) and after every "significant" feature (e.g. new IPC surface, new external integration) | Manual via skill, report committed to `audit/security/security-audit-sNN.md` |

## Hall of fame — past audits

| Session | Date | Score | Highlights |
|---------|------|-------|-----------|
| S36 | 2026-?? | 97/100 | First exhaustive audit, baseline |
| S42 | 2026-?? | maintained | YOLO mode + sandbox introduction |
| S48 | 2026-?? | maintained | Seatbelt + permission engine |
| S49 | 2026-?? | maintained | Improvement train |
| S59 | 2026-04-04 | 97/100 | lodash CVE fix, post-Live Voice review |
| S65 | 2026-04-06 | 97/100 | **CRITICAL** command injection via skills:install-git, bash `&` bypass, screen share resume bypass — all fixed, hot-fix v0.9.1 |
| S66 | 2026-04-06 | 98/100 | Auxclick fix, env leak in skill-maton, MCP command allowlist, argparse separator. Plus `@electron/fuses` wired in afterPack hook. |
