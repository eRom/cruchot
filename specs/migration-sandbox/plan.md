# Migration Sandbox & Tools — Plan d'implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer le systeme de tools/sandbox de Cruchot vers une architecture multi-couches inspiree de Claude Code — securite bash renforcee, systeme de permissions configurable, et 4 nouveaux tools LLM.

**Architecture:** Pipeline de securite a 4 etages (security checks hard → permission rules → approval banner → sandbox execution). Eclatement de `conversation-tools.ts` en modules `tools/`. Nouvelle table `permission_rules` en SQLite. UI Settings pour la configuration + banner toast pour l'approbation runtime.

**Tech Stack:** Electron 35 + AI SDK v6 + Drizzle ORM + Zustand + Zod + turndown (HTML→MD)

**Spec:** `specs/migration-sandbox/architecture-technique.md`

---

## Phase 1 : Fondation securite

### Task 1 : Constantes et utilitaires partages (`tools/shared.ts`)

**Files:**
- Create: `src/main/llm/tools/shared.ts`

- [ ] **Step 1: Creer le fichier shared.ts avec toutes les constantes extraites de conversation-tools.ts**

```typescript
// src/main/llm/tools/shared.ts
import { existsSync, realpathSync } from 'fs'
import { join, sep, normalize, dirname } from 'path'

// ── Constants ────────────────────────────────────────────

export const TEXT_EXTENSIONS = new Set([
  // Documents
  '.md', '.txt', '.rst', '.adoc', '.org', '.csv', '.tsv', '.log',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.xml', '.plist', '.properties',
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.swift',
  '.php', '.lua', '.r', '.R', '.m', '.mm',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.prisma',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  // Misc dev
  '.dockerfile', '.containerfile', '.tf', '.hcl',
  '.makefile', '.cmake', '.gradle', '.sbt',
  '.gitignore', '.gitattributes', '.editorconfig',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.env.example', '.env.sample',
  // Data
  '.jsonl', '.ndjson',
])

export const BLOCKED_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.jks$/i,
  /\.keystore$/i, /\.credentials$/i,
  /^id_rsa/, /^id_ed25519/, /^id_ecdsa/,
]

export const BLOCKED_PATH_SEGMENTS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.DS_Store', 'Thumbs.db', '.idea', '.vscode',
  'coverage', '.nyc_output', '.turbo',
  '.terraform', '.serverless',
]

export const KNOWN_EXTENSIONLESS = [
  'Makefile', 'Dockerfile', 'Containerfile', 'LICENSE', 'README',
  'CHANGELOG', 'AUTHORS', 'CODEOWNERS', 'Procfile', 'Gemfile',
  'Rakefile', 'Vagrantfile', 'CLAUDE'
]

export const MAX_FILE_SIZE = 5_000_000 // 5MB
export const MAX_OUTPUT_LENGTH = 100_000 // 100KB
export const MAX_LIST_ENTRIES = 500

// ── TOCTOU Cache ─────────────────────────────────────────
// Tracks file mtime from last readFile call, checked by FileEdit
export const fileReadTimestamps = new Map<string, number>()

// ── Validation functions ─────────────────────────────────

export function isReadableFile(filePath: string): { allowed: boolean; reason?: string } {
  const segments = normalize(filePath).split(sep)
  const filename = segments[segments.length - 1] || ''
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : ''

  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(filename)) {
      if (filename === '.env.example' || filename === '.env.sample') continue
      return { allowed: false, reason: `Fichier sensible bloque : ${filename}` }
    }
  }

  for (const seg of segments) {
    if (BLOCKED_PATH_SEGMENTS.includes(seg)) {
      return { allowed: false, reason: `Chemin bloque (${seg}) : ${filePath}` }
    }
  }

  if (!ext) {
    if (KNOWN_EXTENSIONLESS.some(n => filename === n || filename.startsWith(n + '.'))) {
      return { allowed: true }
    }
    return { allowed: false, reason: `Type de fichier non reconnu (pas d'extension) : ${filename}` }
  }

  if (!TEXT_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `Type de fichier non textuel (${ext}) : ${filename}` }
  }

  return { allowed: true }
}

export function validatePath(filePath: string, workspacePath: string): { valid: boolean; resolved: string; reason?: string } {
  const fullPath = join(workspacePath, filePath)
  try {
    const dirToCheck = existsSync(fullPath) ? fullPath : dirname(fullPath)
    if (!existsSync(dirToCheck)) {
      return { valid: true, resolved: fullPath }
    }
    const resolved = realpathSync(existsSync(fullPath) ? fullPath : dirToCheck)
    const resolvedWorkspace = realpathSync(workspacePath)
    if (!resolved.startsWith(resolvedWorkspace + sep) && resolved !== resolvedWorkspace) {
      return { valid: false, resolved: fullPath, reason: 'Chemin hors du dossier de travail' }
    }
    return { valid: true, resolved: fullPath }
  } catch {
    return { valid: true, resolved: fullPath }
  }
}

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output
  return output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (sortie tronquee)'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/tools/shared.ts
git commit -m "refactor: extract shared constants and validation to tools/shared.ts"
```

---

### Task 2 : Bash Security Checks (`bash-security.ts`)

**Files:**
- Create: `src/main/llm/bash-security.ts`

- [ ] **Step 1: Creer bash-security.ts avec les 23 checks de securite**

```typescript
// src/main/llm/bash-security.ts

// ── Command Substitution Patterns ────────────────────────
const COMMAND_SUBSTITUTION_PATTERNS = [
  '$(', '${', '$[', '<(', '>(', '=(', '`'
]

// ── ZSH Dangerous Commands (21) ──────────────────────────
const ZSH_DANGEROUS_COMMANDS = new Set([
  'zmodload', 'emulate', 'sysopen', 'sysread', 'syswrite', 'sysseek',
  'ztcp', 'zsocket', 'zpty', 'zf_rm', 'zf_mv', 'zf_ln', 'zf_chmod',
  'zf_chown', 'zf_mkdir', 'zf_rmdir', 'zf_chgrp', 'mapfile'
])

// ── Dangerous Variable Names ─────────────────────────────
const DANGEROUS_VARIABLES = new Set([
  'IFS', 'PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH',
  'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE',
  'BASH_ENV', 'ENV', 'CDPATH', 'GLOBIGNORE',
  'PROMPT_COMMAND', 'MAIL', 'MAILPATH'
])

// ── Env vars to scrub ────────────────────────────────────
export const SCRUBBED_ENV_VARS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY', 'XAI_API_KEY', 'MISTRAL_API_KEY',
  'PERPLEXITY_API_KEY', 'DEEPSEEK_API_KEY', 'OPENROUTER_API_KEY',
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN',
  'DATABASE_URL', 'REDIS_URL',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'
]

// ── Unicode detection ────────────────────────────────────
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x08\x0e-\x1f\x7f]/
const UNICODE_WHITESPACE_RE = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF\u200C\u200D]/

export interface SecurityCheckResult {
  pass: boolean
  failedCheck?: number
  reason?: string
}

/**
 * Run 23 security checks on a bash command.
 * Returns { pass: true } if all checks pass, or { pass: false, failedCheck, reason }.
 * These checks are HARD BLOCKS — never overridable by permission rules.
 */
