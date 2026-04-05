# SECURITY AUDIT REPORT — Cruchot v0.8.2

**Project**: Cruchot (Multi-LLM Desktop)
**Date**: 2026-04-04 (Session 59)
**Auditor**: Trinity (Opus 4.6)
**Previous audit**: S36 (score 97/100)
**Scope**: Full codebase (S55-S58 features: Episodic Memory, Oneiric Consolidation, Gemini Live Voice, VCR Recording, Skills)

---

## EXECUTIVE SUMMARY

- Critical Vulnerabilities: **0**
- High Vulnerabilities: **1** (FIXED)
- Medium Vulnerabilities: **2** (FIXED)
- Low Vulnerabilities: **4** (accepted/documented)
- **Security Score: 97/100** (maintained)

All P0/P1 vulnerabilities fixed. All P2 vulnerabilities fixed. No regressions.

---

## AUDIT PROGRESSION

| Metric | Phase 0 Baseline | Tour 1 | Tour 2 | Tour 3 |
|--------|-----------------|--------|--------|--------|
| Semgrep ERROR | 3 (all FP) | 3 (all FP) | 3 (all FP) | 3 (all FP) |
| Semgrep WARNING | 0 | 0 | 0 | 0 |
| Semgrep INFO | 0 | 0 | 0 | 0 |
| Semgrep Secrets | 0 | 0 | 0 | 0 |
| Electronegativity | 10 (review) | 10 (all triaged) | — | 10 (unchanged) |
| Gitleaks | 0 | 0 | — | 0 |
| Trivy HIGH+ | 1 | 1 | 0 | 0 |
| npm audit HIGH+ | 7 | 7 | 0 | 0 |
| Manual findings | — | 6 | 6 | 6 |
| Total vulnerabilities | — | 7 | 4 (3 fixed) | 4 (all low) |
| Security score | — | 94/100 | 96/100 | **97/100** |

---

## PHASE 0 — MULTI-TOOL BASELINE

### Semgrep SAST (src/)
- **3 ERROR** — all confirmed false positives:
  - `qdrant-process.ts:71,124` — HTTP to localhost:6333 (embedded Qdrant). No sensitive data.
  - `seatbelt.ts:141` — child_process detection on sandbox wrapper itself.
- 0 WARNING, 0 INFO
- 1 partial parse error (`chat.ipc.ts:175` — TypeScript syntax unsupported by Semgrep parser)

### Semgrep Secrets
- **0 findings** across all files including root config.

### npm audit
- **7 HIGH** — all `lodash-es@4.17.23` via `mermaid@11.13.0` → `chevrotain` → `langium`
  - CVE: Code Injection via `_.template` imports
  - Prototype Pollution via `_.unset` and `_.omit`

### Gitleaks
- **0 leaks** — 449 commits scanned, ~9.1 MB

### Electronegativity
- 10 findings (1 INFORMATIONAL, 3 LOW, 6 MEDIUM)
- All reviewed — no actionable issues (see triage below)

### Trivy
- **1 HIGH** — `lodash-es` CVE-2026-4800 (same as npm audit)
- 0 secrets, 0 misconfigurations

---

## VULNERABILITIES DETECTED

### [VULN-001] — lodash-es CVE-2026-4800 & Prototype Pollution
**Severity**: HIGH | **Priority**: P1 | **Status**: FIXED
**Source**: [NPM-AUDIT] + [TRIVY]

**Description**:
`lodash-es@4.17.23` (transitive dependency via mermaid → chevrotain → langium) contains:
1. CVE-2026-4800: Arbitrary code execution via untrusted input in `_.template` imports
2. Prototype Pollution via `_.unset` and `_.omit`

**Location**: `node_modules/lodash-es/` (transitive)

**Impact**:
- Code injection via crafted template strings (requires mermaid rendering of attacker content)
- Prototype pollution could affect application behavior

**OWASP Category**: A06:2025 - Vulnerable and Outdated Components
**CWE**: CWE-1395 (Dependency on Vulnerable Third-Party Component)

**Fix Applied**:
```json
// package.json — added overrides
"overrides": {
  "lodash-es": "^4.18.1"
}
```

**Validation**: FIXED — npm audit: 0 vulnerabilities, Trivy: 0 HIGH/CRITICAL

---

### [VULN-002] — Gemini Live YOLO toggle via voice commands
**Severity**: MEDIUM | **Priority**: P2 | **Status**: FIXED
**Source**: [MANUAL]

**Description**:
The `toggle_ui` voice command accepted `'yolo'` as a valid element, allowing Gemini Live to toggle YOLO mode (which bypasses tool approval) via voice. Combined with `send_prompt`, this creates a chain: voice → enable YOLO → send prompt → conversation tools execute without human approval.

**Location**:
- `src/renderer/src/services/cruchot-command-handler.ts:63`
- `src/main/llm/gemini-live-tools.ts:28`

