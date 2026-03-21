import { exec, type ExecOptions, type ExecException } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
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

  // Add NVM/pyenv paths if they exist
  const homePath = process.env.HOME
  if (homePath) {
    const nvmDir = `${homePath}/.nvm`
    if (existsSync(nvmDir)) {
      env.NVM_DIR = nvmDir
      env.PATH = `${nvmDir}/versions/node/$(ls ${nvmDir}/versions/node/ 2>/dev/null | tail -1)/bin:${env.PATH}`
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
    // sandbox-exec -p "profile" /bin/bash -c "command"
    const fullCommand = `${SANDBOX_EXEC_PATH} -p '${profile.replace(/'/g, "'\\''")}' /bin/bash -c '${command.replace(/'/g, "'\\''")}'`

    try {
      const result = await execAsync(fullCommand, execOptions)
      return { stdout: String(result.stdout), stderr: String(result.stderr), exitCode: 0 }
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; code?: number }
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        exitCode: err.code ?? 1
      }
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
