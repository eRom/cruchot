import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { isReadableFile, validatePath, MAX_FILE_SIZE, fileReadTimestamps } from './shared'

/**
 * Build the readFile tool for a given workspace path.
 * After a successful read, updates the TOCTOU cache with the file's mtime.
 */
export function buildReadFileTool(workspacePath: string) {
  return tool({
    description: `Lit le contenu d'un fichier texte dans le workspace. Retourne le contenu avec le langage detecte et la taille.

Usage :
- Le path doit etre relatif a la racine du workspace (ex: "src/index.ts").
- Fonctionne sur les fichiers textuels (code, config, docs, scripts). Ne lit PAS les binaires.
- Fichiers bloques : .env, cles privees (.pem, .key), node_modules/, .git/.
- Limite de taille : 5 MB max par fichier.
- Tu DOIS lire un fichier avec cet outil avant de le modifier avec FileEdit.
- Les fichiers de contexte (README, CLAUDE.md, etc.) sont deja dans <workspace-context>. NE PAS les relire.
- Prefere cet outil a bash cat/head/tail — c'est plus rapide et securise.`,
    inputSchema: z.object({
      path: z.string().describe('Relative file path from workspace root (e.g. "src/index.ts")')
    }),
    execute: async ({ path: filePath }) => {
      const check = isReadableFile(filePath)
      if (!check.allowed) {
        return { error: check.reason! }
      }

      const pathCheck = validatePath(filePath, workspacePath)
      if (!pathCheck.valid) {
        return { error: pathCheck.reason! }
      }

      try {
        const fullPath = join(workspacePath, filePath)
        const stat = statSync(fullPath)
        if (stat.size > MAX_FILE_SIZE) {
          return { error: `Fichier trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)` }
        }
        const content = readFileSync(fullPath, 'utf-8')
        const ext = extname(filePath).slice(1) || 'txt'

        // Update TOCTOU cache with current mtime
        fileReadTimestamps.set(fullPath, stat.mtimeMs)

        return { path: filePath, content, language: ext, size: stat.size }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot read file' }
      }
    }
  })
}
