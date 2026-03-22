import { tool } from 'ai'
import { z } from 'zod'
import { shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { execSandboxed } from '../services/seatbelt'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_OUTPUT_SIZE = 100 * 1024 // 100 KB

// Extensions that must NOT be opened via shell.openExternal (could execute code)
const DANGEROUS_PREVIEW_EXTENSIONS = new Set([
  '.app', '.exe', '.msi', '.bat', '.cmd', '.com', '.ps1', '.vbs', '.vbe',
  '.wsf', '.wsh', '.scr', '.pif', '.jar', '.command', '.sh', '.bash',
  '.csh', '.ksh', '.zsh', '.action', '.workflow', '.pkg', '.dmg',
  '.scpt', '.applescript', '.dylib', '.so', '.dll'
])

function validatePath(filePath: string, sandboxDir: string): string {
  const resolved = path.resolve(sandboxDir, filePath)
  // Resolve symlinks
  let real: string
  try {
    real = fs.realpathSync(resolved)
  } catch {
    // File doesn't exist yet — check the parent dir
    const parent = path.dirname(resolved)
    try {
      const realParent = fs.realpathSync(parent)
      if (!realParent.startsWith(sandboxDir + path.sep) && realParent !== sandboxDir) {
        throw new Error(`Path escapes sandbox: ${filePath}`)
      }
    } catch {
      // Parent doesn't exist either — will be created, check the resolved path
      if (!resolved.startsWith(sandboxDir + path.sep) && resolved !== sandboxDir) {
        throw new Error(`Path escapes sandbox: ${filePath}`)
      }
    }
    return resolved
  }

  if (!real.startsWith(sandboxDir + path.sep) && real !== sandboxDir) {
    throw new Error(`Path escapes sandbox: ${filePath}`)
  }
  return real
}

export function buildYoloTools(sessionId: string, sandboxDir: string) {
  return {
    bash: tool({
      description:
        'Execute a shell command in the sandbox environment. Use this for running scripts, installing packages, starting servers, or any shell operation.',
      inputSchema: z.object({
        command: z.string().min(1).max(10_000).describe('The shell command to execute'),
        type: z
          .enum(['script', 'server', 'install'])
          .default('script')
          .describe('Type: script (one-shot), server (long-running), install (package install)'),
        timeout: z
          .number()
          .min(0)
          .max(600_000)
          .default(60_000)
          .describe('Timeout in ms (0 for servers)')
      }),
      execute: async ({ command, type, timeout }) => {
        try {
          const result = await execSandboxed(command, sandboxDir, {
            timeout: type === 'server' ? 0 : timeout,
            sessionId
          })

          // Truncate output
          const stdout =
            result.stdout.length > MAX_OUTPUT_SIZE
              ? result.stdout.slice(0, MAX_OUTPUT_SIZE) + '\n... (truncated)'
              : result.stdout
          const stderr =
            result.stderr.length > MAX_OUTPUT_SIZE
              ? result.stderr.slice(0, MAX_OUTPUT_SIZE) + '\n... (truncated)'
              : result.stderr

          return {
            exitCode: result.exitCode,
            stdout,
            stderr
          }
        } catch (error) {
          return { error: String(error) }
        }
      }
    }),

    createFile: tool({
      description:
        'Create or overwrite a file in the sandbox directory. Creates parent directories automatically.',
      inputSchema: z.object({
        path: z.string().min(1).max(500).describe('Relative path within the sandbox'),
        content: z.string().max(MAX_FILE_SIZE).describe('File content')
      }),
      execute: async ({ path: filePath, content }) => {
        try {
          const absPath = validatePath(filePath, sandboxDir)
          fs.mkdirSync(path.dirname(absPath), { recursive: true })
          fs.writeFileSync(absPath, content, 'utf-8')
          return { success: true, path: absPath, size: Buffer.byteLength(content) }
        } catch (error) {
          return { error: String(error) }
        }
      }
    }),

    readFile: tool({
      description: 'Read the content of a file in the sandbox directory.',
      inputSchema: z.object({
        path: z.string().min(1).max(500).describe('Relative path within the sandbox')
      }),
      execute: async ({ path: filePath }) => {
        try {
          const absPath = validatePath(filePath, sandboxDir)
          const stat = fs.statSync(absPath)
          if (stat.size > 5 * 1024 * 1024) {
            return { error: 'File too large (max 5MB)' }
          }
          const content = fs.readFileSync(absPath, 'utf-8')
          return { content, size: stat.size }
        } catch (error) {
          return { error: String(error) }
        }
      }
    }),

    listFiles: tool({
      description: 'List files and directories in the sandbox. Returns names, types and sizes.',
      inputSchema: z.object({
        path: z
          .string()
          .max(500)
          .default('.')
          .describe('Relative directory path within the sandbox'),
        recursive: z.boolean().default(false).describe('List recursively')
      }),
      execute: async ({ path: dirPath, recursive }) => {
        try {
          const absPath = validatePath(dirPath, sandboxDir)

          if (recursive) {
            const entries: Array<{ path: string; type: string; size: number }> = []
            const walk = (dir: string, prefix: string) => {
              const items = fs.readdirSync(dir, { withFileTypes: true })
              for (const item of items) {
                const rel = prefix ? `${prefix}/${item.name}` : item.name
                if (item.isDirectory()) {
                  entries.push({ path: rel, type: 'directory', size: 0 })
                  if (entries.length < 500) walk(path.join(dir, item.name), rel)
                } else {
                  const stat = fs.statSync(path.join(dir, item.name))
                  entries.push({ path: rel, type: 'file', size: stat.size })
                }
                if (entries.length >= 500) return
              }
            }
            walk(absPath, '')
            return { entries, total: entries.length }
          }

          const items = fs.readdirSync(absPath, { withFileTypes: true })
          const entries = items.map((item) => ({
            name: item.name,
            type: item.isDirectory() ? 'directory' : 'file',
            size: item.isFile() ? fs.statSync(path.join(absPath, item.name)).size : 0
          }))
          return { entries, total: entries.length }
        } catch (error) {
          return { error: String(error) }
        }
      }
    }),

    openPreview: tool({
      description:
        'Open a file or URL in the default browser/app. Use for previewing HTML files, opening localhost URLs, etc.',
      inputSchema: z.object({
        target: z
          .string()
          .min(1)
          .max(1000)
          .describe('File path (relative to sandbox) or URL (http://localhost:PORT)')
      }),
      execute: async ({ target }) => {
        try {
          let url: string
          if (target.startsWith('http://') || target.startsWith('https://')) {
            // Validate URL is localhost only
            const parsed = new URL(target)
            if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
              return { error: 'Only localhost URLs allowed' }
            }
            url = target
          } else {
            // File path — validate it's in sandbox
            const absPath = validatePath(target, sandboxDir)
            // Block dangerous executable extensions
            const ext = path.extname(absPath).toLowerCase()
            if (DANGEROUS_PREVIEW_EXTENSIONS.has(ext)) {
              return { error: `Cannot preview executable file type: ${ext}` }
            }
            url = `file://${absPath}`
          }

          await shell.openExternal(url)
          return { success: true, opened: url }
        } catch (error) {
          return { error: String(error) }
        }
      }
    })
  }
}
