import { tool } from 'ai'
import { z } from 'zod'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { minimatch } from 'minimatch'
import { validatePath, TEXT_EXTENSIONS, BLOCKED_PATH_SEGMENTS, KNOWN_EXTENSIONLESS } from './shared'

const MAX_MATCHED_FILES = 100
const MAX_TOTAL_LINES = 500

export function buildGrepTool(workspacePath: string) {
  return tool({
    description:
      'Search for a regex pattern in files within the workspace. Returns matching lines with file path and line number. Read-only, cannot modify files.',
    inputSchema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Subdirectory to search in (default: workspace root)'),
      glob: z.string().optional().describe('File pattern filter (e.g. "*.ts", "*.{ts,tsx}")'),
      include_context: z.number().optional().describe('Lines of context before/after match (default: 0)'),
      case_insensitive: z.boolean().optional().describe('Case insensitive search (default: false)')
    }),
    execute: async ({ pattern, path: subPath, glob: globPattern, include_context, case_insensitive }) => {
      const pathCheck = validatePath(subPath ?? '', workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      let regex: RegExp
      try {
        regex = new RegExp(pattern, case_insensitive ? 'gi' : 'g')
      } catch (e) {
        return { error: `Pattern regex invalide : ${e instanceof Error ? e.message : pattern}` }
      }

      const searchRoot = join(workspacePath, subPath ?? '')
      const matches: Array<{ file: string; line: number; content: string }> = []
      let matchedFiles = 0
      let totalLines = 0

      function searchDir(dir: string, prefix: string) {
        if (matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES) return
        try {
          const items = readdirSync(dir, { withFileTypes: true })
          for (const item of items) {
            if (matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES) break
            if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue

            const fullItemPath = join(dir, item.name)
            const relPath = prefix ? `${prefix}/${item.name}` : item.name

            if (item.isDirectory()) {
              searchDir(fullItemPath, relPath)
            } else if (item.isFile()) {
              const ext = extname(item.name).toLowerCase()
              if (ext && !TEXT_EXTENSIONS.has(ext)) continue
              if (!ext && !KNOWN_EXTENSIONLESS.some(n => item.name === n)) continue

              if (globPattern && !minimatch(item.name, globPattern, { dot: true })) continue

              try {
                const stat = statSync(fullItemPath)
                if (stat.size > 1_000_000) continue
              } catch { continue }

              try {
                const content = readFileSync(fullItemPath, 'utf-8')
                const lines = content.split('\n')
                let fileHasMatch = false
                const ctx = include_context ?? 0

                for (let i = 0; i < lines.length; i++) {
                  if (totalLines >= MAX_TOTAL_LINES) break
                  regex.lastIndex = 0
                  if (regex.test(lines[i])) {
                    if (!fileHasMatch) { fileHasMatch = true; matchedFiles++ }
                    const start = Math.max(0, i - ctx)
                    const end = Math.min(lines.length - 1, i + ctx)
                    for (let j = start; j <= end; j++) {
                      if (totalLines >= MAX_TOTAL_LINES) break
                      matches.push({ file: relPath, line: j + 1, content: lines[j] })
                      totalLines++
                    }
                  }
                }
              } catch { /* Skip unreadable files */ }
            }
          }
        } catch { /* Skip unreadable directories */ }
      }

      searchDir(searchRoot, '')
      return {
        matches,
        totalMatches: matches.length,
        matchedFiles,
        truncated: matchedFiles >= MAX_MATCHED_FILES || totalLines >= MAX_TOTAL_LINES
      }
    }
  })
}