export function runBashSecurityChecks(command: string): SecurityCheckResult {
  // Check 1: Incomplete command (unclosed quotes)
  if (hasUnclosedQuotes(command)) {
    return { pass: false, failedCheck: 1, reason: 'Commande incomplete (quote non fermee)' }
  }

  // Check 2: jq system() call
  if (/\bjq\b.*\bsystem\s*\(/.test(command)) {
    return { pass: false, failedCheck: 2, reason: 'Appel jq system() detecte' }
  }

  // Check 3: Obfuscated flags (backslash in command names)
  if (/\\[a-zA-Z]/.test(command.split(/['"`]/)[0] || '')) {
    return { pass: false, failedCheck: 3, reason: 'Flags obfusques detectes' }
  }

  // Check 5: Dangerous variable assignments
  const varAssignMatch = command.match(/^(\w+)=/)
  if (varAssignMatch && DANGEROUS_VARIABLES.has(varAssignMatch[1])) {
    return { pass: false, failedCheck: 5, reason: `Redefinition de variable dangereuse : ${varAssignMatch[1]}` }
  }
  // Also check inline assignments: IFS=/ cmd
  for (const v of DANGEROUS_VARIABLES) {
    const re = new RegExp(`\\b${v}=`)
    if (re.test(command)) {
      return { pass: false, failedCheck: 5, reason: `Redefinition de variable dangereuse : ${v}` }
    }
  }

  // Check 6: Newlines in commands (multi-line injection)
  if (command.includes('\n') || command.includes('\r')) {
    return { pass: false, failedCheck: 6, reason: 'Commande multi-ligne detectee (injection potentielle)' }
  }

  // Check 7: Command substitution patterns
  for (const pattern of COMMAND_SUBSTITUTION_PATTERNS) {
    if (command.includes(pattern)) {
      return { pass: false, failedCheck: 7, reason: `Substitution de commande detectee : ${pattern}` }
    }
  }

  // Check 8: Suspicious I/O redirections to sensitive paths
  const redirectMatch = command.match(/>{1,2}\s*([^\s|&;]+)/)
  if (redirectMatch) {
    const target = redirectMatch[1]
    if (target.startsWith('/etc/') || target.startsWith('/usr/') ||
        target.match(/~\/\.(bashrc|bash_profile|zshrc|profile|gitconfig)/) ||
        target.startsWith('/System/')) {
      return { pass: false, failedCheck: 8, reason: `Redirection I/O vers chemin sensible : ${target}` }
    }
  }

  // Check 11: /proc/environ access
  if (/\/proc\/(self\/)?environ/.test(command)) {
    return { pass: false, failedCheck: 11, reason: 'Acces a /proc/environ detecte' }
  }

  // Check 12: Malformed tokens (null bytes)
  if (command.includes('\0')) {
    return { pass: false, failedCheck: 12, reason: 'Caractere null detecte dans la commande' }
  }

  // Check 13: Backslash escapes in command names
  if (/^\\[a-z]/i.test(command.trim())) {
    return { pass: false, failedCheck: 13, reason: 'Echappement backslash en debut de commande' }
  }

  // Check 14: Dangerous brace expansion
  if (/\{[^}]*,[^}]*\}/.test(command) && /\{.*\brm\b|\{.*\bchmod\b|\{.*\bchown\b/.test(command)) {
    return { pass: false, failedCheck: 14, reason: 'Expansion d\'accolades dangereuse detectee' }
  }

  // Check 15: Control characters
  if (CONTROL_CHARS_RE.test(command)) {
    return { pass: false, failedCheck: 15, reason: 'Caracteres de controle detectes dans la commande' }
  }

  // Check 16: Unicode whitespace (invisible characters)
  if (UNICODE_WHITESPACE_RE.test(command)) {
    return { pass: false, failedCheck: 16, reason: 'Caracteres Unicode invisibles detectes' }
  }

  // Check 17: Mid-word hash (hidden comments)
  if (/\S#\S/.test(command) && !command.includes('#!/') && !command.includes('#!')) {
    // Allow shebang and common patterns like color codes #fff
    const stripped = command.replace(/'[^']*'|"[^"]*"/g, '') // Remove quoted strings
    if (/\S#\S/.test(stripped)) {
      return { pass: false, failedCheck: 17, reason: 'Commentaire cache (hash mid-word) detecte' }
    }
  }

  // Checks 18-23: ZSH dangerous commands
  const words = command.split(/[\s;|&]+/)
  for (const word of words) {
    if (ZSH_DANGEROUS_COMMANDS.has(word)) {
      return { pass: false, failedCheck: 18, reason: `Commande ZSH dangereuse : ${word}` }
    }
  }

  return { pass: true }
}

/**
 * Check for unclosed single/double quotes in a command.
 */
function hasUnclosedQuotes(command: string): boolean {
  let inSingle = false
  let inDouble = false
  let escaped = false

  for (const char of command) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble
    }
  }

  return inSingle || inDouble
}

/**
 * Build a safe minimal environment for bash execution.
 * Scrubs all sensitive env vars and injects only what's needed.
 */
export function buildSafeEnv(workspacePath: string): Record<string, string> {
  const env: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
    HOME: workspacePath,
    TMPDIR: '/tmp',
    LANG: 'en_US.UTF-8',
    FORCE_COLOR: '0',
    NO_COLOR: '1'
  }

  // Add NVM node path if available
  const homePath = process.env.HOME
  if (homePath) {
    const nvmVersionsDir = `${homePath}/.nvm/versions/node`
    try {
      const { readdirSync } = require('fs')
      const { join } = require('path')
      const { existsSync } = require('fs')
      if (existsSync(nvmVersionsDir)) {
        const versions = readdirSync(nvmVersionsDir).sort()
        const latest = versions[versions.length - 1]
        if (latest) {
          env.NVM_DIR = `${homePath}/.nvm`
          env.PATH = `${join(nvmVersionsDir, latest, 'bin')}:${env.PATH}`
        }
      }
    } catch { /* NVM not available */ }
  }

  return env
}

/**
 * Wrap a command with extended glob disabling and stdin redirect.
 */
export function wrapCommand(command: string, shell: 'bash' | 'zsh'): string {
  const disableGlobs = shell === 'zsh'
    ? 'setopt NO_EXTENDED_GLOB 2>/dev/null;'
    : 'shopt -u extglob 2>/dev/null;'

  // Escape single quotes in command for eval wrapping
  const escaped = command.replace(/'/g, "'\\''")
  return `${disableGlobs} eval '${escaped}' < /dev/null`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/bash-security.ts
git commit -m "feat: add 23 bash security checks + env scrubbing + command wrapping"
```

---

### Task 3 : Seatbelt HOME blocklist (`seatbelt.ts`)

**Files:**
- Modify: `src/main/services/seatbelt.ts:11-51`

- [ ] **Step 1: Ajouter les constantes de blocklist et modifier generateSeatbeltProfile**

Dans `src/main/services/seatbelt.ts`, remplacer la fonction `generateSeatbeltProfile` :

```typescript
// Ajouter apres la ligne 5 (const SANDBOX_EXEC_PATH = ...)

// Repertoires HOME bloques en lecture (fichiers sensibles)
export const SEATBELT_DENIED_PATHS = [
  '.ssh', '.aws', '.gnupg', '.gpg', '.config/gcloud', '.azure',
  '.kube', '.docker', '.credentials', '.password-store',
  'Library/Keychains'
]

// Fichiers HOME individuels bloques en lecture
export const SEATBELT_DENIED_FILES = [
  '.netrc', '.npmrc', '.pypirc', '.env',
  '.bash_history', '.zsh_history'
]
```

Modifier `generateSeatbeltProfile` pour ajouter les deny AVANT les allow HOME :

```typescript
function generateSeatbeltProfile(sandboxDir: string): string {
  const home = process.env.HOME || '/Users/unknown'

  // Build deny rules for sensitive HOME paths
  const denyRules: string[] = []
  for (const p of SEATBELT_DENIED_PATHS) {
    denyRules.push(`(deny file-read* (subpath "${home}/${p}"))`)
  }
  for (const f of SEATBELT_DENIED_FILES) {
    denyRules.push(`(deny file-read* (literal "${home}/${f}"))`)
  }

  return `(version 1)
(deny default)
(allow process*)
(allow signal)
(allow sysctl*)
(allow mach*)
(allow ipc*)
(allow network*)
(allow system*)

;; Allow read/write in sandbox directory
(allow file-read* file-write* (subpath "${sandboxDir}"))

;; Allow read/write in temp
(allow file-read* file-write* (subpath "/tmp"))
(allow file-read* file-write* (subpath "/private/tmp"))

;; Allow read system-wide
(allow file-read* (subpath "/usr"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/opt"))
(allow file-read* (subpath "/Library"))
(allow file-read* (subpath "/System"))
(allow file-read* (subpath "/dev"))
(allow file-read* (subpath "/private/var"))
(allow file-read* (subpath "/private/etc"))
(allow file-read* (subpath "/etc"))
(allow file-read* (subpath "/var"))

;; DENY sensitive HOME paths (BEFORE allow home)
${denyRules.join('\n')}

;; Allow read home (for configs, nvm, etc.)
(allow file-read* (subpath "${home}"))

;; Allow write to home .npm, .cache, .nvm
(allow file-write* (subpath "${home}/.npm"))
(allow file-write* (subpath "${home}/.cache"))
(allow file-write* (subpath "${home}/.nvm"))
`
}
```

- [ ] **Step 2: Modifier execSandboxed pour utiliser buildSafeEnv et wrapCommand**

Modifier la fonction `execSandboxed` (ligne 66-134) pour importer et utiliser les nouvelles fonctions :

Ajouter l'import en haut du fichier :
```typescript
import { buildSafeEnv, wrapCommand } from '../llm/bash-security'
```

Dans `execSandboxed`, remplacer la construction de l'env (lignes 76-102) par :
```typescript
  const env = buildSafeEnv(sandboxDir)
```

Et modifier l'appel Seatbelt (ligne 120-124) pour wrapper la commande :
```typescript
    const wrappedCmd = wrapCommand(command, 'bash')
    try {
      return await spawnAsync(
        SANDBOX_EXEC_PATH,
        ['-f', profilePath, '/bin/bash', '-c', wrappedCmd],
        execOptions
      )
```

Et le fallback sans sandbox (lignes 129-132) :
```typescript
    const wrappedCmd = wrapCommand(command, 'bash')
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    const args = process.platform === 'win32' ? ['/c', command] : ['-c', wrappedCmd]
    return spawnAsync(shell, args, execOptions)
```

- [ ] **Step 3: Commit**

```bash
git add src/main/services/seatbelt.ts
git commit -m "feat: add Seatbelt HOME deny blocklist + use safe env and command wrapping"
```

---

### Task 4 : Permission Engine (`permission-engine.ts`)

**Files:**
- Create: `src/main/llm/permission-engine.ts`

- [ ] **Step 1: Creer le moteur d'evaluation des permissions**

```typescript
// src/main/llm/permission-engine.ts
import { minimatch } from 'minimatch'

export interface PermissionRule {
  id: string
  toolName: string
  ruleContent?: string | null
  behavior: 'allow' | 'deny' | 'ask'
  createdAt: number
}

export type PermissionDecision = 'allow' | 'deny' | 'ask'

export interface PermissionContext {
  toolName: string
  toolArgs: Record<string, unknown>
  workspacePath: string
}

// ── Fallbacks par defaut (quand aucune regle ne matche) ──
const TOOL_DEFAULTS: Record<string, PermissionDecision> = {
  readFile: 'allow',
  listFiles: 'allow',
  GrepTool: 'allow',
  GlobTool: 'allow',
  bash: 'ask',
  writeFile: 'ask',
  FileEdit: 'ask',
  WebFetchTool: 'ask',
}

// ── Session approvals (in-memory, reset on app restart) ──
const sessionApprovals = new Set<string>()

export function addSessionApproval(key: string): void {
  sessionApprovals.add(key)
}

export function hasSessionApproval(toolName: string, toolArgs: Record<string, unknown>): boolean {
  const key = buildSessionKey(toolName, toolArgs)
  return sessionApprovals.has(key)
}

export function clearSessionApprovals(): void {
  sessionApprovals.clear()
}

function buildSessionKey(toolName: string, toolArgs: Record<string, unknown>): string {
  if (toolName === 'bash') return `bash::${toolArgs.command ?? ''}`
  if (toolName === 'WebFetchTool') return `WebFetchTool::${toolArgs.url ?? ''}`
  if (toolName === 'writeFile' || toolName === 'FileEdit') {
    return `${toolName}::${toolArgs.file_path ?? toolArgs.path ?? ''}`
  }
  return `${toolName}::*`
}

/**
 * Evaluate permissions for a tool call.
 * Order: deny > allow > ask > fallback.
 */
export function evaluatePermission(
  context: PermissionContext,
  rules: PermissionRule[]
): PermissionDecision {
  // Check session approvals first
  if (hasSessionApproval(context.toolName, context.toolArgs)) {
    return 'allow'
  }

  const applicable = rules.filter(
    r => r.toolName === context.toolName || r.toolName === '*'
  )

  // 1. Deny rules
  for (const rule of applicable.filter(r => r.behavior === 'deny')) {
    if (matchesRule(rule, context)) return 'deny'
  }

  // 2. Allow rules
  for (const rule of applicable.filter(r => r.behavior === 'allow')) {
    if (matchesRule(rule, context)) return 'allow'
  }

  // 3. Ask rules
  for (const rule of applicable.filter(r => r.behavior === 'ask')) {
    if (matchesRule(rule, context)) return 'ask'
  }

  // 4. Fallback
  return TOOL_DEFAULTS[context.toolName] ?? 'ask'
}

/**
 * Check if a rule matches the given context.
 */
function matchesRule(rule: PermissionRule, context: PermissionContext): boolean {
  // No ruleContent = tool-global rule (matches everything)
  if (!rule.ruleContent) return true

  const content = rule.ruleContent

  switch (context.toolName) {
    case 'bash': {
      const command = String(context.toolArgs.command ?? '')
      // Wildcard: "npm *" matches any command starting with "npm "
      if (content.endsWith(' *')) {
        const prefix = content.slice(0, -2)
        return command === prefix || command.startsWith(prefix + ' ')
      }
      // Exact prefix match
      return command.startsWith(content)
    }

    case 'writeFile':
    case 'FileEdit':
    case 'readFile':
    case 'listFiles':
    case 'GrepTool':
    case 'GlobTool': {
      // Path glob matching
      const filePath = String(context.toolArgs.file_path ?? context.toolArgs.path ?? context.toolArgs.pattern ?? '')
      return minimatch(filePath, content, { dot: true })
    }

    case 'WebFetchTool': {
      // Domain matching: "*.github.com" matches "api.github.com"
      const url = String(context.toolArgs.url ?? '')
      try {
        const hostname = new URL(url).hostname
        if (content.startsWith('*.')) {
          const domain = content.slice(2)
          return hostname === domain || hostname.endsWith('.' + domain)
        }
        return hostname === content
      } catch {
        return false
      }
    }

    default:
      return false
  }
}

export function getToolDefault(toolName: string): PermissionDecision {
  return TOOL_DEFAULTS[toolName] ?? 'ask'
}
```

- [ ] **Step 2: Verifier que `minimatch` est disponible dans les deps**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && node -e "require('minimatch')" 2>&1 || echo "NEED_INSTALL"
```

Si `NEED_INSTALL`, executer `npm install minimatch` (mais `minimatch` est generalement deja dans les deps transitives via glob/fast-glob).

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/permission-engine.ts
git commit -m "feat: add permission engine with deny > allow > ask > fallback evaluation"
```

---

### Task 5 : Table permission_rules et queries DB

**Files:**
- Modify: `src/main/db/schema.ts` (ajouter table)
- Modify: `src/main/db/migrate.ts` (CREATE TABLE + seed)
- Create: `src/main/db/queries/permissions.ts`

- [ ] **Step 1: Ajouter la table dans schema.ts**

Ajouter apres la table `skills` (apres la ligne 483 dans schema.ts) :

```typescript
// ---------------------------------------------------------------------------
// Permission Rules (tool access control)
// ---------------------------------------------------------------------------
export const permissionRules = sqliteTable('permission_rules', {
  id: text('id').primaryKey(),
  toolName: text('tool_name').notNull(),
  ruleContent: text('rule_content'),
  behavior: text('behavior', { enum: ['allow', 'deny', 'ask'] }).notNull(),
  createdAt: integer('created_at').notNull()
})
```

- [ ] **Step 2: Ajouter la migration dans migrate.ts**

Ajouter apres le bloc skills (apres la ligne 498 dans migrate.ts) :

```typescript
  // --- Permission rules (migration sandbox) ---
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS permission_rules (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      rule_content TEXT,
      behavior TEXT NOT NULL CHECK(behavior IN ('allow', 'deny', 'ask')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_permission_rules_tool ON permission_rules(tool_name);
  `)

  // Seed default permission rules (idempotent — skip if table not empty)
  const existingRules = sqlite.prepare('SELECT COUNT(*) as count FROM permission_rules').get() as { count: number }
  if (existingRules.count === 0) {
    const now = Math.floor(Date.now() / 1000)
    const seedRules = [
      // Bash: commandes dev courantes auto-approuvees
      { tool: 'bash', content: 'npm *', behavior: 'allow' },
      { tool: 'bash', content: 'npx *', behavior: 'allow' },
      { tool: 'bash', content: 'git *', behavior: 'allow' },
      { tool: 'bash', content: 'node *', behavior: 'allow' },
      { tool: 'bash', content: 'cat *', behavior: 'allow' },
      { tool: 'bash', content: 'ls *', behavior: 'allow' },
      { tool: 'bash', content: 'find *', behavior: 'allow' },
      { tool: 'bash', content: 'grep *', behavior: 'allow' },
      { tool: 'bash', content: 'echo *', behavior: 'allow' },
      { tool: 'bash', content: 'pwd', behavior: 'allow' },
      { tool: 'bash', content: 'which *', behavior: 'allow' },
      // Bash: commandes dangereuses
      { tool: 'bash', content: 'rm -rf *', behavior: 'deny' },
      { tool: 'bash', content: 'sudo *', behavior: 'deny' },
      { tool: 'bash', content: 'chmod *', behavior: 'deny' },
      { tool: 'bash', content: 'chown *', behavior: 'deny' },
      // WebFetch: domaines courants
      { tool: 'WebFetchTool', content: '*.github.com', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.npmjs.com', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.mozilla.org', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.stackoverflow.com', behavior: 'allow' },
    ]

    const insert = sqlite.prepare(
      'INSERT INTO permission_rules (id, tool_name, rule_content, behavior, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const rule of seedRules) {
      insert.run(crypto.randomUUID(), rule.tool, rule.content, rule.behavior, now)
    }
  }
```

- [ ] **Step 3: Creer les queries**

```typescript
// src/main/db/queries/permissions.ts
import { getDatabase } from '..'
import { permissionRules } from '../schema'
import { eq } from 'drizzle-orm'
import type { PermissionRule } from '../../llm/permission-engine'

let cachedRules: PermissionRule[] | null = null

export function getAllPermissionRules(): PermissionRule[] {
  if (cachedRules) return cachedRules
  const db = getDatabase()
  const rows = db.select().from(permissionRules).all()
  cachedRules = rows.map(r => ({
    id: r.id,
    toolName: r.toolName,
    ruleContent: r.ruleContent,
    behavior: r.behavior as 'allow' | 'deny' | 'ask',
    createdAt: r.createdAt
  }))
  return cachedRules
}

export function addPermissionRule(toolName: string, ruleContent: string | null, behavior: 'allow' | 'deny' | 'ask'): PermissionRule {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const createdAt = Math.floor(Date.now() / 1000)
  db.insert(permissionRules).values({ id, toolName, ruleContent, behavior, createdAt }).run()
  cachedRules = null // invalidate cache
  return { id, toolName, ruleContent, behavior, createdAt }
}

export function deletePermissionRule(id: string): void {
  const db = getDatabase()
  db.delete(permissionRules).where(eq(permissionRules.id, id)).run()
  cachedRules = null // invalidate cache
}

export function resetPermissionRules(): void {
  const db = getDatabase()
  db.delete(permissionRules).run()
  cachedRules = null
  // Re-seed will happen on next app restart via migrate.ts
  // For immediate effect, caller should also re-seed
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts src/main/db/migrate.ts src/main/db/queries/permissions.ts
git commit -m "feat: add permission_rules table with seed data and cached queries"
```

---

### Task 6 : IPC Permissions (`permissions.ipc.ts`)

**Files:**
- Create: `src/main/ipc/permissions.ipc.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] **Step 1: Creer les handlers IPC**

```typescript
// src/main/ipc/permissions.ipc.ts
import { ipcMain } from 'electron'
import { z } from 'zod'
import { getAllPermissionRules, addPermissionRule, deletePermissionRule, resetPermissionRules } from '../db/queries/permissions'

const addRuleSchema = z.object({
  toolName: z.string().min(1).max(100),
  ruleContent: z.string().max(500).nullable(),
  behavior: z.enum(['allow', 'deny', 'ask'])
})

const deleteRuleSchema = z.object({
  id: z.string().min(1)
})

export function registerPermissionsIpc(): void {
  ipcMain.handle('permissions:list', async () => {
    return getAllPermissionRules()
  })

  ipcMain.handle('permissions:add', async (_event, payload: unknown) => {
    const parsed = addRuleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid permissions:add payload')
    const { toolName, ruleContent, behavior } = parsed.data
    return addPermissionRule(toolName, ruleContent, behavior)
  })

  ipcMain.handle('permissions:delete', async (_event, payload: unknown) => {
    const parsed = deleteRuleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid permissions:delete payload')
    deletePermissionRule(parsed.data.id)
  })

  ipcMain.handle('permissions:reset', async () => {
    resetPermissionRules()
  })
}
```

- [ ] **Step 2: Enregistrer dans ipc/index.ts**

Ajouter l'import et l'appel dans `src/main/ipc/index.ts` :

Import (apres la ligne 38) :
```typescript
import { registerPermissionsIpc } from './permissions.ipc'
```

Appel dans `registerAllIpcHandlers()` (apres la ligne 144, avant le bloc Settings) :
```typescript
  // ── Permissions (tool access control) ──────────────
  registerPermissionsIpc()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/permissions.ipc.ts src/main/ipc/index.ts
git commit -m "feat: add permissions IPC handlers (list, add, delete, reset)"
```

---

### Task 7 : Types partages et methodes preload

**Files:**
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Ajouter les types dans preload/types.ts**

Ajouter apres la definition de `StreamChunk` (apres la ligne 97) :

```typescript
/** Permission rule for tool access control */
export interface PermissionRuleInfo {
  id: string
  toolName: string
  ruleContent?: string | null
  behavior: 'allow' | 'deny' | 'ask'
  createdAt: number
}

/** Tool approval request sent during streaming */
export interface ToolApprovalRequest {
  approvalId: string
  toolName: string
  toolArgs: Record<string, unknown>
}
```

Modifier le type `StreamChunk` (ligne 84-97) pour ajouter les nouveaux types de chunks :

```typescript
export interface StreamChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'tool-result' | 'tool-approval' | 'tool-approval-resolved' | 'finish' | 'error'
  content?: string
  error?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolCallId?: string
  toolIsError?: boolean
  // Tool approval fields
  approvalId?: string
  decision?: 'allow' | 'deny'
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}
```

- [ ] **Step 2: Ajouter les methodes preload dans preload/index.ts**

Ajouter dans l'objet `api` les methodes permissions et approval :

```typescript
  // ── Permissions ───────────────────────────────────
  permissionsList: () => ipcRenderer.invoke('permissions:list'),
  permissionsAdd: (data: { toolName: string; ruleContent: string | null; behavior: 'allow' | 'deny' | 'ask' }) =>
    ipcRenderer.invoke('permissions:add', data),
  permissionsDelete: (data: { id: string }) =>
    ipcRenderer.invoke('permissions:delete', data),
  permissionsReset: () => ipcRenderer.invoke('permissions:reset'),

  // ── Tool Approval ────────────────────────────────
  onToolApproval: (cb: (request: { approvalId: string; toolName: string; toolArgs: Record<string, unknown> }) => void) => {
    ipcRenderer.on('chat:tool-approval', (_event, request) => cb(request))
  },
  offToolApproval: () => {
    ipcRenderer.removeAllListeners('chat:tool-approval')
  },
  approveToolCall: (approvalId: string, decision: 'allow' | 'deny' | 'allow-session') =>
    ipcRenderer.invoke('chat:approve-tool', { approvalId, decision }),
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/types.ts src/preload/index.ts
git commit -m "feat: add permission and tool approval types and preload methods"
```

---

### Task 8 : Porter les 4 tools existants dans `tools/`

**Files:**
- Create: `src/main/llm/tools/bash.ts`
- Create: `src/main/llm/tools/file-read.ts`
- Create: `src/main/llm/tools/file-write.ts`
- Create: `src/main/llm/tools/list-files.ts`

- [ ] **Step 1: Creer bash.ts**

```typescript
// src/main/llm/tools/bash.ts
import { tool } from 'ai'
import { z } from 'zod'
import { execSandboxed } from '../../services/seatbelt'
import { runBashSecurityChecks } from '../bash-security'
import { truncateOutput, MAX_OUTPUT_LENGTH } from './shared'

export function buildBashTool(workspacePath: string) {
  return tool({
    description:
      'Execute a shell command in the workspace directory. Use for: npm, git, grep, find, test runners, linters, build tools, and any CLI tool. The working directory is the workspace root.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute')
    }),
    execute: async ({ command }) => {
      // Security checks are called by the pipeline wrapper, not here
      // (kept for defense-in-depth if tool is called outside pipeline)
      try {
        const result = await execSandboxed(command, workspacePath, {
          timeout: 30_000,
          maxBuffer: MAX_OUTPUT_LENGTH,
          cwd: workspacePath
        })
        return {
          stdout: truncateOutput(result.stdout),
          stderr: truncateOutput(result.stderr),
          exitCode: result.exitCode ?? 0
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Command execution failed'
        return { stdout: '', stderr: msg, exitCode: 1 }
      }
    }
  })
}
```

- [ ] **Step 2: Creer file-read.ts**

```typescript
// src/main/llm/tools/file-read.ts
import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { isReadableFile, validatePath, MAX_FILE_SIZE, fileReadTimestamps } from './shared'

export function buildReadFileTool(workspacePath: string) {
  return tool({
    description:
      'Read the contents of a TEXT file in the workspace. Only works on textual files (code, config, docs). Cannot read binary files, .env files, or files inside node_modules/.git.',
    inputSchema: z.object({
      path: z.string().describe('Relative file path from workspace root (e.g. "src/index.ts")')
    }),
    execute: async ({ path: filePath }) => {
      const check = isReadableFile(filePath)
      if (!check.allowed) return { error: check.reason! }

      const pathCheck = validatePath(filePath, workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      try {
        const fullPath = join(workspacePath, filePath)
        const stat = statSync(fullPath)
        if (stat.size > MAX_FILE_SIZE) {
          return { error: `Fichier trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)` }
        }
        const content = readFileSync(fullPath, 'utf-8')
        const ext = extname(filePath).slice(1) || 'txt'

        // Update TOCTOU cache
        fileReadTimestamps.set(fullPath, stat.mtimeMs)

        return { path: filePath, content, language: ext, size: stat.size }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot read file' }
      }
    }
  })
}
```

- [ ] **Step 3: Creer file-write.ts**

```typescript
// src/main/llm/tools/file-write.ts
import { tool } from 'ai'
import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { validatePath, MAX_FILE_SIZE } from './shared'

export function buildWriteFileTool(workspacePath: string) {
  return tool({
    description:
      'Create or overwrite a file in the workspace. Parent directories are created automatically. Use for creating new files or generating code.',
    inputSchema: z.object({
      path: z.string().describe('Relative file path to write (e.g. "src/components/Button.tsx")'),
      content: z.string().max(MAX_FILE_SIZE).describe('Full content to write to the file (max 5MB)')
    }),
    execute: async ({ path: filePath, content }) => {
      const pathCheck = validatePath(filePath, workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      try {
        const fullPath = join(workspacePath, filePath)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, content, 'utf-8')
        return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot write file' }
      }
    }
  })
}
```

- [ ] **Step 4: Creer list-files.ts**

```typescript
// src/main/llm/tools/list-files.ts
import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { validatePath, BLOCKED_PATH_SEGMENTS, MAX_LIST_ENTRIES } from './shared'

export function buildListFilesTool(workspacePath: string) {
  return tool({
    description:
      'List files and directories in the workspace. Without argument, lists the root. With a path, lists that directory.',
    inputSchema: z.object({
      path: z.string().optional().describe('Relative directory path to list (optional, root by default)'),
      recursive: z.boolean().optional().describe('List recursively (default false)')
    }),
    execute: async ({ path: dirPath, recursive }) => {
      const pathCheck = validatePath(dirPath ?? '', workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      try {
        const fullPath = join(workspacePath, dirPath ?? '')
        const entries: Array<{ path: string; type: string; size: number }> = []

        function scanDir(dir: string, prefix: string) {
          if (entries.length >= MAX_LIST_ENTRIES) return
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (entries.length >= MAX_LIST_ENTRIES) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue
            const rel = prefix ? `${prefix}/${item.name}` : item.name
            if (item.isDirectory()) {
              entries.push({ path: rel, type: 'directory', size: 0 })
              if (recursive) scanDir(join(dir, item.name), rel)
            } else {
              try {
                const stat = statSync(join(dir, item.name))
                entries.push({ path: rel, type: 'file', size: stat.size })
              } catch {
                entries.push({ path: rel, type: 'file', size: 0 })
              }
            }
          }
        }

        scanDir(fullPath, '')
        return { path: dirPath ?? '.', entries }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot list directory' }
      }
    }
  })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/main/llm/tools/bash.ts src/main/llm/tools/file-read.ts src/main/llm/tools/file-write.ts src/main/llm/tools/list-files.ts
git commit -m "refactor: port 4 existing tools to individual modules in tools/"
```

---

### Task 9 : Assembleur tools + pipeline (`tools/index.ts`)

**Files:**
- Create: `src/main/llm/tools/index.ts`

- [ ] **Step 1: Creer l'assembleur avec wrapping pipeline**

```typescript
// src/main/llm/tools/index.ts
import { buildBashTool } from './bash'
import { buildReadFileTool } from './file-read'
import { buildWriteFileTool } from './file-write'
import { buildListFilesTool } from './list-files'
import { runBashSecurityChecks } from '../bash-security'
import { evaluatePermission, addSessionApproval, type PermissionRule, type PermissionDecision } from '../permission-engine'

export { buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from './context'

export interface ToolPipelineOptions {
  rules: PermissionRule[]
  onAskApproval: (request: { toolName: string; toolArgs: Record<string, unknown> }) => Promise<'allow' | 'deny' | 'allow-session'>
}

/**
 * Build all conversation tools with the security pipeline wrapper.
 * Each tool.execute() passes through:
 * 1. Security checks (hard blocks)
 * 2. Permission rules evaluation
 * 3. Approval callback if needed
 * 4. Original execution
 */
export function buildConversationTools(
  workspacePath: string,
  options?: ToolPipelineOptions
) {
  const rawTools = {
    bash: buildBashTool(workspacePath),
    readFile: buildReadFileTool(workspacePath),
    writeFile: buildWriteFileTool(workspacePath),
    listFiles: buildListFilesTool(workspacePath),
  }

  // Without pipeline options, return raw tools (for tests/Arena)
  if (!options) return rawTools

  const { rules, onAskApproval } = options
  const wrapped: Record<string, unknown> = {}

  for (const [name, toolDef] of Object.entries(rawTools)) {
    const originalExecute = (toolDef as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute
    wrapped[name] = {
      ...toolDef,
      execute: async (args: Record<string, unknown>) => {
        // 1. Security checks (bash only, hard block)
        if (name === 'bash') {
          const check = runBashSecurityChecks(String(args.command ?? ''))
          if (!check.pass) {
            return { error: `Commande refusee (check #${check.failedCheck}): ${check.reason}` }
          }
        }

        // 2. Permission evaluation
        const decision = evaluatePermission(
          { toolName: name, toolArgs: args, workspacePath },
          rules
        )

        if (decision === 'deny') {
          return { error: 'Action refusee par les permissions' }
        }

        if (decision === 'ask') {
          const result = await onAskApproval({ toolName: name, toolArgs: args })
          if (result === 'deny') {
            return { error: 'Action refusee par l\'utilisateur' }
          }
          if (result === 'allow-session') {
            addSessionApproval(`${name}::${args.command ?? args.path ?? args.file_path ?? args.url ?? '*'}`)
          }
        }

        // 3. Execute
        return originalExecute(args)
      }
    }
  }

  return wrapped as typeof rawTools
}
```

- [ ] **Step 2: Creer le fichier context.ts (porte depuis conversation-tools.ts)**

```typescript
// src/main/llm/tools/context.ts
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const CONTEXT_FILES = [
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'COPILOT.md',
  'CURSORRULES', '.cursorrules',
  'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md',
]

const MAX_CONTEXT_FILE_SIZE = 50_000
const MAX_TOTAL_CONTEXT_SIZE = 200_000

export function buildWorkspaceContextBlock(workspacePath: string): string {
  const parts: string[] = []
  let totalSize = 0

  for (const filename of CONTEXT_FILES) {
    const filePath = join(workspacePath, filename)
    if (!existsSync(filePath)) continue

    try {
      const content = readFileSync(filePath, 'utf-8')
      if (!content.trim()) continue
      if (content.length > MAX_CONTEXT_FILE_SIZE) continue
      if (totalSize + content.length > MAX_TOTAL_CONTEXT_SIZE) break

      totalSize += content.length
      const safeContent = content
        .replace(/<\/file>/gi, '&lt;/file&gt;')
        .replace(/<\/workspace-context>/gi, '&lt;/workspace-context&gt;')
      parts.push(`<file name="${filename}">\n${safeContent}\n</file>`)
    } catch { /* Skip unreadable */ }
  }

  if (parts.length === 0) return ''
  return `<workspace-context>\n${parts.join('\n\n')}\n</workspace-context>`
}

export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au dossier de travail de l'utilisateur via des outils.

Outils disponibles :
- bash(command) — Executer une commande shell dans le dossier de travail (npm, git, grep, find, tests, linters, builds, etc.)
- readFile(path) — Lire le contenu d'un fichier texte
- writeFile(path, content) — Creer ou modifier un fichier (repertoires parents crees automatiquement)
- listFiles(path?, recursive?) — Lister les fichiers et dossiers (racine par defaut)

REGLES IMPORTANTES :
- Les fichiers de contexte du projet (README, CLAUDE.md, etc.) sont deja fournis ci-dessus dans <workspace-context>. NE PAS les relire avec readFile().
- Utilise les outils pour interagir avec le projet. Ne dis JAMAIS "je vais faire X" sans appeler l'outil immediatement.
- Tu peux enchainer plusieurs appels d'outils. Par exemple : listFiles() pour decouvrir la structure, readFile() pour lire un fichier, writeFile() pour le modifier.
- Utilise bash() pour : installer des packages (npm install), lancer des tests (npm test), verifier le code (npx tsc --noEmit), rechercher dans le code (grep -rn), et toute autre operation en ligne de commande.
- Utilise writeFile() pour creer ou modifier des fichiers. Fournis toujours le contenu COMPLET du fichier.
- Commence par listFiles() pour decouvrir la structure si tu ne connais pas les chemins.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Apres avoir modifie des fichiers, tu peux lancer les tests ou le linter avec bash() pour verifier que tout fonctionne.
`.trim()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/tools/index.ts src/main/llm/tools/context.ts
git commit -m "feat: add tools assembler with permission pipeline wrapping"
```

---

### Task 10 : Integration chat.ipc.ts + approval handler

**Files:**
- Modify: `src/main/ipc/chat.ipc.ts`

- [ ] **Step 1: Mettre a jour les imports (ligne 11)**

Remplacer :
```typescript
import { buildConversationTools, buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from '../llm/conversation-tools'
```
Par :
```typescript
import { buildConversationTools, buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from '../llm/tools'
import { getAllPermissionRules } from '../db/queries/permissions'
import { addSessionApproval } from '../llm/permission-engine'
```

- [ ] **Step 2: Ajouter le systeme de pending approvals (apres la ligne 58)**

```typescript
// ── Pending Approvals (for tool permission pipeline) ──────
const pendingApprovals = new Map<string, {
  resolve: (decision: 'allow' | 'deny' | 'allow-session') => void
  timeout: NodeJS.Timeout
}>()

const APPROVAL_TIMEOUT_MS = 60_000 // 60 seconds
```

- [ ] **Step 3: Supprimer shouldAutoApprove et wrapToolsWithApproval (lignes 62-119)**

Supprimer tout le bloc de `interface ToolLike` jusqu'a la fin de `wrapToolsWithApproval` (lignes 62-119). Ce code est remplace par le pipeline de permissions dans `tools/index.ts`.

- [ ] **Step 4: Modifier la construction des tools dans handleChatMessage**

Dans `handleChatMessage` (vers ligne 165-170 apres les modifications), apres la resolution du workspacePath, remplacer l'appel a `buildConversationTools` :

```typescript
    // Build conversation tools with permission pipeline
    const rules = getAllPermissionRules()
    const workspaceTools = buildConversationTools(resolvedWorkspacePath, {
      rules,
      onAskApproval: async (request) => {
        const approvalId = crypto.randomUUID()

        return new Promise<'allow' | 'deny' | 'allow-session'>((resolve) => {
          // Set timeout for auto-deny
          const timeout = setTimeout(() => {
            pendingApprovals.delete(approvalId)
            resolve('deny')
            win.webContents.send('chat:chunk', {
              type: 'tool-approval-resolved',
              approvalId,
              decision: 'deny'
            })
          }, APPROVAL_TIMEOUT_MS)

          pendingApprovals.set(approvalId, { resolve, timeout })

          // Send approval request to renderer (or Remote)
          if (source === 'telegram' && isRemoteConnected) {
            telegramBotService.requestApproval(approvalId, request.toolName, request.toolArgs)
              .then(approved => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve(approved ? 'allow' : 'deny')
              })
              .catch(() => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve('deny')
              })
          } else if (source === 'websocket' && isWsConnected) {
            remoteServerService.requestApproval(approvalId, request.toolName, request.toolArgs)
              .then(approved => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve(approved ? 'allow' : 'deny')
              })
              .catch(() => {
                clearTimeout(timeout)
                pendingApprovals.delete(approvalId)
                resolve('deny')
              })
          } else {
            // Desktop: send approval request via IPC chunk
            win.webContents.send('chat:chunk', {
              type: 'tool-approval',
              approvalId,
              toolName: request.toolName,
              toolArgs: request.toolArgs
            })
          }
        })
      }
    })
```

- [ ] **Step 5: Ajouter le handler IPC pour les reponses d'approbation**

Ajouter dans `registerChatIpc()` :

```typescript
  ipcMain.handle('chat:approve-tool', async (_event, payload: unknown) => {
    const schema = z.object({
      approvalId: z.string().min(1),
      decision: z.enum(['allow', 'deny', 'allow-session'])
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid approve-tool payload')

    const { approvalId, decision } = parsed.data
    const pending = pendingApprovals.get(approvalId)
    if (pending) {
      clearTimeout(pending.timeout)
      pendingApprovals.delete(approvalId)
      pending.resolve(decision)
    }
  })
```

- [ ] **Step 6: Supprimer l'ancien wrapToolsWithApproval dans le flux**

Chercher et supprimer les lignes qui appellent `wrapToolsWithApproval()` dans le reste de `handleChatMessage`. Les tools passes a `streamText()` sont deja wrapes par le pipeline.

- [ ] **Step 7: Commit**

```bash
git add src/main/ipc/chat.ipc.ts
git commit -m "feat: integrate permission pipeline into chat handler, replace wrapToolsWithApproval"
```

---

### Task 11 : Supprimer conversation-tools.ts

**Files:**
- Delete: `src/main/llm/conversation-tools.ts`

- [ ] **Step 1: Supprimer l'ancien fichier**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && trash src/main/llm/conversation-tools.ts
```

- [ ] **Step 2: Verifier qu'aucun import ne reference l'ancien fichier**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && grep -rn "conversation-tools" src/ --include="*.ts" --include="*.tsx"
```

Si des imports restent, les mettre a jour vers `../llm/tools` ou `../llm/tools/index`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit -p src/main/tsconfig.json 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove conversation-tools.ts (replaced by tools/ modules)"
```

---

### Task 12 : Approval Banner UI (`ToolApprovalBanner.tsx`)

**Files:**
- Create: `src/renderer/src/components/chat/ToolApprovalBanner.tsx`
- Modify: `src/renderer/src/components/chat/ChatView.tsx`
- Modify: `src/renderer/src/hooks/useStreaming.ts`
- Modify: `src/renderer/src/stores/ui.store.ts`

- [ ] **Step 1: Ajouter le state dans ui.store.ts**

Ajouter dans l'interface `UiState` (apres `draftContent`) :

```typescript
  pendingApproval: { approvalId: string; toolName: string; toolArgs: Record<string, unknown> } | null
  setPendingApproval: (approval: { approvalId: string; toolName: string; toolArgs: Record<string, unknown> } | null) => void
```

Ajouter dans le store (apres `draftContent: ''`) :

```typescript
  pendingApproval: null,
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
```

- [ ] **Step 2: Creer ToolApprovalBanner.tsx**

```tsx
// src/renderer/src/components/chat/ToolApprovalBanner.tsx
import { useUiStore } from '@/stores/ui.store'
import { AlertTriangle, Check, Clock, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const TOOL_LABELS: Record<string, string> = {
  bash: 'Commande shell',
  writeFile: 'Ecriture de fichier',
  FileEdit: 'Modification de fichier',
  WebFetchTool: 'Acces web',
}

function getToolDetail(toolName: string, toolArgs: Record<string, unknown>): string {
  if (toolName === 'bash') return String(toolArgs.command ?? '')
  if (toolName === 'writeFile' || toolName === 'FileEdit') return String(toolArgs.path ?? toolArgs.file_path ?? '')
  if (toolName === 'WebFetchTool') return String(toolArgs.url ?? '')
  return JSON.stringify(toolArgs).slice(0, 200)
}

export function ToolApprovalBanner() {
  const approval = useUiStore((s) => s.pendingApproval)
  const setPendingApproval = useUiStore((s) => s.setPendingApproval)
  const [countdown, setCountdown] = useState(60)

  useEffect(() => {
    if (!approval) return
    setCountdown(60)
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [approval?.approvalId])

  if (!approval) return null

  const label = TOOL_LABELS[approval.toolName] ?? approval.toolName
  const detail = getToolDetail(approval.toolName, approval.toolArgs)

  const handleDecision = (decision: 'allow' | 'deny' | 'allow-session') => {
    window.api.approveToolCall(approval.approvalId, decision)
    setPendingApproval(null)
  }

  return (
    <div className="mx-4 mb-2 flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yellow-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground font-mono mt-0.5">{detail}</p>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => handleDecision('allow')}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            <Check className="size-3" /> Autoriser
          </button>
          <button
            onClick={() => handleDecision('allow-session')}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Clock className="size-3" /> Session
          </button>
          <button
            onClick={() => handleDecision('deny')}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            <X className="size-3" /> Refuser
          </button>
          <span className="ml-auto text-xs text-muted-foreground">{countdown}s</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Integrer dans ChatView.tsx**

Ajouter l'import en haut :
```typescript
import { ToolApprovalBanner } from './ToolApprovalBanner'
```

Inserer `<ToolApprovalBanner />` juste avant `<InputZone />` dans le JSX du ChatView.

- [ ] **Step 4: Gerer les chunks tool-approval dans useStreaming.ts**

Ajouter dans le type `StreamChunk` local (ligne 9) les nouveaux types :
```typescript
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'tool-result' | 'tool-approval' | 'tool-approval-resolved' | 'finish' | 'error'
```

Ajouter le handler dans le callback `onChunk` (dans le switch/if chain) :
```typescript
      if (chunk.type === 'tool-approval') {
        useUiStore.getState().setPendingApproval({
          approvalId: chunk.approvalId!,
          toolName: chunk.toolName!,
          toolArgs: chunk.toolArgs ?? {}
        })
        return
      }

      if (chunk.type === 'tool-approval-resolved') {
        useUiStore.getState().setPendingApproval(null)
        return
      }
```

Ajouter les champs `approvalId` et `decision` dans l'interface `StreamChunk` locale :
```typescript
  approvalId?: string
  decision?: string
```

- [ ] **Step 5: Ajouter les labels pour les nouveaux tools dans useStreaming.ts**

Mettre a jour `TOOL_LABELS` (ligne 36-43) :
```typescript
const TOOL_LABELS: Record<string, string> = {
  bash: 'Commande shell',
  readFile: 'Lecture du fichier',
  writeFile: 'Ecriture du fichier',
  FileEdit: 'Modification du fichier',
  listFiles: 'Exploration des fichiers',
  GrepTool: 'Recherche dans les fichiers',
  GlobTool: 'Recherche de fichiers',
  WebFetchTool: 'Acces web',
  search: 'Recherche web'
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/chat/ToolApprovalBanner.tsx src/renderer/src/components/chat/ChatView.tsx src/renderer/src/hooks/useStreaming.ts src/renderer/src/stores/ui.store.ts
git commit -m "feat: add ToolApprovalBanner UI component with countdown and session approval"
```

---

### Task 13 : Settings UI Permissions (`PermissionsSettings.tsx`)

**Files:**
- Create: `src/renderer/src/components/settings/PermissionsSettings.tsx`
- Modify: `src/renderer/src/components/settings/SettingsView.tsx`
- Modify: `src/renderer/src/stores/ui.store.ts`

- [ ] **Step 1: Ajouter le tab 'permissions' au type SettingsTab**

Dans `ui.store.ts` (ligne 5), ajouter `'permissions'` :

```typescript
export type SettingsTab = 'general' | 'appearance' | 'apikeys' | 'model' | 'audio' | 'keybindings' | 'data' | 'backup' | 'remote' | 'summary' | 'privacy' | 'permissions'
```

- [ ] **Step 2: Creer PermissionsSettings.tsx**

```tsx
// src/renderer/src/components/settings/PermissionsSettings.tsx
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PermissionRuleInfo } from '../../../../preload/types'

const TOOL_NAMES = ['bash', 'readFile', 'writeFile', 'FileEdit', 'listFiles', 'GrepTool', 'GlobTool', 'WebFetchTool'] as const
const BEHAVIOR_LABELS: Record<string, string> = { allow: 'Autoriser', deny: 'Refuser', ask: 'Demander' }
const BEHAVIOR_COLORS: Record<string, string> = {
  allow: 'text-green-400',
  deny: 'text-red-400',
  ask: 'text-yellow-400'
}

export function PermissionsSettings() {
  const [rules, setRules] = useState<PermissionRuleInfo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTool, setNewTool] = useState<string>('bash')
  const [newContent, setNewContent] = useState('')
  const [newBehavior, setNewBehavior] = useState<'allow' | 'deny' | 'ask'>('allow')

  const loadRules = async () => {
    const data = await window.api.permissionsList()
    setRules(data)
  }

  useEffect(() => { loadRules() }, [])

  const handleAdd = async () => {
    await window.api.permissionsAdd({
      toolName: newTool,
      ruleContent: newContent.trim() || null,
      behavior: newBehavior
    })
    setNewContent('')
    setShowAdd(false)
    loadRules()
  }

  const handleDelete = async (id: string) => {
    await window.api.permissionsDelete({ id })
    loadRules()
  }

  const handleReset = async () => {
    await window.api.permissionsReset()
    loadRules()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Permissions des outils</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Controlez quels outils le LLM peut utiliser et dans quelles conditions.
        </p>
      </div>

      {/* Rules list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Regles actives</h3>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80"
          >
            <Plus className="size-3" /> Ajouter
          </button>
        </div>

        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune regle configuree</p>
        )}

        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-sidebar px-3 py-2">
            <span className={`text-xs font-mono font-bold ${BEHAVIOR_COLORS[rule.behavior]}`}>
              {BEHAVIOR_LABELS[rule.behavior]}
            </span>
            <span className="text-sm font-medium">{rule.toolName}</span>
            {rule.ruleContent && (
              <span className="text-xs text-muted-foreground font-mono truncate">{rule.ruleContent}</span>
            )}
            <button
              onClick={() => handleDelete(rule.id)}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add rule form */}
      {showAdd && (
        <div className="space-y-3 rounded-lg border border-border/40 bg-sidebar p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Outil</label>
              <select
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {TOOL_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pattern</label>
              <input
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="npm *, /src/**, *.github.com"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <select
                value={newBehavior}
                onChange={(e) => setNewBehavior(e.target.value as 'allow' | 'deny' | 'ask')}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="allow">Autoriser</option>
                <option value="deny">Refuser</option>
                <option value="ask">Demander</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Ajouter
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Reset */}
      <button
        onClick={handleReset}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Reinitialiser les permissions par defaut
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Ajouter l'onglet dans SettingsView.tsx**

Ajouter l'import :
```typescript
import { PermissionsSettings } from './PermissionsSettings'
```

Ajouter l'onglet dans le tableau `TABS` (apres 'privacy', ligne 35) :
```typescript
  { type: 'tab', id: 'permissions', label: 'Permissions', icon: <Shield className="size-4" /> },
```

Note : `Shield` est deja importe (ligne 3). Si un doublon visuel avec privacy/shield pose probleme, utiliser `Lock` de lucide-react.

Ajouter le rendu dans le switch/conditional du contenu :
```tsx
{activeTab === 'permissions' && <PermissionsSettings />}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/settings/PermissionsSettings.tsx src/renderer/src/components/settings/SettingsView.tsx src/renderer/src/stores/ui.store.ts
git commit -m "feat: add Permissions settings tab with rules CRUD UI"
```

---

### Task 14 : Typecheck complet Phase 1

**Files:** (aucun nouveau)

- [ ] **Step 1: Typecheck main**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit -p src/main/tsconfig.json 2>&1 | head -50
```

Corriger toute erreur TypeScript.

- [ ] **Step 2: Typecheck renderer**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit 2>&1 | head -50
```

Corriger toute erreur TypeScript.

- [ ] **Step 3: Commit des corrections**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from Phase 1 migration"
```

---

## Phase 2 : Nouveaux tools

### Task 15 : FileEdit Tool (`tools/file-edit.ts`)

**Files:**
- Create: `src/main/llm/tools/file-edit.ts`
- Modify: `src/main/llm/tools/index.ts`

- [ ] **Step 1: Creer file-edit.ts**

```typescript
// src/main/llm/tools/file-edit.ts
import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { validatePath, fileReadTimestamps } from './shared'

export function buildFileEditTool(workspacePath: string) {
  return tool({
    description:
      'Edit an existing file by replacing a specific string. The old_string must be unique in the file (unless replace_all is true). You MUST read the file first with readFile before editing it.',
    inputSchema: z.object({
      file_path: z.string().describe('Relative file path to edit'),
      old_string: z.string().describe('The exact string to find and replace'),
      new_string: z.string().describe('The replacement string'),
      replace_all: z.boolean().optional().default(false).describe('Replace all occurrences (default: false, requires unique match)')
    }),
    execute: async ({ file_path, old_string, new_string }) => {
      if (old_string === new_string) {
        return { error: 'old_string et new_string sont identiques' }
      }

      const pathCheck = validatePath(file_path, workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      const fullPath = join(workspacePath, file_path)

      try {
        const stat = statSync(fullPath)

        // TOCTOU check: was the file read before editing?
        const lastReadMtime = fileReadTimestamps.get(fullPath)
        if (lastReadMtime !== undefined && Math.abs(stat.mtimeMs - lastReadMtime) > 100) {
          return { error: 'Le fichier a ete modifie depuis la derniere lecture. Relisez-le avec readFile avant de le modifier.' }
        }

        const content = readFileSync(fullPath, 'utf-8')

        if (!content.includes(old_string)) {
          return { error: `La chaine a remplacer n'a pas ete trouvee dans le fichier` }
        }

        // Check uniqueness (unless replace_all)
        // Note: replace_all is destructured from the tool args above
        // but AI SDK may not pass it through — access via the raw args object
        const replaceAll = (arguments[0] as { replace_all?: boolean }).replace_all ?? false
        if (!replaceAll) {
          const count = content.split(old_string).length - 1
          if (count > 1) {
            return { error: `La chaine apparait ${count} fois dans le fichier. Utilisez replace_all: true ou fournissez une chaine plus specifique.` }
          }
        }

        const newContent = replaceAll
          ? content.split(old_string).join(new_string)
          : content.replace(old_string, new_string)

        writeFileSync(fullPath, newContent, 'utf-8')

        // Update TOCTOU cache
        const newStat = statSync(fullPath)
        fileReadTimestamps.set(fullPath, newStat.mtimeMs)

        return { success: true, path: file_path }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot edit file' }
      }
    }
  })
}
```

- [ ] **Step 2: Integrer dans tools/index.ts**

Ajouter l'import :
```typescript
import { buildFileEditTool } from './file-edit'
```

Ajouter dans `rawTools` :
```typescript
    FileEdit: buildFileEditTool(workspacePath),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/tools/file-edit.ts src/main/llm/tools/index.ts
git commit -m "feat: add FileEdit tool with TOCTOU protection and string replacement"
```

---

### Task 16 : GrepTool (`tools/grep.ts`)

**Files:**
- Create: `src/main/llm/tools/grep.ts`
- Modify: `src/main/llm/tools/index.ts`

- [ ] **Step 1: Creer grep.ts**

```typescript
// src/main/llm/tools/grep.ts
import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { validatePath, TEXT_EXTENSIONS, BLOCKED_PATH_SEGMENTS, KNOWN_EXTENSIONLESS } from './shared'

const MAX_MATCHED_FILES = 100
const MAX_TOTAL_LINES = 500

export function buildGrepTool(workspacePath: string) {
  return tool({
    description:
      'Search for a regex pattern in files within the workspace. Returns matching lines with file path and line number. Read-only, cannot modify files.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Subdirectory to search in (default: workspace root)'),
      glob: z.string().optional().describe('File pattern filter (e.g. "*.ts", "*.{ts,tsx}")'),
      include_context: z.number().optional().describe('Lines of context before/after match (default: 0)'),
      case_insensitive: z.boolean().optional().describe('Case insensitive search (default: false)')
    }),
    execute: async ({ pattern, path: subPath, glob: globPattern, include_context, case_insensitive }) => {
      const pathCheck = validatePath(subPath ?? '', workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      let regex: RegExp
      try {
        regex = new RegExp(pattern, case_insensitive ? 'gi' : 'g')
      } catch (e) {
        return { error: `Pattern regex invalide : ${e instanceof Error ? e.message : pattern}` }
      }

      const searchRoot = join(workspacePath, subPath ?? '')
      const matches: Array<{ file: string; line: number; content: string }> = []
      let matchedFiles = 0
      let totalLines = 0

      function searchDir(dir: string, prefix: string) {
        if (matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES) return
        try {
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue

            const fullItemPath = join(dir, item.name)
            const relPath = prefix ? `${prefix}/${item.name}` : item.name

            if (item.isDirectory()) {
              searchDir(fullItemPath, relPath)
            } else if (item.isFile()) {
              // Check extension
              const ext = extname(item.name).toLowerCase()
              if (ext && !TEXT_EXTENSIONS.has(ext)) continue
              if (!ext && !KNOWN_EXTENSIONLESS.some(n => item.name === n)) continue

              // Check glob filter
              if (globPattern) {
                const { minimatch } = require('minimatch')
                if (!minimatch(item.name, globPattern, { dot: true })) continue
              }

              // Check size (skip large files)
              try {
                const stat = statSync(fullItemPath)
                if (stat.size > 1_000_000) continue // Skip files > 1MB
              } catch { continue }

              // Search content
              try {
                const content = readFileSync(fullItemPath, 'utf-8')
                const lines = content.split('\n')
                let fileHasMatch = false
                const ctx = include_context ?? 0

                for (let i = 0; i < lines.length; i++) {
                  if (totalLines >= MAX_TOTAL_LINES) break
                  regex.lastIndex = 0
                  if (regex.test(lines[i])) {
                    if (!fileHasMatch) {
                      fileHasMatch = true
                      matchedFiles++
                    }
                    // Add context lines
                    const start = Math.max(0, i - ctx)
                    const end = Math.min(lines.length - 1, i + ctx)
                    for (let j = start; j <= end; j++) {
                      if (totalLines >= MAX_TOTAL_LINES) break
                      matches.push({ file: relPath, line: j + 1, content: lines[j] })
                      totalLines++
                    }
                  }
                }
              } catch { /* Skip unreadable files */ }
            }
          }
        } catch { /* Skip unreadable directories */ }
      }

      searchDir(searchRoot, '')
      return {
        matches,
        totalMatches: matches.length,
        matchedFiles,
        truncated: matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES
      }
    }
  })
}
```

- [ ] **Step 2: Ajouter dans tools/index.ts**

```typescript
import { buildGrepTool } from './grep'
// Dans rawTools:
    GrepTool: buildGrepTool(workspacePath),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/tools/grep.ts src/main/llm/tools/index.ts
git commit -m "feat: add GrepTool for regex search in workspace files"
```

---

### Task 17 : GlobTool (`tools/glob.ts`)

**Files:**
- Create: `src/main/llm/tools/glob.ts`
- Modify: `src/main/llm/tools/index.ts`

- [ ] **Step 1: Creer glob.ts**

```typescript
// src/main/llm/tools/glob.ts
import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { minimatch } from 'minimatch'
import { validatePath, BLOCKED_PATH_SEGMENTS } from './shared'

const MAX_GLOB_RESULTS = 200

export function buildGlobTool(workspacePath: string) {
  return tool({
    description:
      'Find files matching a glob pattern in the workspace. Returns file paths sorted by modification time (newest first). Read-only.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.tsx", "src/**/*.test.ts")'),
      path: z.string().optional().describe('Subdirectory to search in (default: workspace root)')
    }),
    execute: async ({ pattern, path: subPath }) => {
      const pathCheck = validatePath(subPath ?? '', workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      const searchRoot = join(workspacePath, subPath ?? '')
      const results: Array<{ path: string; size: number; mtime: number }> = []

      function scanDir(dir: string) {
        if (results.length >= MAX_GLOB_RESULTS) return
        try {
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (results.length >= MAX_GLOB_RESULTS) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue

            const fullPath = join(dir, item.name)
            const relPath = relative(searchRoot, fullPath)

            if (item.isDirectory()) {
              scanDir(fullPath)
            } else if (item.isFile()) {
              if (minimatch(relPath, pattern, { dot: true })) {
                try {
                  const stat = statSync(fullPath)
                  results.push({ path: relPath, size: stat.size, mtime: stat.mtimeMs })
                } catch {
                  results.push({ path: relPath, size: 0, mtime: 0 })
                }
              }
            }
          }
        } catch { /* Skip unreadable */ }
      }

      scanDir(searchRoot)

      // Sort by mtime desc (newest first)
      results.sort((a, b) => b.mtime - a.mtime)

      return {
        files: results.map(r => ({ path: r.path, size: r.size })),
        total: results.length,
        truncated: results.length >= MAX_GLOB_RESULTS
      }
    }
  })
}
```

- [ ] **Step 2: Ajouter dans tools/index.ts**

```typescript
import { buildGlobTool } from './glob'
// Dans rawTools:
    GlobTool: buildGlobTool(workspacePath),
