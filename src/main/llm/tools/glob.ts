import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { minimatch } from 'minimatch'
import { validatePath, BLOCKED_PATH_SEGMENTS } from './shared'

const MAX_GLOB_RESULTS = 200

export function buildGlobTool(workspacePath: string) {
  return tool({
    description:
      'Find files matching a glob pattern in the workspace. Returns file paths sorted by modification time (newest first). Read-only.',
    inputSchema: z.object({
      pattern: z.string().describe('Glob pattern (e.g. "**/*.tsx", "src/**/*.test.ts")'),
      path: z.string().optional().describe('Subdirectory to search in (default: workspace root)')
    }),
    execute: async ({ pattern, path: subPath }) => {
      const pathCheck = validatePath(subPath ?? '', workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      const searchRoot = join(workspacePath, subPath ?? '')
      const results: Array<{ path: string; size: number; mtime: number }> = []

      function scanDir(dir: string) {
        if (results.length >= MAX_GLOB_RESULTS) return
        try {
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (results.length >= MAX_GLOB_RESULTS) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue

            const fullPath = join(dir, item.name)
            const relPath = relative(searchRoot, fullPath)

            if (item.isDirectory()) {
              scanDir(fullPath)
            } else if (item.isFile()) {
              if (minimatch(relPath, pattern, { dot: true })) {
                try {
                  const stat = statSync(fullPath)
                  results.push({ path: relPath, size: stat.size, mtime: stat.mtimeMs })
                } catch {
                  results.push({ path: relPath, size: 0, mtime: 0 })
                }
              }
            }
          }
        } catch { /* Skip unreadable */ }
      }

      scanDir(searchRoot)
      results.sort((a, b) => b.mtime - a.mtime)

      return {
        files: results.map(r => ({ path: r.path, size: r.size })),
        total: results.length,
        truncated: results.length >= MAX_GLOB_RESULTS
      }
    }
  })
}
