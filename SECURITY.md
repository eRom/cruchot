# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

### How to Report

Use [GitHub Security Advisories](https://github.com/eRom/cruchot/security/advisories/new) to privately report the issue.

### What to Include

- Description of the vulnerability and its potential impact
- Steps to reproduce
- Affected version(s)
- Any suggested fix (optional)

### Response Timeline

| Step | Timeframe |
|------|-----------|
| Acknowledgment | Within 72 hours |
| Triage & severity assessment | Within 1 week |
| Fix development | Depends on severity |
| Patch release | As soon as fix is verified |
| Public disclosure | After patch is available |

We will credit reporters in the release notes unless they prefer to remain anonymous.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.7.x | Yes |
| < 0.7 | No |

Only the latest minor release receives security patches.

## Security Model

Cruchot is a local-first desktop application. All data stays on the user's machine — there is no backend server, no telemetry, and no cloud storage.

### Architecture

- **Process isolation**: Electron's main/preload/renderer separation is strictly enforced. The renderer has no access to Node.js APIs.
- **Sandbox**: `sandbox: true` on all BrowserWindow instances.
- **Content Security Policy**: Strict CSP in both the main app and the remote-web SPA (local network only).
- **API key protection**: All provider API keys are encrypted at rest using the OS native secret store (Keychain on macOS, DPAPI on Windows).
- **IPC validation**: Every IPC handler validates inputs with Zod schemas. No raw `ipcRenderer` exposure.
- **File system confinement**: Path traversal protection via `realpathSync()` resolution, blocked system roots, sensitive file pattern detection, and a blocklist of dangerous file extensions.

### Conversation Tools Security (since v0.6.0)

The LLM can execute 8 tools (bash, readFile, writeFile, FileEdit, listFiles, GrepTool, GlobTool, WebFetchTool) under a 5-stage security pipeline:

1. **Security checks** (hard block): 23 bash-specific checks — command injection, privilege escalation, data exfiltration. Never bypassable.
2. **Deny rules**: User-defined rules that unconditionally block specific tools/commands.
3. **READONLY auto-allow**: ~60 common read-only commands (ls, grep, cat, head, etc.) pass without approval.
4. **Allow rules**: User-defined rules that permit specific tool patterns.
5. **Approval gate**: Unknown actions prompt the user for approval (allow / deny / allow-session). Timeout: 60 seconds.

Additional layers:
- **Seatbelt sandboxing (macOS)**: `sandbox-exec` with `(allow default)` + `(deny file-write*)` restricts file writes to the workspace directory, `/tmp`, and `/dev/null` only. Applied to every bash execution.
- **YOLO mode**: Per-conversation toggle that bypasses the approval gate (step 5) only. Security checks (step 1) and deny rules (step 2) remain active.
- **Plan Mode gate**: When a plan is proposed but not yet validated, all write tools are blocked (read-only). Write access is restored only after explicit user approval.
- **Session approvals**: Scoped per conversation. Approving a tool in one conversation does not affect others.
- **Permission rules**: Stored in SQLite, support prefix/wildcard matching for bash commands, path glob matching (minimatch), and domain matching for WebFetch.
- **MCP tool wrapping**: External MCP tools pass through the same pipeline (deny/allow/ask) with plan mode gate.

### Other Security Features

- **Cryptography**: Timing-safe comparisons for all token/secret checks. AES-256-GCM for encrypted exports. `crypto.randomUUID()` for identifiers.
- **Navigation guard**: `will-navigate` blocks all navigation outside allowed origins.
- **Remote access**: WebSocket connections restricted to the local network (`127.0.0.1`). Session tokens validated on every request. Triple verification for Telegram bot access.
- **Library RAG validation**: `validateSourcePath()` blocks system roots and sensitive file patterns.
- **WebFetch protection**: HTTPS-only, anti-SSRF (private IP blocking), 2MB response limit.

## Automated Security Scanning

The following tools are used in CI and periodic audits:

| Tool | Purpose |
|------|---------|
| **Semgrep** | Static analysis (SAST) for code patterns |
| **npm audit** | Dependency vulnerability scanning |
| **Gitleaks** | Secret detection in source and history |
| **Trivy** | Container and filesystem vulnerability scanning |

CI runs `npm audit` and TypeScript type checking on every push.

## Known Accepted Risks

These are documented risks that have been evaluated and accepted given the application's threat model (local-only, single-user desktop app):

| Risk | Justification |
|------|---------------|
| PDF parsing library is unmaintained | Mitigated by importing only the core parser module, bypassing the library's test code execution |
| MCP servers execute user-configured binaries | By design — the user explicitly configures which tools to run |
| MCP HTTP headers stored unencrypted in DB | Masked from the renderer; full encryption planned for a future release |
| No code signing for Windows/Linux builds | macOS ad-hoc signing; other platforms pending developer certificates |
| Prompt injection via LLM responses | Mitigated by Seatbelt sandboxing, 5-stage permission pipeline, and user approval gates |
| Single global abort controller | Acceptable for single-user, single-window usage. Plan Mode uses a separate abort controller |
| Settings duplicated in localStorage | UI preferences only, no secrets — localStorage used for instant hydration |
| Legacy peer deps enabled in npm | Isolated to a single SDK compatibility issue; monitored |
| ONNX embedding model kept in memory | Loaded once in a worker thread, never unloaded — acceptable for single-user desktop |
| Semgrep false positive on localhost HTTP | HTTP to local Qdrant instance (127.0.0.1) is expected and safe |
| Plan Mode auto-approves tools during execution | After explicit user validation of the plan, tool approvals are bypassed. Security checks and deny rules remain active |
| YOLO mode bypasses tool approval | By design — user explicitly enables per-conversation. Hard security checks (23 bash checks + Seatbelt) remain enforced |

## Testing

142 tests across 6 suites:

| Suite | Tests | Coverage |
|-------|-------|----------|
| Permission engine | 42 | Deny/allow/ask pipeline, session approvals, READONLY commands |
| Bash security | 38 | 23 security checks, quote stripping, edge cases |
| Plan parser | 20 | Plan block parsing, step markers, stripping |
| Think-tag parser | 14 | Open-source model `<think>` tag extraction |
| Error classification | 19 | Retry logic, transient vs permanent errors |
| Cost calculator | 8 | Multi-provider pricing |

## Security Audit History

Cruchot has undergone 6 security-related audits:

| Audit | Date | Findings | Fixed | Score |
|-------|------|----------|-------|-------|
| S30 — v1 | 2026-03-12 | 36 vulnerabilities (4C, 13H, 14M, 5L) | 22 fixes across 14 files | 62 → 91 |
| S35 — v2 | 2026-03-15 | 21 vulnerabilities (3C, 9H, 7M, 2L) | 18 fixes across 14 files | 58 → 93 |
| S36 — v3 | 2026-03-15 | 31 vulnerabilities (0C, 4H, 16M, 11L) | 20 fixes across 16 files | 93 → 97 |
| S37 — Performance | 2026-03-15 | 9 performance issues | 9 fixes across 9 files | N/A |
| S42 — v4 (Sandbox) | 2026-03-20 | Seatbelt + permission engine review | Complete rewrite | 97 |
| S50 — Improvement | 2026-04-02 | 7 security + 6 perf fixes | 13 fixes across 8 files | 97 |

Current security score: **97/100** with zero P0/P1 open issues.

## Source Maps

Source maps are disabled across all build targets (main, preload, renderer, remote-web) to prevent source code exposure in production builds.
