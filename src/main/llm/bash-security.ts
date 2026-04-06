import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ── Constants ─────────────────────────────────────────────

export const COMMAND_SUBSTITUTION_PATTERNS: string[] = [
  '$(',
  '$[',
  '<(',
  '>(',
  '=(',
  '`',
]

export const ZSH_DANGEROUS_COMMANDS: Set<string> = new Set([
  'zmodload',
  'emulate',
  'sysopen',
  'sysread',
  'syswrite',
  'sysseek',
  'ztcp',
  'zsocket',
  'zpty',
  'zf_rm',
  'zf_mv',
  'zf_ln',
  'zf_chmod',
  'zf_chown',
  'zf_mkdir',
  'zf_rmdir',
  'zf_chgrp',
  'mapfile',
])

export const DANGEROUS_VARIABLES: Set<string> = new Set([
  'IFS',
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
  'BASH_ENV',
  'ENV',
  'CDPATH',
  'GLOBIGNORE',
  'PROMPT_COMMAND',
  'MAIL',
  'MAILPATH',
])

export const SCRUBBED_ENV_VARS: string[] = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'XAI_API_KEY',
  'MISTRAL_API_KEY',
  'PERPLEXITY_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENROUTER_API_KEY',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'DATABASE_URL',
  'REDIS_URL',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'NODE_OPTIONS',
  'ELECTRON_RUN_AS_NODE',
]

// ── Types ─────────────────────────────────────────────────

export interface SecurityCheckResult {
  pass: boolean
  failedCheck?: number
  reason?: string
}

// ── Private Helpers ───────────────────────────────────────

/**
 * Returns true if the command has unclosed single or double quotes.
 * Uses a state machine to track quote context (handles escapes, nested quotes).
 */
function hasUnclosedQuotes(command: string): boolean {
  let inSingle = false
  let inDouble = false
  let i = 0

  while (i < command.length) {
    const ch = command[i]

    if (inSingle) {
      // Inside single quotes: only a closing ' ends the string (no escapes)
      if (ch === "'") {
        inSingle = false
      }
      i++
      continue
    }

    if (inDouble) {
      // Inside double quotes: backslash escapes the next character
      if (ch === '\\') {
        i += 2
        continue
      }
      if (ch === '"') {
        inDouble = false
      }
      i++
      continue
    }

    // Outside any quote
    if (ch === '\\') {
      // Backslash outside quotes: skip next char
      i += 2
      continue
    }
    if (ch === "'") {
      inSingle = true
      i++
      continue
    }
    if (ch === '"') {
      inDouble = true
      i++
      continue
    }
    i++
  }

  return inSingle || inDouble
}

// ── Security Checks ───────────────────────────────────────

/**
 * Run 22 security checks against a bash command.
 * Returns { pass: true } if all checks pass.
 * Returns { pass: false, failedCheck, reason } at the first failure.
 *
 * These are hard blocks — never overridable by permission rules.
 * Note: check #6 (newline block) was removed — multi-line commands are legitimate.
 */