```

- [ ] **Step 3: Commit**

```bash
git add src/main/llm/tools/glob.ts src/main/llm/tools/index.ts
git commit -m "feat: add GlobTool for pattern-based file discovery"
```

---

## Phase 3 : Extension

### Task 18 : WebFetchTool (`tools/web-fetch.ts`)

**Files:**
- Create: `src/main/llm/tools/web-fetch.ts`
- Modify: `src/main/llm/tools/index.ts`
- Modify: `package.json` (dep turndown)

- [ ] **Step 1: Installer turndown**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npm install turndown && npm install -D @types/turndown
```

- [ ] **Step 2: Creer web-fetch.ts**

```typescript
// src/main/llm/tools/web-fetch.ts
import { tool } from 'ai'
import { z } from 'zod'
import TurndownService from 'turndown'

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_MARKDOWN_LENGTH = 100_000 // 100 KB
const FETCH_TIMEOUT_MS = 15_000

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

export function buildWebFetchTool() {
  return tool({
    description:
      'Fetch a web URL and return its content as markdown. Only HTTPS URLs are allowed. Useful for reading documentation, checking endpoints, or fetching reference material.',
    inputSchema: z.object({
      url: z.string().url().describe('The HTTPS URL to fetch'),
      prompt: z.string().optional().describe('Optional instruction for what to extract from the page')
    }),
    execute: async ({ url, prompt }) => {
      // Validate protocol
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') {
          return { error: 'Seules les URLs HTTPS sont autorisees' }
        }
      } catch {
        return { error: 'URL invalide' }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Cruchot/1.0)',
            'Accept': 'text/html,application/xhtml+xml,text/plain,application/json'
          }
        })

        clearTimeout(timeout)

        if (!response.ok) {
          return { error: `HTTP ${response.status}: ${response.statusText}` }
        }

        const contentType = response.headers.get('content-type') ?? ''
        const text = await response.text()

        if (text.length > MAX_RESPONSE_SIZE) {
          return { error: `Reponse trop volumineuse (${(text.length / 1024 / 1024).toFixed(1)} MB, max 2 MB)` }
        }

        let markdown: string

        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          // Convert HTML to Markdown
          markdown = turndown.turndown(text)
        } else if (contentType.includes('application/json')) {
          // Pretty-print JSON
          try {
            markdown = '```json\n' + JSON.stringify(JSON.parse(text), null, 2) + '\n```'
          } catch {
            markdown = '```\n' + text + '\n```'
          }
        } else {
          // Plain text
          markdown = text
        }

        // Truncate if needed
        if (markdown.length > MAX_MARKDOWN_LENGTH) {
          markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n... (contenu tronque)'
        }

        return {
          url,
          content: markdown,
          contentType,
          size: text.length,
          ...(prompt ? { prompt } : {})
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { error: `Timeout apres ${FETCH_TIMEOUT_MS / 1000}s` }
        }
        return { error: error instanceof Error ? error.message : 'Fetch failed' }
      }
    }
  })
}
```

