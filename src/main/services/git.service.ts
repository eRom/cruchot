import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

// ── Types ─────────────────────────────────────────────────
export type GitFileStatusCode = 'M' | 'A' | 'D' | 'R' | '?' | 'C' | 'U' | ' '

export interface GitFileStatus {
  path: string
  staging: GitFileStatusCode
  working: GitFileStatusCode
}

export interface GitInfo {
  isRepo: boolean
  branch: string | null
  isDirty: boolean
  modifiedCount: number
}

// ── Minimal env (same pattern as workspace-tools bash) ────
const GIT_BASE_ENV: Readonly<Record<string, string>> = {
  PATH: '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
  GIT_TERMINAL_PROMPT: '0',
  NO_COLOR: '1',
  LANG: 'en_US.UTF-8'
}

// ── Cache ─────────────────────────────────────────────────
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_TTL_MS = 2000

export class GitService {
  private rootPath: string
  private statusCache: CacheEntry<GitFileStatus[]> | null = null
  private infoCache: CacheEntry<GitInfo> | null = null

  constructor(rootPath: string) {
    this.rootPath = rootPath
  }

  /** Build env per-call to avoid shared mutable state between instances.
   *  HOME set to a neutral path (not rootPath) to prevent malicious .gitconfig in workspace. */
  private getEnv(): Record<string, string> {
    return {
      ...GIT_BASE_ENV,
      HOME: process.env.HOME ?? '/tmp',
      GIT_CONFIG_NOSYSTEM: '1' // Ignore system-wide gitconfig
    }
  }

  // ── Detection ───────────────────────────────────────────
  isGitRepo(): boolean {
    return existsSync(join(this.rootPath, '.git'))
  }

  // ── Tier 1 ──────────────────────────────────────────────
  async getBranch(): Promise<string | null> {
    try {
      const output = await this.exec(['rev-parse', '--abbrev-ref', 'HEAD'], 10_000)
      return output.trim() || null
    } catch {
      return null
    }
  }

  async isDirty(): Promise<boolean> {
    try {
      const output = await this.exec(['status', '--porcelain'], 10_000)
      return output.trim().length > 0
    } catch {
      return false
    }
  }

  async getModifiedCount(): Promise<number> {
    try {
      const output = await this.exec(['status', '--porcelain'], 10_000)
      if (!output.trim()) return 0
      return output.trim().split('\n').length
    } catch {
      return 0
    }
  }

  async getInfo(): Promise<GitInfo> {
    if (!this.isGitRepo()) {
      return { isRepo: false, branch: null, isDirty: false, modifiedCount: 0 }
    }

    // Check cache
    if (this.infoCache && (Date.now() - this.infoCache.timestamp) < CACHE_TTL_MS) {
      return this.infoCache.data
    }

    const [branch, status] = await Promise.all([
      this.getBranch(),
      this.exec(['status', '--porcelain'], 10_000).catch(() => '')
    ])

    const lines = status.trim() ? status.trim().split('\n') : []
    const info: GitInfo = {
      isRepo: true,
      branch,
      isDirty: lines.length > 0,
      modifiedCount: lines.length
    }

    this.infoCache = { data: info, timestamp: Date.now() }
    return info
  }

  // ── Tier 2 ──────────────────────────────────────────────
  async getStatus(): Promise<GitFileStatus[]> {
    if (!this.isGitRepo()) return []

    // Check cache
    if (this.statusCache && (Date.now() - this.statusCache.timestamp) < CACHE_TTL_MS) {
      return this.statusCache.data
    }

    try {
      const output = await this.exec(['status', '--porcelain=v1'], 10_000)
      const results = this.parseStatus(output)
      this.statusCache = { data: results, timestamp: Date.now() }
      return results
    } catch {
      return []
    }
  }

  async getDiff(filePath?: string, staged?: boolean): Promise<string> {
    if (!this.isGitRepo()) return ''

    try {
      const args = ['diff']
      if (staged) args.push('--cached')
      if (filePath) {
        args.push('--')
        args.push(filePath)
      }
      return await this.exec(args, 30_000)
    } catch {
      return ''
    }
  }

  // ── Stage / Unstage / Commit ────────────────────────────
  async stageAll(): Promise<void> {
    await this.exec(['add', '-A'], 10_000)
    this.invalidateCache()
  }

  async stageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.exec(['add', '--', ...paths], 10_000)
    this.invalidateCache()
  }

  async unstageFiles(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    await this.exec(['reset', 'HEAD', '--', ...paths], 10_000)
    this.invalidateCache()
  }

  async commit(message: string): Promise<string> {
    const output = await this.exec(['commit', '-m', message], 30_000)
    this.invalidateCache()
    // Extract hash from output like "[main abc1234] message"
    const match = output.match(/\[[\w/.-]+ ([a-f0-9]+)\]/)
    return match?.[1] ?? 'unknown'
  }

  // ── Internal ────────────────────────────────────────────
  invalidateCache(): void {
    this.statusCache = null
    this.infoCache = null
  }

  private parseStatus(output: string): GitFileStatus[] {
    if (!output.trim()) return []

    return output.trim().split('\n').map((line) => {
      const staging = (line[0] || ' ') as GitFileStatusCode
      const working = (line[1] || ' ') as GitFileStatusCode
      // Handle renamed files: "R  old -> new"
      let filePath = line.slice(3)
      if (staging === 'R' || working === 'R') {
        const arrowIdx = filePath.indexOf(' -> ')
        if (arrowIdx !== -1) {
          filePath = filePath.slice(arrowIdx + 4)
        }
      }
      return { path: filePath, staging, working }
    })
  }

  private exec(args: string[], timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, {
        cwd: this.rootPath,
        env: this.getEnv(),
        timeout,
        maxBuffer: 1024 * 1024 // 1MB
      }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message))
        } else {
          resolve(stdout)
        }
      })
    })
  }
}