**Impact**:
- Voice-controlled bypass of the tool approval security layer
- Requires active Gemini Live connection (opt-in) + audio injection

**OWASP Category**: A01:2025 - Broken Access Control

**Fix Applied**:
```typescript
// cruchot-command-handler.ts — block YOLO from voice
if (element === 'yolo') {
  return { success: false, error: 'YOLO mode cannot be toggled via voice commands (security restriction)' }
}
```
Also removed `'yolo'` from the tool description in `gemini-live-tools.ts`.

**Validation**: FIXED — YOLO no longer in tool description, hard block in handler.

---

### [VULN-003] — Skill git clone URL validation
**Severity**: MEDIUM | **Priority**: P2 | **Status**: FIXED
**Source**: [MANUAL]

**Description**:
`SkillService.cloneRepo()` had a fallback in `parseGitHubUrl` that passed arbitrary URLs to `git clone`. An attacker-controlled URL could use `ext::` transport, SSH URLs, or local paths to trigger unintended operations.

**Location**: `src/main/services/skill.service.ts:333`

**Impact**:
- Potential command execution via git transport protocols
- Mitigated by: `/tmp/` clone directory, `--depth 1`, 60s timeout, `JSON.stringify()` quoting

**OWASP Category**: A03:2025 - Injection
**CWE**: CWE-78 (OS Command Injection)

**Fix Applied**:
```typescript
// skill.service.ts — restrict to HTTPS GitHub URLs only
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
  return { success: false, error: 'Seules les URLs HTTPS GitHub sont autorisees' }
}
```

**Validation**: FIXED — only `https://github.com/owner/repo` patterns accepted.

---

### [VULN-004] — CSP `style-src 'unsafe-inline'`
**Severity**: LOW | **Priority**: P3 | **Status**: ACCEPTED
**Source**: [ELECTRONEGATIVITY]

**Description**: CSP allows `'unsafe-inline'` for styles (needed for Tailwind CSS + shadcn/ui runtime styles).

**Impact**: Minimal — no user-controlled style injection vector exists. All HTML is DOMPurify-sanitized.

---

### [VULN-005] — macOS distribution security (dev-only)
**Severity**: LOW | **Priority**: P3 | **Status**: ACCEPTED
**Source**: [MANUAL]

**Description**: `forceCodeSigning: false`, `hardenedRuntime: false`, `notarize: false` in electron-builder.yml. Users must `xattr -cr` after install.

**Impact**: Development/distribution config. Not a runtime vulnerability.

---

### [VULN-006] — VCR anonymizer over-broad regex
**Severity**: LOW | **Priority**: P3 | **Status**: ACCEPTED
**Source**: [MANUAL]

**Description**: PII pattern `/\b[A-Za-z0-9_\-]{32,}\b/g` matches any 32+ alphanumeric token, causing false-positive masking of UUIDs, hashes, and base64 data in VCR exports.

**Impact**: Data loss in VCR exports (over-anonymization), not a security vulnerability.

---

### [VULN-007] — Qdrant HTTP localhost
**Severity**: LOW | **Priority**: P3 | **Status**: ACCEPTED (since S36)
**Source**: [SEMGREP]

**Description**: Qdrant embedded communicates over HTTP on `localhost:6333`. No sensitive data transits (only embeddings and metadata).

**Impact**: None — `127.0.0.1` only, no network exposure.

---

## SEMGREP FALSE POSITIVE TRIAGE

| Rule | File | Verdict | Reason |
|------|------|---------|--------|
| `react-insecure-request` | `qdrant-process.ts:71` | FP | localhost:6333 Qdrant embedded |
| `react-insecure-request` | `qdrant-process.ts:124` | FP | localhost Qdrant health check |
| `detect-child-process` | `seatbelt.ts:141` | FP | Sandbox wrapper, input pre-sanitized |

---

## ELECTRONEGATIVITY TRIAGE

| Check | Severity | Verdict | Reason |
|-------|----------|---------|--------|
| AVAILABLE_SECURITY_FIXES | INFO | N/A | Unknown Electron 40.8.x release |
| CSP_GLOBAL_CHECK x3 | LOW | Accepted | `unsafe-inline` needed for Tailwind |
| OPEN_EXTERNAL_JS_CHECK x4 | MEDIUM | Safe | URL validation + TRUSTED_DOMAINS |
| AUXCLICK_JS_CHECK | MEDIUM | Safe | Handled by setWindowOpenHandler |
| PRELOAD_JS_CHECK | MEDIUM | Safe | Proper contextBridge pattern |

---

## SECURITY VALIDATION CHECKLIST

### SAST & Automated Scans
- [x] Semgrep: zero confirmed ERROR-level findings (3 documented FP)
- [x] Semgrep: zero WARNING/INFO findings
- [x] Semgrep secrets scan clean (`p/secrets`)
- [x] npm audit clean (0 vulnerabilities, production deps)
- [x] Electronegativity: zero critical misconfigurations
- [x] Gitleaks: zero secrets in git history (449 commits)
- [x] Trivy: zero HIGH/CRITICAL vulnerabilities

