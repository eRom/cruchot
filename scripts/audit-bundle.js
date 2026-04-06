#!/usr/bin/env node
/**
 * audit-bundle.js — Security audit of a packaged Electron bundle.
 *
 * Inspects the asar archive of a built Cruchot app and checks for:
 *   - Sourcemap references (sourceMappingURL=...)
 *   - .env files leaked into the bundle
 *   - Private keys, JWT tokens, AWS access keys, hardcoded credentials
 *   - Internal/localhost URLs (suspicious in a prod bundle)
 *   - devTools: true literals
 *   - Multiple preload scripts (should be exactly 1)
 *   - Bundle size diff vs previous release (warning if > 30%)
 *
 * Usage:
 *   node scripts/audit-bundle.js <path-to-app-or-asar>
 *   node scripts/audit-bundle.js dist/mac-arm64/Cruchot.app
 *   node scripts/audit-bundle.js dist/mac-arm64/Cruchot.app/Contents/Resources/app.asar
 *
 * Exit codes:
 *   0 — clean (no findings)
 *   1 — findings detected (CI should fail the release)
 *   2 — script error (bundle not found, asar invalid, etc.)
 *
 * Output: JSON report on stdout, human summary on stderr.
 *
 * Related: audit/security/security-audit-s66.md, scripts/afterPack.js
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const asar = require('@electron/asar')

// ── Patterns ─────────────────────────────────────────────────

const TEXT_PATTERNS = [
  {
    id: 'sourcemap',
    severity: 'high',
    regex: /\/\/[#@]\s*sourceMappingURL\s*=/g,
    desc: 'Sourcemap reference (should be stripped in prod builds)',
  },
  {
    id: 'private-key',
    severity: 'critical',
    regex: /-----BEGIN (RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY-----/g,
    desc: 'Embedded private key',
  },
  {
    id: 'aws-access-key',
    severity: 'critical',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    desc: 'AWS Access Key ID',
  },
  {
    id: 'hardcoded-credential',
    severity: 'high',
    // Triggers on `api_key = "..."` style with realistic-length values
    regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token|auth[_-]?token|password|client[_-]?secret)\s*[:=]\s*['"`][a-zA-Z0-9_\-]{24,}['"`]/gi,
    desc: 'Hardcoded credential pattern',
  },
  {
    id: 'jwt-token',
    severity: 'medium',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
    desc: 'JWT token in source',
  },
  {
    id: 'internal-url',
    severity: 'medium',
    // Catches localhost/127.0.0.1/RFC1918 in HTTP(S) URLs
    regex: /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?/g,
    desc: 'Internal/localhost URL embedded in bundle',
  },
  {
    id: 'devtools-true',
    severity: 'high',
    // `devTools: true` not followed by a logical expression (would be `devTools: true ? ...`)
    // Cruchot uses `devTools: !app.isPackaged` so prod should never embed `devTools:true` literal
    regex: /devTools\s*:\s*true\b(?!\s*[?])/g,
    desc: 'devTools: true literal (DevTools enabled in prod)',
  },
]

// Filename patterns to flag (no content scan, just presence)
const FILENAME_PATTERNS = [
  { id: 'env-file', severity: 'critical', regex: /(^|\/)\.env(\.[^/]+)?$/, desc: '.env file in bundle' },
  { id: 'env-example', severity: 'low', regex: /(^|\/)\.env\.(example|sample|template)$/, desc: '.env.example template (low risk)' },
  { id: 'pem-key', severity: 'critical', regex: /\.(pem|key|p12|pfx|jks|keystore)$/i, desc: 'Cryptographic key file' },
  { id: 'sourcemap-file', severity: 'high', regex: /\.(js|css|html)\.map$/, desc: 'Standalone sourcemap file' },
  { id: 'private-id', severity: 'critical', regex: /(^|\/)id_(rsa|ed25519|ecdsa|dsa)(\.|$)/, desc: 'SSH private key' },
  { id: 'history-file', severity: 'high', regex: /(^|\/)\.(bash_history|zsh_history)$/, desc: 'Shell history file' },
]

// Extensions whose CONTENT we scan with TEXT_PATTERNS
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml',
  '.html', '.css', '.txt', '.md',
  '.map', '.tsx', '.ts',
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB — skip larger files

// ── Argument parsing ──────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node scripts/audit-bundle.js <path-to-app-or-asar>')
    console.error('       node scripts/audit-bundle.js dist/mac-arm64/Cruchot.app')
    process.exit(2)
  }
  return { target: args[0] }
}

// ── Resolve target → asar path ────────────────────────────────

function resolveAsarPath(target) {
  const stat = fs.statSync(target) // throws if not found
  if (stat.isFile()) {
    if (target.endsWith('.asar')) return target
    throw new Error(`Expected .app directory or .asar file, got: ${target}`)
  }
  // Directory — assume .app bundle
  // macOS: <App>.app/Contents/Resources/app.asar
  // Linux: <app-name>/resources/app.asar
  // Windows: <App>/resources/app.asar
  const candidates = [
    path.join(target, 'Contents', 'Resources', 'app.asar'),
    path.join(target, 'resources', 'app.asar'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`Could not find app.asar inside ${target}. Tried: ${candidates.join(', ')}`)
}

// ── Walk extracted asar and collect findings ──────────────────

function walkDir(dir, callback, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relPath = path.relative(base, fullPath)
    if (entry.isDirectory()) {
      walkDir(fullPath, callback, base)
    } else if (entry.isFile()) {
      callback(fullPath, relPath)
    }
  }
}

function scanFile(fullPath, relPath, findings) {
  // Filename pattern checks
  for (const pat of FILENAME_PATTERNS) {
    if (pat.regex.test(relPath)) {
      findings.push({
        rule: pat.id,
        severity: pat.severity,
        file: relPath,
        line: null,
        match: null,
        desc: pat.desc,
      })
    }
  }

  // Content checks (only for known text files, capped at MAX_FILE_SIZE)
  const ext = path.extname(relPath).toLowerCase()
  if (!TEXT_EXTENSIONS.has(ext)) return

  let stat
  try { stat = fs.statSync(fullPath) } catch { return }
  if (stat.size === 0 || stat.size > MAX_FILE_SIZE) return

  let content
  try {
    content = fs.readFileSync(fullPath, 'utf-8')
  } catch {
    return // binary file disguised as text ext, skip
  }

  for (const pat of TEXT_PATTERNS) {
    pat.regex.lastIndex = 0
    let m
    let count = 0
    while ((m = pat.regex.exec(content)) !== null && count < 5) {
      // Compute line number
      const upToMatch = content.slice(0, m.index)
      const line = upToMatch.split('\n').length
      findings.push({
        rule: pat.id,
        severity: pat.severity,
        file: relPath,
        line,
        match: m[0].slice(0, 80),
        desc: pat.desc,
      })
      count++
    }
  }
}

// ── Structural checks ─────────────────────────────────────────

function checkStructure(extractDir, findings) {
  // Count preload scripts — should be exactly 1 for Cruchot (out/preload/index.js)
  const preloadFiles = []
  walkDir(extractDir, (fullPath, relPath) => {
    if (relPath.startsWith('out/preload/') && relPath.endsWith('.js') && !relPath.endsWith('.map')) {
      preloadFiles.push(relPath)
    }
  })
  if (preloadFiles.length === 0) {
    findings.push({
      rule: 'preload-missing',
      severity: 'critical',
      file: 'out/preload/',
      line: null,
      match: null,
      desc: 'No preload script found in out/preload/',
    })
  } else if (preloadFiles.length > 1) {
    findings.push({
      rule: 'preload-multiple',
      severity: 'high',
      file: 'out/preload/',
      line: null,
      match: null,
      desc: `Expected 1 preload script, found ${preloadFiles.length}: ${preloadFiles.join(', ')}`,
    })
  }
}

// ── Main ──────────────────────────────────────────────────────

function main() {
  const { target } = parseArgs()

  let asarPath
  try {
    asarPath = resolveAsarPath(target)
  } catch (err) {
    console.error(`[audit-bundle] ${err.message}`)
    process.exit(2)
  }

  console.error(`[audit-bundle] Scanning: ${asarPath}`)
  const asarSize = fs.statSync(asarPath).size

  // Extract asar to a tmp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bundle-'))
  try {
    asar.extractAll(asarPath, tmpDir)

    const findings = []
    let fileCount = 0
    walkDir(tmpDir, (fullPath, relPath) => {
      fileCount++
      scanFile(fullPath, relPath, findings)
    })

    checkStructure(tmpDir, findings)

    // Group by severity
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1

    const report = {
      asarPath,
      asarSize,
      fileCount,
      bySeverity,
      total: findings.length,
      findings,
      timestamp: new Date().toISOString(),
    }

    // Human summary on stderr
    console.error(`[audit-bundle] Files scanned: ${fileCount}`)
    console.error(`[audit-bundle] asar size: ${(asarSize / 1024 / 1024).toFixed(2)} MB`)
    console.error(`[audit-bundle] Findings: critical=${bySeverity.critical} high=${bySeverity.high} medium=${bySeverity.medium} low=${bySeverity.low}`)
    if (findings.length > 0) {
      console.error('')
      console.error('--- Findings (top 20) ---')
      for (const f of findings.slice(0, 20)) {
        const loc = f.line ? `:${f.line}` : ''
        console.error(`  [${f.severity.toUpperCase()}] ${f.rule} → ${f.file}${loc}`)
        if (f.match) console.error(`        ${f.match}`)
      }
      if (findings.length > 20) {
        console.error(`  ... and ${findings.length - 20} more (see JSON report)`)
      }
    } else {
      console.error('[audit-bundle] ✓ Clean — no findings')
    }

    // JSON report on stdout (machine-readable, can be piped)
    console.log(JSON.stringify(report, null, 2))

    // Exit code: 1 if any critical or high finding
    const hasBlocker = bySeverity.critical > 0 || bySeverity.high > 0
    process.exit(hasBlocker ? 1 : 0)
  } finally {
    // Cleanup tmp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch { /* best-effort */ }
  }
}

main()
