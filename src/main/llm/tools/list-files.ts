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
    description: `Liste les fichiers et dossiers dans le workspace. Sans argument, liste la racine.

Usage :
- Le path est optionnel et relatif a la racine du workspace.
- Utilise recursive: true pour lister tout l'arbre (limite a 500 entrees).
- Les dossiers bloques (node_modules, .git, dist, build, etc.) sont ignores automatiquement.
- Pour trouver des fichiers par pattern, prefere GlobTool (ex: "**/*.tsx").
- Utile pour verifier qu'un dossier existe avant d'y creer un fichier.`,
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