### Electron Configuration
- [x] nodeIntegration: false
- [x] contextIsolation: true
- [x] sandbox: true
- [x] enableRemoteModule: not used
- [x] CSP configured (renderer + remote-web)
- [x] allowRunningInsecureContent: not set (default false)
- [x] webSecurity: default true
- [x] DevTools: `!app.isPackaged`

### Secure IPC
- [x] Zod validation on all handlers (chat, gemini-live, vcr, episodes, oneiric, skills, permissions)
- [x] Settings whitelist (ALLOWED_SETTING_KEYS) — API key prefix explicitly blocked
- [x] No process.env exposure to renderer
- [x] contextBridge pattern with individual functions (~150 methods)

### Input Handling
- [x] DOMPurify on all dangerouslySetInnerHTML (3 locations verified)
- [x] No eval() usage (confirmed by Semgrep)
- [x] realpathSync before path validation (files, protocol handler, skills)
- [x] DANGEROUS_EXTENSIONS blocked (23 extensions)
- [x] SENSITIVE_DIR_PATTERNS blocked for file reads

### Cryptography & Secrets
- [x] All API keys encrypted via safeStorage (Keychain macOS)
- [x] Instance token: 32 bytes crypto.randomBytes, encrypted in DB
- [x] No hardcoded keys (Semgrep + Gitleaks clean)
- [x] No secrets in git history
- [x] Remote server: session tokens generated with crypto.randomBytes
- [x] Sensitive API key patterns scrubbed in SCRUBBED_ENV_VARS (17 patterns)

### Dependencies & Supply Chain
- [x] npm audit: 0 vulnerabilities (production)
- [x] lodash-es CVE-2026-4800 resolved via overrides
- [x] Electron 40.8.x (latest available)

### Navigation & Links
- [x] URL validation before shell.openExternal (TRUSTED_DOMAINS + dialog)
- [x] URL reconstructed from parsed components (anti-manipulation)
- [x] will-navigate guard blocks non-local navigation
- [x] setWindowOpenHandler denies all external navigation

### Conversation Tools
- [x] 22 bash security checks (hard blocks)
- [x] Seatbelt macOS sandbox (allow default + deny file-write* targeted)
- [x] Permission engine: deny > readonly > allow > ask > fallback
- [x] READONLY_COMMANDS (~60 auto-allowed read-only commands)
- [x] YOLO mode: bypasses approval only, NOT security checks or deny rules
- [x] YOLO toggle blocked from Gemini Live voice commands (new fix)

### New Features (S55-S58)
- [x] Episode extractor: JSON parsing with try/catch, confidence clamped 0-1
- [x] Oneiric service: same model as episodes, no new attack surface
- [x] Gemini Live: API key from safeStorage, Zod on IPC, YOLO blocked from voice
- [x] VCR: PII anonymization (6 pattern categories), workspace path masking
- [x] Skills: HTTPS GitHub URLs only, BLOCKED_ROOTS, realpathSync, Maton scanner

### Remote Access
- [x] WebSocket server: 127.0.0.1 only, pairing required, session tokens
- [x] Rate limiting: IP bans, consecutive failure tracking
- [x] Telegram: triple lock (token + allowed user + active session)
- [x] Sensitive patterns sanitized in remote responses

### Production
- [x] DevTools disabled in production (`devTools: !app.isPackaged`)
- [x] Source maps disabled
- [x] Console drop in production (esbuild config)
- [ ] Code signing disabled (dev-only — accepted for personal use)

---

## SECURITY CHANGELOG

| # | Action | File(s) | Source |
|---|--------|---------|--------|
| 1 | Added `lodash-es@^4.18.1` override | `package.json` | [NPM-AUDIT] + [TRIVY] |
| 2 | Blocked YOLO toggle from voice commands | `cruchot-command-handler.ts`, `gemini-live-tools.ts` | [MANUAL] |
| 3 | Restricted skill clone to HTTPS GitHub URLs | `skill.service.ts` | [MANUAL] |
| 4 | Updated `bun.lock` with fixed dependency | `bun.lock` | [TRIVY] |

---

## SECURITY SCORE: 97/100

**Deductions:**
- -1: `style-src 'unsafe-inline'` in CSP (Tailwind requirement)
- -1: `forceCodeSigning: false` + `hardenedRuntime: false` (dev distribution)
- -1: pdf-parse v1.1.1 unmaintained (no alternative available)

**Notable strengths:**
- Zero confirmed Semgrep findings (3 documented FP)
- Zero secrets in 449 commits of git history
- Complete IPC validation (Zod on all new handlers)
- 5-stage tool security pipeline with seatbelt sandbox
- DOMPurify on all HTML injection points
- safeStorage for all secrets
- Gemini Live voice commands now security-restricted
- Skills installation restricted to trusted sources
