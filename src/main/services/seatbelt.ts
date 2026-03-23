import { spawn, type ExecOptions } from 'child_process'
import { existsSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec'

export function isSeatbeltAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC_PATH)
}

function generateSeatbeltProfile(sandboxDir: string): string {
  const home = process.env.HOME || '/Users/unknown'
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

;; Allow read home (for configs, nvm, etc.)
(allow file-read* (subpath "${home}"))

;; Allow write to home .npm, .cache, .nvm
(allow file-write* (subpath "${home}/.npm"))
(allow file-write* (subpath "${home}/.cache"))
(allow file-write* (subpath "${home}/.nvm"))
`
}

export interface ExecSandboxedOptions {
  timeout?: number   // ms, 0 = no timeout (for servers)
  maxBuffer?: number // bytes, default 100KB
  cwd?: string
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
  opts: ExecSandboxedOptions = {}
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

  if (isSeatbeltAvailable()) {
    const profile = generateSeatbeltProfile(sandboxDir)
    // Write profile to temp file to avoid shell injection via inline -p
    const profilePath = join('/tmp', `cruchot-sb-${crypto.randomUUID()}.sb`)
    writeFileSync(profilePath, profile, 'utf-8')

    try {
      return await spawnAsync(
        SANDBOX_EXEC_PATH,
        ['-f', profilePath, '/bin/bash', '-c', command],
        execOptions
      )
    } finally {
      try { unlinkSync(profilePath) } catch { /* cleanup best-effort */ }
    }
  } else {
    // Fallback: exec without Seatbelt (Windows, Linux, macOS without sandbox-exec)
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
