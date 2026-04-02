import { minimatch } from 'minimatch'

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Read-only commands (auto-allowed, no rule needed) ─────────────────────────
// These commands are safe to run without user approval because they only READ
// data. The seatbelt sandbox provides the actual write confinement.
// Checked AFTER deny rules (so `rm -rf` deny still wins).
const READONLY_COMMANDS: Set<string> = new Set([
  // File viewing
  'cat', 'head', 'tail', 'less', 'more', 'bat',
  // File info
  'ls', 'file', 'stat', 'du', 'df', 'wc', 'md5', 'shasum', 'cksum',
  // Search
  'find', 'grep', 'rg', 'ag', 'fd', 'locate',
  // Text processing (strictly read-only — no tee/xargs/sed/awk which can write or execute)
  'sort', 'uniq', 'diff', 'cut', 'tr',
  'jq', 'yq', 'column', 'paste', 'fold', 'fmt', 'rev', 'nl',
  // Path / info
  'pwd', 'realpath', 'readlink', 'basename', 'dirname',
  'which', 'type', 'command', 'whereis',
  // System info
  'uname', 'whoami', 'id', 'env', 'printenv', 'date', 'uptime', 'sw_vers',
  'hostname', 'arch', 'nproc', 'getconf',
  // Hashing
  'md5sum', 'sha256sum', 'sha1sum', 'b2sum',
  // Misc safe
  'echo', 'printf', 'true', 'false', 'test', 'expr', 'seq', 'yes',
  'sleep', 'wait', 'time',
])

/**
 * Splits a shell command on unquoted operators (&&, ||, ;, |).
 * Respects single and double quotes — operators inside quotes are ignored.
 */
function splitOnUnquotedOperators(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false
  let i = 0

  while (i < command.length) {
    const ch = command[i]

    // Track quote state
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle
      current += ch
      i++
      continue
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble
      current += ch
      i++
      continue
    }

    // Only split on operators when outside quotes
    if (!inSingle && !inDouble) {
      if ((ch === '&' && command[i + 1] === '&') || (ch === '|' && command[i + 1] === '|')) {
        parts.push(current.trim())
        current = ''
        i += 2
        continue
      }
      if (ch === ';' || ch === '|') {
        parts.push(current.trim())
        current = ''
        i++
        continue
      }
    }

    current += ch
    i++
  }

  if (current.trim()) parts.push(current.trim())
  return parts.filter(Boolean)
}

/**
 * Returns true if the command only uses known read-only commands.
 * For compound commands (&&, ||, ;, |), checks EACH subcommand.
 * Respects quoted strings — operators inside quotes don't split.
 */
export function isReadOnlyCommand(command: string): boolean {
  const subcommands = splitOnUnquotedOperators(command)
  if (subcommands.length === 0) return false

  for (const sub of subcommands) {
    // Strip leading env vars (FOO=bar cmd → cmd)
    const stripped = sub.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*/, '')
    // Extract first token (the command name)
    const firstToken = stripped.trim().split(/\s+/)[0] ?? ''
    // Strip path prefix (/usr/bin/ls → ls)
    const basename = firstToken.split('/').pop() ?? firstToken

    if (!READONLY_COMMANDS.has(basename)) {
      return false
    }
  }
  return true
}

// ── Tool defaults (when no rule matches) ─────────────────────────────────────

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

// ── Session approvals (in-memory, reset on restart) ───────────────────────────

const sessionApprovals: Set<string> = new Set()

/**
 * Builds a cache key for a given tool call.
 * Examples: `bash::npm test`, `WebFetchTool::https://...`, `writeFile::/src/foo.ts`
 */
function buildSessionKey(toolName: string, toolArgs: Record<string, unknown>): string {
  let value = ''

  if (toolName === 'bash') {
    value = (toolArgs.command as string | undefined) ?? ''
  } else if (
    toolName === 'writeFile' ||
    toolName === 'FileEdit' ||
    toolName === 'readFile' ||
    toolName === 'listFiles' ||
    toolName === 'GrepTool' ||
    toolName === 'GlobTool'
  ) {
    value =
      (toolArgs.file_path as string | undefined) ??
      (toolArgs.path as string | undefined) ??
      (toolArgs.pattern as string | undefined) ??
      ''
  } else if (toolName === 'WebFetchTool') {
    value = (toolArgs.url as string | undefined) ?? ''
  }

  return `${toolName}::${value}`
}

