#!/usr/bin/env node
/**
 * audit-bundle.js — Security audit of a Cruchot bundle.
 *
 * Inspects either:
 *   - A packaged .app (CI release, slow but complete)
 *   - A standalone .asar archive
 *   - The local build directory `out/` (electron-vite output, fast — for
 *     local pre-release audits; same content that gets packed into the asar)
 *
 * Checks for:
 *   - Sourcemap references (sourceMappingURL=...)
 *   - .env files leaked into the bundle
 *   - Private keys, JWT tokens, AWS access keys, hardcoded credentials
 *   - Internal/localhost URLs (suspicious in a prod bundle)
 *   - devTools: true literals
 *   - Multiple preload scripts (should be exactly 1)
 *   - Build freshness vs source files in `src/` (warning only)
 *
 * Usage:
 *   node scripts/audit-bundle.js out/                                # local build
 *   node scripts/audit-bundle.js dist/mac-arm64/Cruchot.app          # packaged
 *   node scripts/audit-bundle.js dist/.../Contents/Resources/app.asar
 *
 * Exit codes:
 *   0 — clean (no critical/high findings)
 *   1 — findings detected (CI should fail the release)
 *   2 — script error (target not found, asar invalid, etc.)
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
    // Catches localhost/127.0.0.1/RFC1918 in HTTP(S) URLs.
    // Cruchot legitimately embeds a few local-service URLs (LM Studio,
    // Ollama, Qdrant, electron-vite dev server). Those are filtered out
    // post-match by INTERNAL_URL_ALLOWLIST below.
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

// Allowlist for `internal-url` rule. These are legitimate local-service
// endpoints that Cruchot is designed to talk to. Listed as substring matches.
const INTERNAL_URL_ALLOWLIST = [
  'http://localhost:1234',   // LM Studio default port
  'http://127.0.0.1:1234',
  'http://localhost:11434',  // Ollama default port
  'http://127.0.0.1:11434',
  'http://localhost:6333',   // Qdrant embedded vector DB
  'http://127.0.0.1:6333',
  'http://localhost:5173',   // electron-vite dev server (renderer)
  'http://127.0.0.1:5173',
  'http://localhost:5174',   // electron-vite dev server (alt port)
  'http://127.0.0.1:5174',
]

// Bare-host suppressions: these match in minified bundles as URL template
// fragments (e.g. `'http://localhost' + ':' + port + '/'`) and are not real
// URLs in the runtime traffic. Listed as exact matches.
const BARE_HOST_SUPPRESS = new Set([
  'http://localhost',
  'http://127.0.0.1',
  'http://0.0.0.0',
  'https://localhost',
  'https://127.0.0.1',
])

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
    console.error('Usage: node scripts/audit-bundle.js <path>')
    console.error('       node scripts/audit-bundle.js out/                   # local build (fast)')
    console.error('       node scripts/audit-bundle.js dist/mac-arm64/Cruchot.app')
    console.error('       node scripts/audit-bundle.js dist/.../app.asar')
    process.exit(2)
  }
  return { target: args[0] }
}

// ── Resolve target → { type, path } ────────────────────────────
// Returns one of:
//   { type: 'dir',  rootDir: '<absolute>', preloadPrefix: 'preload/' }
//     ↳ direct walk of an electron-vite `out/` directory (no extraction)
//   { type: 'asar', asarPath: '<absolute>', preloadPrefix: 'out/preload/' }
//     ↳ extract the asar and walk the temp dir

function resolveTarget(target) {
  const stat = fs.statSync(target) // throws ENOENT if not found

  // Case 1: explicit .asar file
  if (stat.isFile()) {
    if (target.endsWith('.asar')) {
      return { type: 'asar', asarPath: path.resolve(target), preloadPrefix: 'out/preload/' }
    }
    throw new Error(`Expected directory or .asar file, got file: ${target}`)
  }

  // Case 2: electron-vite build directory (out/)
  // Detected by the presence of main/, preload/, renderer/ subdirs.
  const looksLikeBuildDir =
    fs.existsSync(path.join(target, 'main')) &&
    fs.existsSync(path.join(target, 'preload')) &&
    fs.existsSync(path.join(target, 'renderer'))
  if (looksLikeBuildDir) {
    return { type: 'dir', rootDir: path.resolve(target), preloadPrefix: 'preload/' }
  }

  // Case 3: .app bundle — find app.asar inside
  // macOS: <App>.app/Contents/Resources/app.asar
  // Linux: <app-name>/resources/app.asar
  // Windows: <App>/resources/app.asar
  const candidates = [
    path.join(target, 'Contents', 'Resources', 'app.asar'),
    path.join(target, 'resources', 'app.asar'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { type: 'asar', asarPath: path.resolve(candidate), preloadPrefix: 'out/preload/' }
    }
  }

  throw new Error(
    `Could not identify target ${target}. Expected one of:\n` +
    `  - electron-vite build dir (with main/ preload/ renderer/ subdirs)\n` +
    `  - .app bundle containing Contents/Resources/app.asar or resources/app.asar\n` +
    `  - standalone .asar file`
  )
}

// ── Freshness check ──────────────────────────────────────────
// Returns true if any file in `sourceDir` has been modified more recently
// than the most recent file in `targetDir`. Used to warn the user when they
// are auditing a stale build.

function getNewestMtimeMs(dir, ignoreNames = new Set(['node_modules', '.git', 'dist', 'out', '__tests__'])) {
  let newest = 0
  function walk(d) {
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (ignoreNames.has(entry.name)) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        try {
          const mtime = fs.statSync(full).mtimeMs
          if (mtime > newest) newest = mtime
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(dir)
  return newest
}

function checkFreshness(targetPath) {
  // Resolve src/ relative to script location (works in any cwd)
  const repoRoot = path.resolve(__dirname, '..')
  const srcDir = path.join(repoRoot, 'src')
  if (!fs.existsSync(srcDir)) return null // not in the Cruchot repo, skip

  const targetMtime = getNewestMtimeMs(targetPath, new Set(['__pycache__', 'node_modules']))
  const sourceMtime = getNewestMtimeMs(srcDir)
  if (targetMtime === 0 || sourceMtime === 0) return null

  const stale = sourceMtime > targetMtime
  const ageMs = sourceMtime - targetMtime
  return {
    stale,
    targetMtime: new Date(targetMtime).toISOString(),
    sourceMtime: new Date(sourceMtime).toISOString(),
    ageSeconds: stale ? Math.round(ageMs / 1000) : 0,
  }
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
      // Suppress allowlisted internal URLs (LM Studio, Ollama, Qdrant, etc.)
      // and bare-host fragments from minified bundle templates.
      if (pat.id === 'internal-url') {
        if (INTERNAL_URL_ALLOWLIST.some(u => m[0].startsWith(u))) continue
        if (BARE_HOST_SUPPRESS.has(m[0])) continue
      }
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

function checkStructure(rootDir, findings, preloadPrefix) {
  // Count preload scripts — should be exactly 1 for Cruchot.
  // preloadPrefix is 'out/preload/' for an extracted asar (electron-vite
  // copies out/ into the asar) or just 'preload/' when auditing the
  // electron-vite output directory directly.
  const preloadFiles = []
  walkDir(rootDir, (_fullPath, relPath) => {
    if (relPath.startsWith(preloadPrefix) && relPath.endsWith('.js') && !relPath.endsWith('.map')) {
      preloadFiles.push(relPath)
    }
  })
  if (preloadFiles.length === 0) {
    findings.push({
      rule: 'preload-missing',
      severity: 'critical',
      file: preloadPrefix,
      line: null,
      match: null,
      desc: `No preload script found in ${preloadPrefix}`,
    })
  } else if (preloadFiles.length > 1) {
    findings.push({
      rule: 'preload-multiple',
      severity: 'high',
      file: preloadPrefix,
      line: null,
      match: null,
      desc: `Expected 1 preload script, found ${preloadFiles.length}: ${preloadFiles.join(', ')}`,
    })
  }
}

// ── Main ──────────────────────────────────────────────────────

function main() {
  const { target } = parseArgs()

  let resolved
  try {
    resolved = resolveTarget(target)
  } catch (err) {
    console.error(`[audit-bundle] ${err.message}`)
    process.exit(2)
  }

  console.error(`[audit-bundle] Scanning: ${target} (mode=${resolved.type})`)

  // Walk root: either the build dir directly, or a tmp dir into which we
  // extract the asar. The structural and content checks are identical.
  let walkRoot
  let tmpDir = null
  let bundleSize = 0
  if (resolved.type === 'dir') {
    walkRoot = resolved.rootDir
    // Compute "size" as the sum of all file sizes (rough proxy for asar size)
    walkDir(walkRoot, (fullPath) => {
      try { bundleSize += fs.statSync(fullPath).size } catch { /* skip */ }
    })
  } else {
    bundleSize = fs.statSync(resolved.asarPath).size
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bundle-'))
    asar.extractAll(resolved.asarPath, tmpDir)
    walkRoot = tmpDir
  }

  // Freshness check (best-effort, only when running from the Cruchot repo)
  const freshness = checkFreshness(walkRoot)
  if (freshness && freshness.stale) {
    console.error('')
    console.error(`[audit-bundle] ⚠ STALE BUILD — source files are newer than the audited target`)
    console.error(`[audit-bundle]   target newest mtime: ${freshness.targetMtime}`)
    console.error(`[audit-bundle]   source newest mtime: ${freshness.sourceMtime}`)
    console.error(`[audit-bundle]   age: ${freshness.ageSeconds}s ahead`)
    console.error(`[audit-bundle]   → run \`npm run build\` then re-audit for accurate results`)
    console.error('')
  }

  try {
    const findings = []
    let fileCount = 0
    walkDir(walkRoot, (fullPath, relPath) => {
      fileCount++
      scanFile(fullPath, relPath, findings)
    })

    checkStructure(walkRoot, findings, resolved.preloadPrefix)

    // Group by severity
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1

    const report = {
      target,
      mode: resolved.type,
      bundleSize,
      fileCount,
      bySeverity,
      total: findings.length,
      freshness,
      findings,
      timestamp: new Date().toISOString(),
    }

    // Human summary on stderr
    console.error(`[audit-bundle] Files scanned: ${fileCount}`)
    console.error(`[audit-bundle] Bundle size: ${(bundleSize / 1024 / 1024).toFixed(2)} MB`)
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
    // Cleanup tmp dir (only when we extracted an asar)
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true })
      } catch { /* best-effort */ }
    }
  }
}

main()
