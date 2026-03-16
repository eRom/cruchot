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
| 0.3.x | Yes |
| < 0.3 | No |

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
- **Bash tool sandboxing**: User-accessible shell execution is restricted by a multi-layer blocklist preventing command injection, privilege escalation, and data exfiltration.
- **Cryptography**: Timing-safe comparisons for all token/secret checks. AES-256-GCM for encrypted exports. `crypto.randomUUID()` for identifiers.
- **Navigation guard**: `will-navigate` blocks all navigation outside allowed origins.
- **Remote access**: WebSocket connections restricted to the local network. Session tokens validated on every request.

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
| No code signing for Windows/Linux builds | macOS code signing enforced; other platforms pending developer certificates |
| Prompt injection via LLM responses | Inherent to all LLM applications; mitigated by sandboxed tool execution and user approval gates |
| Single global abort controller | Acceptable for single-user, single-window usage |
| Settings duplicated in localStorage | UI preferences only, no secrets — localStorage used for instant hydration |
| Legacy peer deps enabled in npm | Isolated to a single SDK compatibility issue; monitored |
| ONNX model kept in memory | Loaded once, never unloaded — acceptable for single-user desktop |
| Streaming IPC per token | Performance consideration, not a security risk — batching planned |
| Semgrep false positive on localhost HTTP | HTTP to local Qdrant instance (127.0.0.1) is expected and safe |

## Security Audit History

Cruchot has undergone 4 comprehensive security audits:

| Audit | Date | Findings | Fixed | Score |
|-------|------|----------|-------|-------|
| S30 — v1 | 2026-03-12 | 36 vulnerabilities (4C, 13H, 14M, 5L) | 22 fixes across 14 files | 62 → 91 |
| S35 — v2 | 2026-03-15 | 21 vulnerabilities (3C, 9H, 7M, 2L) | 18 fixes across 14 files | 58 → 93 |
| S36 — v3 | 2026-03-15 | 31 vulnerabilities (0C, 4H, 16M, 11L) | 20 fixes across 16 files | 93 → 97 |
| S37 — Performance | 2026-03-15 | 9 performance issues | 9 fixes across 9 files | N/A |

Current security score: **97/100** with zero P0/P1 open issues.

## Source Maps

Source maps are disabled across all build targets (main, preload, renderer, remote-web) to prevent source code exposure in production builds.