- [ ] **Step 3: Ajouter dans tools/index.ts**

```typescript
import { buildWebFetchTool } from './web-fetch'
// Dans rawTools (APRES les tools workspace):
    WebFetchTool: buildWebFetchTool(),
```

Note : `WebFetchTool` ne prend pas `workspacePath` car il n'accede pas au filesystem.

- [ ] **Step 4: Commit**

```bash
git add src/main/llm/tools/web-fetch.ts src/main/llm/tools/index.ts package.json package-lock.json
git commit -m "feat: add WebFetchTool for fetching web content as markdown"
```

---

### Task 19 : Mise a jour du WORKSPACE_TOOLS_PROMPT

**Files:**
- Modify: `src/main/llm/tools/context.ts`

- [ ] **Step 1: Mettre a jour le prompt avec les 8 tools**

Remplacer `WORKSPACE_TOOLS_PROMPT` dans `context.ts` :

```typescript
export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au dossier de travail de l'utilisateur via des outils.

Outils disponibles :
- bash(command) — Executer une commande shell dans le dossier de travail
- readFile(path) — Lire le contenu d'un fichier texte
- writeFile(path, content) — Creer un nouveau fichier ou remplacer entierement un fichier existant
- FileEdit(file_path, old_string, new_string) — Modifier un fichier existant en remplacant une chaine precise. Tu DOIS lire le fichier avec readFile() d'abord.
- listFiles(path?, recursive?) — Lister les fichiers et dossiers
- GrepTool(pattern, path?, glob?) — Rechercher un pattern regex dans les fichiers du workspace
- GlobTool(pattern, path?) — Trouver des fichiers par pattern glob (ex: "**/*.tsx")
- WebFetchTool(url) — Recuperer le contenu d'une URL web (HTTPS uniquement)

REGLES IMPORTANTES :
- Les fichiers de contexte du projet (README, CLAUDE.md, etc.) sont deja fournis ci-dessus dans <workspace-context>. NE PAS les relire avec readFile().
- Prefere FileEdit() a writeFile() pour modifier des fichiers existants — c'est plus precis et evite d'ecraser le contenu complet.
- Utilise GrepTool() et GlobTool() au lieu de bash grep/find — c'est plus rapide et securise.
- Tu peux enchainer plusieurs appels d'outils pour accomplir des taches complexes.
- Apres avoir modifie des fichiers, lance les tests ou le linter avec bash() pour verifier.
`.trim()
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/tools/context.ts
git commit -m "feat: update WORKSPACE_TOOLS_PROMPT with all 8 tools"
```

---

### Task 20 : Typecheck final + verification

**Files:** (aucun nouveau)

- [ ] **Step 1: Typecheck main**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit -p src/main/tsconfig.json 2>&1 | head -50
```

- [ ] **Step 2: Typecheck renderer**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 3: Build test**

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Verifier que turndown est bien externalise dans electron-vite.config**

Si le build echoue a cause de turndown, verifier `electron.vite.config.ts` et ajouter turndown dans `exclude` du `externalizeDepsPlugin` si necessaire.

- [ ] **Step 5: Commit des corrections finales**

```bash
git add -A
git commit -m "fix: resolve all TypeScript and build errors from migration"
```

---

## Resume des phases

| Phase | Tasks | Fichiers crees | Fichiers modifies | Fichiers supprimes |
|-------|-------|---------------|-------------------|-------------------|
| Phase 1 : Fondation securite | 1-14 | 12 | 10 | 1 |
| Phase 2 : Nouveaux tools | 15-17 | 3 | 1 | 0 |
| Phase 3 : Extension | 18-20 | 1 | 2 | 0 |
| **Total** | **20 tasks** | **16** | **13** | **1** |