export function addSessionApproval(key: string): void {
  sessionApprovals.add(key)
}

export function hasSessionApproval(
  toolName: string,
  toolArgs: Record<string, unknown>
): boolean {
  const key = buildSessionKey(toolName, toolArgs)
  return sessionApprovals.has(key)
}

export function clearSessionApprovals(): void {
  sessionApprovals.clear()
}

// ── Rule matching ─────────────────────────────────────────────────────────────

const FILE_TOOLS = new Set(['writeFile', 'FileEdit', 'readFile', 'listFiles', 'GrepTool', 'GlobTool'])

/**
 * Returns true if the given rule matches the provided context.
 */
function matchesRule(rule: PermissionRule, context: PermissionContext): boolean {
  // Tool-global rule — no content restriction, matches everything for this tool
  if (rule.ruleContent == null) {
    return true
  }

  const content = rule.ruleContent

  if (context.toolName === 'bash') {
    const command = (context.toolArgs.command as string | undefined) ?? ''

    if (content.endsWith(' *')) {
      // Prefix match: "npm *" matches "npm install", "npm test"
      const prefix = content.slice(0, -2) // strip trailing " *"
      return command === prefix || command.startsWith(prefix + ' ')
    }

    // Exact prefix match
    return command === content || command.startsWith(content + ' ')
  }

  if (FILE_TOOLS.has(context.toolName)) {
    const filePath =
      (context.toolArgs.file_path as string | undefined) ??
      (context.toolArgs.path as string | undefined) ??
      (context.toolArgs.pattern as string | undefined) ??
      ''

    return minimatch(filePath, content, { dot: true, matchBase: false })
  }

  if (context.toolName === 'WebFetchTool') {
    const urlStr = (context.toolArgs.url as string | undefined) ?? ''
    let hostname = ''
    try {
      hostname = new URL(urlStr).hostname
    } catch {
      // Malformed URL — no match
      return false
    }

    // Wildcard domain: "*.github.com" should match "api.github.com" and "github.com"
    if (content.startsWith('*.')) {
      const domain = content.slice(2) // strip "*."
      return hostname === domain || hostname.endsWith('.' + domain)
    }

    // Exact hostname match
    return hostname === content
  }

  // Unknown tool with ruleContent — no match
  return false
}

// ── Main evaluation function ──────────────────────────────────────────────────

export function getToolDefault(toolName: string): PermissionDecision {
  return TOOL_DEFAULTS[toolName] ?? 'ask'
}

/**
 * Evaluates the permission for a tool call given the active rules.
 *
 * Priority:
 * 1. Session approval cache → 'allow'
 * 2. Deny rules (first match) → 'deny'
 * 3. Allow rules (first match) → 'allow'
 * 4. Ask rules (first match) → 'ask'
 * 5. Tool default fallback
 */
export function evaluatePermission(
  context: PermissionContext,
  rules: PermissionRule[]
): PermissionDecision {
  // 1. Session approvals
  if (hasSessionApproval(context.toolName, context.toolArgs)) {
    return 'allow'
  }

  // 2. Filter applicable rules (exact tool name or wildcard '*')
  const applicable = rules.filter(
    (r) => r.toolName === context.toolName || r.toolName === '*'
  )

  // 3. Deny rules first
  for (const rule of applicable) {
    if (rule.behavior === 'deny' && matchesRule(rule, context)) {
      return 'deny'
    }
  }

  // 4. Built-in read-only commands (auto-allow without needing a rule)
  if (context.toolName === 'bash') {
    const command = (context.toolArgs.command as string | undefined) ?? ''
    if (isReadOnlyCommand(command)) {
      return 'allow'
    }
  }

  // 5. Allow rules
  for (const rule of applicable) {
    if (rule.behavior === 'allow' && matchesRule(rule, context)) {
      return 'allow'
    }
  }

  // 5. Ask rules
  for (const rule of applicable) {
    if (rule.behavior === 'ask' && matchesRule(rule, context)) {
      return 'ask'
    }
  }

  // 6. Tool default fallback
  return getToolDefault(context.toolName)
}
