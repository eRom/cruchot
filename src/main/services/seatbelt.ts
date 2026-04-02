import { spawn, type ExecOptions } from 'child_process'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import os from 'node:os'
import { app } from 'electron'
import { buildSafeEnv, wrapCommand } from '../llm/bash-security'

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec'

export const SEATBELT_DENIED_PATHS = [
  '.ssh', '.aws', '.gnupg', '.gpg', '.config/gcloud', '.azure',
  '.kube', '.docker', '.credentials', '.password-store',
  'Library/Keychains',
  '.config',
  'Library/Application Support',
  'Library/Preferences',
]

export const SEATBELT_DENIED_FILES = [
  '.netrc', '.npmrc', '.pypirc', '.env',
  '.bash_history', '.zsh_history',
  '.gitconfig',
]

export function isSeatbeltAvailable(): boolean {
  return process.platform === 'darwin' && existsSync(SANDBOX_EXEC_PATH)
}

function generateSeatbeltProfile(sandboxDir: string): string {
  const home = os.homedir()
  const userDataDir = app.getPath('userData')

  const denyPathRules = SEATBELT_DENIED_PATHS
    .map(p => `(deny file-read* (subpath "${home}/${p}"))`)
    .join('\n')

  const denyFileRules = SEATBELT_DENIED_FILES
    .map(f => `(deny file-read* (literal "${home}/${f}"))`)
    .join('\n')

  return `(version 1)
;; Allow-default approach: allow everything, then deny specific writes and reads.
;; (deny default) blocks anonymous pipe FDs (stdout/stderr) which cannot be
;; allowed via path-based rules. This inverted approach keeps stdio working.
(allow default)

;; Restrict file writes: only sandbox dir, tmp, dev, and specific home dirs
(deny file-write*
  (require-all
    (require-not (subpath "${sandboxDir}"))
    (require-not (subpath "/tmp"))
    (require-not (subpath "/private/tmp"))
    (require-not (subpath "/dev"))
    (require-not (subpath "${home}/.npm"))
    (require-not (subpath "${home}/.cache"))
    (require-not (subpath "${home}/.nvm"))
  )
)

;; Restrict network: only localhost and HTTPS outbound
(deny network*)
(allow network-outbound (remote tcp "localhost:*"))
(allow network-outbound (remote tcp "127.0.0.1:*"))
(allow network-outbound (remote tcp "*:443"))

;; Deny access to app userData (SQLite DB, credentials)
(deny file-read* (subpath "${userDataDir}"))

;; Deny sensitive paths and files in home
${denyPathRules}
${denyFileRules}
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

    const wrappedCmd = wrapCommand(command, 'bash', cwd)
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
    const wrappedCmd = wrapCommand(command, 'bash', cwd)
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
