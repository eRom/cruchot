import { spawn, type ExecOptions } from 'child_process'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { buildSafeEnv, wrapCommand } from '../llm/bash-security'

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec'

export const SEATBELT_DENIED_PATHS = [
  '.ssh', '.aws', '.gnupg', '.gpg', '.config/gcloud', '.azure',
  '.kube', '.docker', '.credentials', '.password-store',
  'Library/Keychains'
]

export const SEATBELT_DENIED_FILES = [
  '.netrc', '.npmrc', '.pypirc', '.env',
  '.bash_history', '.zsh_history'
]

export function isSeatbeltAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC_PATH)
}

function generateSeatbeltProfile(sandboxDir: string): string {
  const home = process.env.HOME || '/Users/unknown'

  const denyPathRules = SEATBELT_DENIED_PATHS
    .map(p => `(deny file-read* (subpath "${home}/${p}"))`)
    .join('\n')

  const denyFileRules = SEATBELT_DENIED_FILES
    .map(f => `(deny file-read* (literal "${home}/${f}"))`)
    .join('\n')

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

;; Deny sensitive paths and files in home (must come before the broad allow below)
${denyPathRules}
${denyFileRules}

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

  const env = buildSafeEnv(sandboxDir)

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

    const wrappedCmd = wrapCommand(command, 'bash')
    try {
      return await spawnAsync(
        SANDBOX_EXEC_PATH,
        ['-f', profilePath, '/bin/bash', '-c', wrappedCmd],
        execOptions
      )
    } finally {
      try { unlinkSync(profilePath) } catch { /* cleanup best-effort */ }
    }
  } else {
    // Fallback: exec without Seatbelt (Windows, Linux, macOS without sandbox-exec)
    if (process.platform === 'win32') {
      return spawnAsync('cmd.exe', ['/c', command], execOptions)
    }
    const wrappedCmd = wrapCommand(command, 'bash')
    return spawnAsync('/bin/bash', ['-c', wrappedCmd], execOptions)
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
