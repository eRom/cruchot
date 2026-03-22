import { exec, spawn, type ExecOptions } from 'child_process'
import { promisify } from 'util'
import { existsSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { sandboxService } from './sandbox.service'

const execAsync = promisify(exec)

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec'

// Minimal blocklist for YOLO bash — blocks host-escape and injection patterns
// Less restrictive than workspace-tools (YOLO is opt-in), but blocks critical vectors
const YOLO_BLOCKED_PATTERNS: RegExp[] = [
  /[\r\n]/,                        // Newline injection (multi-command via newline)
  /`[^`]*`/,                       // Backtick command substitution
  /\$\([^)]*\)/,                   // $() command substitution
  /<<[\s]*[A-Za-z_]/,              // Heredoc injection
  /;\s*alias\s/,                   // Alias injection
  /;\s*source\s/,                  // Source injection
  /\bsudo\b/,                      // Privilege escalation
  /\bsu\s+-?\s/,                   // su escalation
  /\bchmod\s+[0-7]*[sS]/,         // setuid/setgid
  /\b(pkill|killall)\s.*cruchot/i, // Kill the app itself
  />\s*\/dev\/sd[a-z]/,            // Write to block devices
  /\|\s*dd\b/,                     // Pipe to dd (disk write)
]

export function isYoloCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  for (const pattern of YOLO_BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Blocked pattern: ${pattern.source}` }
    }
  }
  return { allowed: true }
}

export function isSeatbeltAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC_PATH)
}

export interface ExecSandboxedOptions {
  timeout?: number   // ms, 0 = no timeout (for servers)
  maxBuffer?: number // bytes, default 100KB
  cwd?: string
  sessionId: string
}

export interface ExecSandboxedResult {
  stdout: string
  stderr: string
  exitCode: number | null
  child?: import('child_process').ChildProcess
}

export async function execSandboxed(
  command: string,
  sandboxDir: string,
  opts: ExecSandboxedOptions
): Promise<ExecSandboxedResult> {
  const timeout = opts.timeout ?? 30_000
  const maxBuffer = opts.maxBuffer ?? 100 * 1024 // 100KB
  const cwd = opts.cwd ?? sandboxDir

  // Minimal env
  const env: Record<string, string> = {
    PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
    HOME: sandboxDir,
    TMPDIR: '/tmp',
    LANG: 'en_US.UTF-8',
    FORCE_COLOR: '0',
    NO_COLOR: '1'
  }

  // Add NVM node path if available (resolve in Node.js, not shell)
  const homePath = process.env.HOME
  if (homePath) {
    const nvmDir = `${homePath}/.nvm`
    const nvmVersionsDir = join(nvmDir, 'versions', 'node')
    if (existsSync(nvmVersionsDir)) {
      try {
        const versions = readdirSync(nvmVersionsDir).sort()
        const latest = versions[versions.length - 1]
        if (latest) {
          env.NVM_DIR = nvmDir
          env.PATH = `${join(nvmVersionsDir, latest, 'bin')}:${env.PATH}`
        }
      } catch {
        // NVM dir not readable — skip
      }
    }
  }

  const execOptions: ExecOptions = {
    cwd,
    env,
    timeout: timeout || undefined,
    maxBuffer,
    killSignal: 'SIGTERM',
    encoding: 'utf-8'
  }

  // Validate command against blocklist (applies to all platforms)
  const check = isYoloCommandAllowed(command)
  if (!check.allowed) {
    return { stdout: '', stderr: `Command blocked: ${check.reason}`, exitCode: 1 }
  }

  if (isSeatbeltAvailable()) {
    const profile = sandboxService.generateSeatbeltProfile(sandboxDir)
    // Write profile to temp file to avoid shell injection via inline -p
    const profilePath = join('/tmp', `cruchot-sb-${crypto.randomUUID()}.sb`)
    writeFileSync(profilePath, profile, 'utf-8')

    try {
      // Use spawn with argument array to avoid shell injection via command string
      const result = await spawnAsync(
        SANDBOX_EXEC_PATH,
        ['-f', profilePath, '/bin/bash', '-c', command],
        execOptions
      )
      return result
    } finally {
      try { unlinkSync(profilePath) } catch { /* cleanup best-effort */ }
    }
  } else {
    // Fallback: exec without Seatbelt (Windows, Linux, macOS without sandbox-exec)
    // Uses spawn to avoid shell injection — command is passed as argument to bash -c
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
    const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]
    return spawnAsync(shell, args, execOptions)
  }
}

// Helper: spawn a child process and collect stdout/stderr as a promise
function spawnAsync(
  cmd: string,
  args: string[],
  opts: ExecOptions
): Promise<ExecSandboxedResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd as string,
      env: opts.env as Record<string, string>,
      timeout: (opts.timeout as number) || undefined,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    const maxBuffer = (opts.maxBuffer as number) || 100 * 1024
    let stdout = ''
    let stderr = ''
    let stdoutOverflow = false
    let stderrOverflow = false

    child.stdout?.on('data', (chunk: Buffer) => {
      if (!stdoutOverflow) {
        stdout += chunk.toString()
        if (stdout.length > maxBuffer) {
          stdoutOverflow = true
          stdout = stdout.slice(0, maxBuffer)
        }
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (!stderrOverflow) {
        stderr += chunk.toString()
        if (stderr.length > maxBuffer) {
          stderrOverflow = true
          stderr = stderr.slice(0, maxBuffer)
        }
      }
    })

    child.on('error', (err) => {
      resolve({ stdout, stderr: stderr || err.message, exitCode: 1, child })
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code, child })
    })
  })
}
