import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import { validatePath, BLOCKED_PATH_SEGMENTS, MAX_LIST_ENTRIES } from './shared'

/**
 * Build the listFiles tool for a given workspace path.
 */
export function buildListFilesTool(workspacePath: string) {
  return tool({
    description:
      'List files and directories in the workspace. Without argument, lists the root. With a path, lists that directory.',
    inputSchema: z.object({
      path: z.string().optional().describe('Relative directory path to list (optional, root by default)'),
      recursive: z.boolean().optional().describe('List recursively (default false)')
    }),
    execute: async ({ path: dirPath, recursive }) => {
      const pathCheck = validatePath(dirPath ?? '', workspacePath)
      if (!pathCheck.valid) {
        return { error: pathCheck.reason! }
      }

      try {
        const fullPath = join(workspacePath, dirPath ?? '')
        const entries: Array<{ path: string; type: string; size: number }> = []

        function scanDir(dir: string, prefix: string) {
          if (entries.length >= MAX_LIST_ENTRIES) return
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (entries.length >= MAX_LIST_ENTRIES) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue
            const rel = prefix ? `${prefix}/${item.name}` : item.name
            if (item.isDirectory()) {
              entries.push({ path: rel, type: 'directory', size: 0 })
              if (recursive) scanDir(join(dir, item.name), rel)
            } else {
              try {
                const stat = statSync(join(dir, item.name))
                entries.push({ path: rel, type: 'file', size: stat.size })
              } catch {
                entries.push({ path: rel, type: 'file', size: 0 })
              }
            }
          }
        }

        scanDir(fullPath, '')
        return { path: dirPath ?? '.', entries }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot list directory' }
      }
    }
  })
}
