import { tool } from 'ai'
import { z } from 'zod'
import { execSandboxed } from '../../services/seatbelt'
import { truncateOutput, MAX_OUTPUT_LENGTH } from './shared'

/**
 * Build the bash tool for a given workspace path.
 * Security checks (blocklist, etc.) are NOT applied here —
 * they will be applied by the pipeline wrapper (Task 9).
 * OS-level confinement is provided by Seatbelt via execSandboxed.
 */
export function buildBashTool(workspacePath: string) {
  return tool({
    description:
      'Execute a shell command in the workspace directory. Use for: npm, git, grep, find, test runners, linters, build tools, and any CLI tool. The working directory is the workspace root. No restrictions — you have full shell access within this directory.',
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute')
    }),
    execute: async ({ command }) => {
      try {
        const result = await execSandboxed(command, workspacePath, {
          timeout: 30_000,
          maxBuffer: MAX_OUTPUT_LENGTH,
          cwd: workspacePath
        })
        return {
          stdout: truncateOutput(result.stdout),
          stderr: truncateOutput(result.stderr),
          exitCode: result.exitCode ?? 0
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Command execution failed'
        return { stdout: '', stderr: msg, exitCode: 1 }
      }
    }
  })
}
