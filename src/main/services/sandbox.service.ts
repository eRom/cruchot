import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface SandboxSession {
  id: string
  sandboxDir: string
  workspacePath?: string
  createdAt: Date
}

// Paths that must never be used as sandbox directory
const BLOCKED_SANDBOX_ROOTS = [
  '/', '/bin', '/sbin', '/usr', '/etc', '/var', '/tmp', '/dev', '/proc', '/sys',
  '/System', '/Library', '/Applications', '/private',
  '/opt', '/boot', '/root',
  'C:\\', 'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)',
]

// Characters forbidden in sandbox paths (prevent SBPL injection)
const UNSAFE_PATH_CHARS = /["\n\r\t\0(){};<>|&$`!]/

class SandboxService {
  private sessions = new Map<string, SandboxSession>()

  private get baseDir(): string {
    return path.join(app.getPath('home'), 'cruchot', 'sandbox')
  }

  validateWorkspacePath(workspacePath: string): void {
    // Check for unsafe characters (SBPL injection prevention)
    if (UNSAFE_PATH_CHARS.test(workspacePath)) {
      throw new Error('Workspace path contains unsafe characters')
    }

    // Must be absolute
    if (!path.isAbsolute(workspacePath)) {
      throw new Error('Workspace path must be absolute')
    }

    // Must have at least 2 path segments (prevent "/" or "C:\")
    const segments = workspacePath.split(path.sep).filter(Boolean)
    if (segments.length < 2) {
      throw new Error('Workspace path too shallow — must have at least 2 segments')
    }

    // Resolve symlinks
    let resolved: string
    try {
      resolved = fs.realpathSync(workspacePath)
    } catch {
      // Path doesn't exist yet — use the raw path for prefix check
      resolved = path.resolve(workspacePath)
    }

    // Check against blocked roots
    for (const blocked of BLOCKED_SANDBOX_ROOTS) {
      if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
        // Allow if the path has enough depth (e.g., /usr/local/share/project is OK, but /usr is not)
        const blockedDepth = blocked.split(path.sep).filter(Boolean).length
        const resolvedDepth = resolved.split(path.sep).filter(Boolean).length
        if (resolvedDepth <= blockedDepth + 1) {
          throw new Error(`Workspace path is inside blocked root: ${blocked}`)
        }
      }
    }
  }

  createSession(workspacePath?: string): SandboxSession {
    const id = crypto.randomUUID()

    // Validate workspace path if provided
    if (workspacePath) {
      this.validateWorkspacePath(workspacePath)
    }

    const sandboxDir = workspacePath || path.join(this.baseDir, id)

    // Create sandbox dir (recursive)
    fs.mkdirSync(sandboxDir, { recursive: true })

    const session: SandboxSession = { id, sandboxDir, workspacePath, createdAt: new Date() }
    this.sessions.set(id, session)
    return session
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    this.sessions.delete(sessionId)

    // Only trash auto-created sandbox dirs (not user workspace paths)
    if (!session.workspacePath && fs.existsSync(session.sandboxDir)) {
      try {
        const trash = (await import('trash')).default
        await trash(session.sandboxDir)
      } catch {
        console.warn('[Sandbox] Failed to trash sandbox dir:', session.sandboxDir)
      }
    }
  }

  getSandboxDir(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.sandboxDir ?? null
  }

  isActive(sessionId: string): boolean {
    return this.sessions.has(sessionId)
  }

  getSession(sessionId: string): SandboxSession | null {
    return this.sessions.get(sessionId) ?? null
  }

  generateSeatbeltProfile(sandboxDir: string): string {
    // Sanitize paths before SBPL injection — strip characters that could break SBPL expressions
    const safeSandboxDir = sandboxDir.replace(/["\n\r\t\0()]/g, '')
    const safeHome = app.getPath('home').replace(/["\n\r\t\0()]/g, '')
    return SEATBELT_PROFILE
      .replace(/\$\{SANDBOX_DIR\}/g, safeSandboxDir)
      .replace(/\$\{HOME\}/g, safeHome)
  }
}

const SEATBELT_PROFILE = `(version 1)
(deny default)

;; System read (minimal)
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/usr/local/lib"))
(allow file-read* (subpath "/usr/bin"))
(allow file-read* (subpath "/usr/local/bin"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/Library/Frameworks"))
(allow file-read* (subpath "/opt/homebrew"))

;; Node.js / Python / runtimes
(allow file-read* (subpath "\${HOME}/.nvm"))
(allow file-read* (subpath "\${HOME}/.pyenv"))
(allow file-read* (subpath "\${HOME}/.local"))

;; SSL certificates (needed for HTTPS)
(allow file-read* (subpath "/etc/ssl"))
(allow file-read* (subpath "/private/etc/ssl"))

;; Sandbox dir — read + write
(allow file-read* (subpath "\${SANDBOX_DIR}"))
(allow file-write* (subpath "\${SANDBOX_DIR}"))

;; Temp
(allow file-read* (subpath "/tmp"))
(allow file-write* (subpath "/tmp"))
(allow file-read* (subpath "/private/tmp"))
(allow file-write* (subpath "/private/tmp"))

;; Process
(allow process-exec*)
(allow process-fork)
(allow signal)

;; Network — full access (YOLO mode: user accepted risks)
(allow network*)

;; Note: (deny default) at the top already blocks everything not explicitly allowed.
;; No trailing deny rules needed — they are redundant and can cause rule-ordering issues.`

export const sandboxService = new SandboxService()
