import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface SandboxSession {
  id: string
  sandboxDir: string
  workspacePath?: string
  createdAt: Date
}

class SandboxService {
  private sessions = new Map<string, SandboxSession>()

  private get baseDir(): string {
    return path.join(app.getPath('home'), 'cruchot', 'sandbox')
  }

  createSession(workspacePath?: string): SandboxSession {
    const id = crypto.randomUUID()
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
    // Substitute SANDBOX_DIR and HOME in the SBPL profile
    const home = app.getPath('home')
    return SEATBELT_PROFILE
      .replace(/\$\{SANDBOX_DIR\}/g, sandboxDir)
      .replace(/\$\{HOME\}/g, home)
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

;; Deny everything else
(deny file-write* (subpath "/"))
(deny file-read* (subpath "\${HOME}") (require-not (subpath "\${SANDBOX_DIR}")))`

export const sandboxService = new SandboxService()