export function runBashSecurityChecks(command: string): SecurityCheckResult {
  // Check 1: Unclosed quotes
  if (hasUnclosedQuotes(command)) {
    return {
      pass: false,
      failedCheck: 1,
      reason: 'Commande incomplete : guillemets non fermes',
    }
  }

  // Check 2: jq system() call
  if (/\bjq\b/.test(command) && /\bsystem\s*\(/.test(command)) {
    return {
      pass: false,
      failedCheck: 2,
      reason: 'Appel jq system() interdit',
    }
  }

  // Check 3: Obfuscated flags — backslash inside command names (outside quotes)
  // Detects patterns like r\m, c\hmod, etc.
  // Strip quoted strings first to avoid false positives on escape sequences (e.g. "a\nb")
  const strippedForBackslash = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '')
  if (/[a-zA-Z]\\[a-zA-Z]/.test(strippedForBackslash)) {
    return {
      pass: false,
      failedCheck: 3,
      reason: 'Nom de commande obfusque detecte (backslash interne)',
    }
  }

  // Check 4: Semicolons, newlines, or background (&) followed by dangerous commands
  // Note: `&&` is matched too — the second `&` followed by whitespace then the command works.
  // The `&` (background) operator is included to prevent bypasses like `ls & rm -rf workspace/*`
  // which would otherwise look like a single readonly `ls` to the permission engine.
  const strippedForChaining = command.replace(/'[^']*'|"[^"]*"/g, '') // Remove quoted strings
  if (/[;\n\r&]\s*(rm|chmod|chown|sudo|kill|shutdown|reboot|mkfs)\b/.test(strippedForChaining)) {
    return { pass: false, failedCheck: 4, reason: 'Commande dangereuse chainee detectee' }
  }

  // Check 5: Dangerous variable assignments (IFS=, PATH=, LD_PRELOAD=, etc.)
  // Match VAR= at word boundary (start of token or after ;|&)
  for (const varName of DANGEROUS_VARIABLES) {
    // Pattern: word boundary before var name, followed by =
    const pattern = new RegExp(`(?:^|[;&|\\s])${varName}\\s*=`)
    if (pattern.test(command)) {
      return {
        pass: false,
        failedCheck: 5,
        reason: `Redefinition de variable dangereuse : ${varName}`,
      }
    }
  }

  // Check 6: (removed — multi-line commands are legitimate for LLM tool use)
  // wrapCommand() wraps in eval '...' which safely handles newlines.
  // Dangerous command chaining after newlines is caught by check #4.

  // Check 7: Command substitution patterns (outside quoted strings)
  // Strip quoted content to avoid false positives on backticks in Python/shell strings
  const strippedForSubstitution = command.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '')
  for (const pattern of COMMAND_SUBSTITUTION_PATTERNS) {
    if (strippedForSubstitution.includes(pattern)) {
      return {
        pass: false,
        failedCheck: 7,
        reason: `Substitution de commande interdite : ${pattern}`,
      }
    }
  }

  // Check 8: Suspicious I/O redirections to sensitive paths
  // Detects > or >> followed by sensitive paths
  const sensitiveRedirectPattern =
    /(?:>>?|<)\s*(?:\/etc\/|~\/\.bashrc|~\/\.zshrc|~\/\.profile|~\/\.bash_profile|~\/\.bash_login|\/System\/|\/private\/etc\/)/
  if (sensitiveRedirectPattern.test(command)) {
    return {
      pass: false,
      failedCheck: 8,
      reason: 'Redirection I/O vers un chemin sensible interdite',
    }
  }

  // Check 9: Inline IFS manipulation (IFS=x command)
  const strippedForIfs = command.replace(/'[^']*'|"[^"]*"/g, '')
  if (/\bIFS=[^\s]*\s+\S/.test(strippedForIfs)) {
    return { pass: false, failedCheck: 9, reason: 'Manipulation IFS inline detectee' }
  }

  // Check 10: Git commit message with command substitution
  if (/\bgit\b.*\bcommit\b.*-m\b/.test(command) && /\$\(|\`/.test(command)) {
    return { pass: false, failedCheck: 10, reason: 'Substitution de commande dans git commit detectee' }
  }

  // Check 11: /proc/environ access
  if (/\/proc\/[^/]*\/environ/.test(command) || command.includes('/proc/self/environ')) {
    return {
      pass: false,
      failedCheck: 11,
      reason: 'Acces a /proc/environ interdit',
    }
  }

  // Check 12: Null bytes
  if (command.includes('\x00')) {
    return {
      pass: false,
      failedCheck: 12,
      reason: 'Octet nul detecte dans la commande',
    }
  }

  // Check 13: Backslash escapes at the start of a command token
  // Detects \command patterns used to bypass shell aliases/blocklists
  // Looks for \ immediately before a letter at the start or after whitespace/;|&
  if (/(?:^|[;\s|&])\\[a-zA-Z]/.test(command)) {
    return {
      pass: false,
      failedCheck: 13,
      reason: 'Backslash escape en debut de commande (contournement possible)',
    }
  }

  // Check 14: Dangerous brace expansion like {rm,-rf,/}
  // Detects brace groups that look like commands with flags and paths
  if (/\{[^{}]*,[^{}]*,[^{}]*\}/.test(command)) {
    // More specific: contains something that looks like a command/flag combo
    if (/\{[^{}]*(?:rm|mv|cp|chmod|chown|dd|mkfs|shred)[^{}]*\}/.test(command) ||
        /\{[^{}]*-[a-zA-Z]+[^{}]*,[^{}]*\/[^{}]*\}/.test(command)) {
      return {
        pass: false,
        failedCheck: 14,
        reason: 'Expansion brace dangereuse detectee',
      }
    }
  }

  // Check 15: Control characters (\x00-\x1f except whitespace: space, tab, CR, LF)
  // \x00 already covered above; catch the rest
  // eslint-disable-next-line no-control-regex
  if (/[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(command)) {
    return {
      pass: false,
      failedCheck: 15,
      reason: 'Caractere de controle detecte dans la commande',
    }
  }

  // Check 16: Unicode whitespace (zero-width, non-breaking, etc.)
  // U+00A0 NO-BREAK SPACE, U+200B ZERO WIDTH SPACE, U+FEFF BOM/ZWNBSP,
  // U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR, U+180E MONGOLIAN VOWEL SEPARATOR,
  // U+200C ZWNJ, U+200D ZWJ, U+202F NARROW NO-BREAK SPACE, U+205F MEDIUM MATH SPACE
  if (/[\u00A0\u200B\uFEFF\u2028\u2029\u180E\u200C\u200D\u202F\u205F]/.test(command)) {
    return {
      pass: false,
      failedCheck: 16,
      reason: 'Espace Unicode suspect detecte dans la commande',
    }
  }

  // Check 17: Mid-word hash (hidden comments)
  // Detects # that appears in the middle of a word (not at start of token)
  // Allow: #! (shebang), \033[...m color codes where # appears after a digit (rare but safe)
  // Pattern: a non-space, non-quote character immediately followed by #
  // Exclude: color codes like \e[32m (no # involved), but be careful of things like cmd#malicious
  const hashCheckStr = command
    .replace(/^#!.*$/m, '')      // Remove shebang lines
    .replace(/\\033\[[0-9;]*m/g, '')  // Remove ANSI escape color codes
    .replace(/\\e\[[0-9;]*m/g, '')    // Remove \e[ color codes
    .replace(/\\x1b\[[0-9;]*m/g, '') // Remove \x1b[ color codes
  if (/\S#/.test(hashCheckStr)) {
    return {
      pass: false,
      failedCheck: 17,
      reason: 'Hash en milieu de mot detecte (commentaire cache possible)',
    }
  }

  // Checks 18-23: ZSH dangerous commands
  // Split on whitespace/semicolon/pipe/ampersand to get individual tokens
  const tokens = command.split(/[\s;|&]+/).filter(Boolean)
  for (const token of tokens) {
    // Strip leading path components (e.g. /usr/bin/zmodload -> zmodload)
    const basename = token.split('/').pop() ?? token
    // Strip any trailing non-alpha characters (e.g. trailing flags)
    const cleanToken = basename.replace(/[^a-zA-Z0-9_]/g, '')
    if (ZSH_DANGEROUS_COMMANDS.has(cleanToken)) {
      return {
        pass: false,
        failedCheck: 18,
        reason: `Commande ZSH dangereuse interdite : ${cleanToken}`,
      }
    }
  }

  return { pass: true }
}

// ── Environment Scrubbing ────────────────────────────────

/**
 * Build a minimal, safe environment for sandboxed bash execution.
 * - Strips all secrets and dangerous variables from process.env
 * - Provides a minimal PATH (with /opt/homebrew/bin for macOS)
 * - Detects NVM and prepends the latest Node version to PATH
 * - Sets HOME to workspacePath (confines the shell's home)
 */
export function buildSafeEnv(workspacePath: string): Record<string, string> {
  const home = homedir()

  // Build a minimal safe PATH
  const basePath = [
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
  ]

  // NVM: detect latest installed Node version
  const nvmVersionsDir = join(home, '.nvm', 'versions', 'node')
  if (existsSync(nvmVersionsDir)) {
    try {
      const versions = readdirSync(nvmVersionsDir)
        .filter(v => v.startsWith('v'))
        .sort((a, b) => {
          // Semantic version sort
          const parseVer = (s: string) => s.slice(1).split('.').map(Number)
          const [aMaj, aMin, aPatch] = parseVer(a)
          const [bMaj, bMin, bPatch] = parseVer(b)
          if (aMaj !== bMaj) return bMaj - aMaj
          if (aMin !== bMin) return bMin - aMin
          return bPatch - aPatch
        })

      if (versions.length > 0) {
        const latestNodeBin = join(nvmVersionsDir, versions[0], 'bin')
        if (existsSync(latestNodeBin)) {
          basePath.unshift(latestNodeBin)
        }
      }
    } catch {
      // Ignore NVM detection errors — non-fatal
    }
  }

  const env: Record<string, string> = {
    PATH: basePath.join(':'),
    HOME: workspacePath,
    TMPDIR: '/tmp',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  }

  // Preserve LANG if set (needed for locale-aware tools)
  if (process.env.LANG) {
    env.LANG = process.env.LANG
  }

  return env
}

// ── Command Wrapping ─────────────────────────────────────

/**
 * Wrap a command to:
 * 1. Disable extended globs (prevents glob-based attacks)
 * 2. cd to workspace (ensures CWD even through sandbox-exec)
 * 3. Redirect stdin from /dev/null (prevents interactive prompts / heredoc injection)
 * 4. Evaluate the command in a single-quoted context (safe quoting)
 */
export function wrapCommand(command: string, shell: 'bash' | 'zsh', workdir?: string): string {
  // Disable extended globs for the shell
  const disableGlobs =
    shell === 'bash'
      ? "shopt -u extglob 2>/dev/null;"
      : "setopt NO_EXTENDED_GLOB 2>/dev/null;"

  // Explicit cd to ensure CWD propagates through sandbox-exec
  const cdPrefix = workdir
    ? `cd '${workdir.replace(/'/g, "'\\''")}' &&`
    : ''

  // Escape single quotes in the command: ' -> '\''
  const escaped = command.replace(/'/g, "'\\''")

  // Wrap: disable globs + cd + eval '<escaped_command>' < /dev/null
  return `${disableGlobs} ${cdPrefix} eval '${escaped}' < /dev/null`
}
