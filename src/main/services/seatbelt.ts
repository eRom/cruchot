import { exec, type ExecOptions } from 'child_process'
import { promisify } from 'util'
import { existsSync, writeFileSync, unlinkSync, readdirSync } from 'fs'
import { join } from 'path'
import { sandboxService } from './sandbox.service'

const execAsync = promisify(exec)

const SANDBOX_EXEC_PATH = '/usr/bin/sandbox-exec'

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

  if (isSeatbeltAvailable()) {
    const profile = sandboxService.generateSeatbeltProfile(sandboxDir)
    // Write profile to temp file to avoid shell injection via inline -p
    const profilePath = join('/tmp', `cruchot-sb-${crypto.randomUUID()}.sb`)
    writeFileSync(profilePath, profile, 'utf-8')

    try {
      // sandbox-exec -f profile_file /bin/bash -c "command"
      const fullCommand = `${SANDBOX_EXEC_PATH} -f '${profilePath}' /bin/bash -c '${command.replace(/'/g, "'\\''")}'`
      const result = await execAsync(fullCommand, execOptions)
      return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 }
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number }
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: err.code ?? 1
      }
    } finally {
      try { unlinkSync(profilePath) } catch { /* cleanup best-effort */ }
    }
  } else {
    // Fallback: exec without Seatbelt (Windows, Linux, macOS without sandbox-exec)
    try {
      const result = await execAsync(command, execOptions)
      return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 }
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number }
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: err.code ?? 1
      }
    }
  }
}
