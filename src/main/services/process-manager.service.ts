import type { ChildProcess } from 'child_process'

export interface ProcessInfo {
  pid: number
  command: string
  type: 'script' | 'server' | 'install'
  startedAt: Date
  port?: number
}

interface TrackedProcess {
  child: ChildProcess
  meta: ProcessInfo
}

const MAX_PROCESSES_PER_SESSION = 5
const KILL_GRACE_MS = 3000

class ProcessManagerService {
  private sessions = new Map<string, Set<TrackedProcess>>()

  track(sessionId: string, child: ChildProcess, meta: Omit<ProcessInfo, 'pid' | 'startedAt'>): ProcessInfo {
    if (!child.pid) throw new Error('Process has no PID')

    let set = this.sessions.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessions.set(sessionId, set)
    }

    if (set.size >= MAX_PROCESSES_PER_SESSION) {
      throw new Error(`Max ${MAX_PROCESSES_PER_SESSION} processes per session`)
    }

    const info: ProcessInfo = {
      pid: child.pid,
      command: meta.command,
      type: meta.type,
      startedAt: new Date(),
      port: meta.port
    }

    const tracked: TrackedProcess = { child, meta: info }
    set.add(tracked)

    // Auto-cleanup on exit
    child.on('exit', () => {
      set!.delete(tracked)
      if (set!.size === 0) this.sessions.delete(sessionId)
    })

    return info
  }

  async killOne(sessionId: string, pid: number): Promise<void> {
    const set = this.sessions.get(sessionId)
    if (!set) return

    for (const tracked of Array.from(set)) {
      if (tracked.meta.pid === pid) {
        await this.killProcess(tracked)
        set.delete(tracked)
        if (set.size === 0) this.sessions.delete(sessionId)
        return
      }
    }
  }

  async killAll(sessionId: string): Promise<void> {
    const set = this.sessions.get(sessionId)
    if (!set) return

    const kills = Array.from(set).map(t => this.killProcess(t))
    await Promise.allSettled(kills)
    this.sessions.delete(sessionId)
  }

  async killGlobal(): Promise<void> {
    const kills: Promise<void>[] = []
    for (const sessionId of Array.from(this.sessions.keys())) {
      kills.push(this.killAll(sessionId))
    }
    await Promise.allSettled(kills)
  }

  getProcesses(sessionId: string): ProcessInfo[] {
    const set = this.sessions.get(sessionId)
    if (!set) return []
    return Array.from(set).map(t => t.meta)
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  private killProcess(tracked: TrackedProcess): Promise<void> {
    return new Promise((resolve) => {
      const { child, meta } = tracked

      // Check if already dead
      if (child.exitCode !== null || child.killed) {
        resolve()
        return
      }

      // Try kill process group first (kills all children)
      try {
        process.kill(-meta.pid, 'SIGTERM')
      } catch {
        // Process group kill failed, try direct kill
        try {
          child.kill('SIGTERM')
        } catch {
          resolve()
          return
        }
      }

      // Grace period then SIGKILL
      const timer = setTimeout(() => {
        try {
          process.kill(-meta.pid, 'SIGKILL')
        } catch {
          try { child.kill('SIGKILL') } catch { /* already dead */ }
        }
        resolve()
      }, KILL_GRACE_MS)

      child.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

export const processManagerService = new ProcessManagerService()
