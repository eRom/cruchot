import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { validatePath, fileReadTimestamps } from './shared'

export function buildFileEditTool(workspacePath: string) {
  return tool({
    description:
      'Edit an existing file by replacing a specific string. The old_string must be unique in the file (unless replace_all is true). You MUST read the file first with readFile before editing it.',
    inputSchema: z.object({
      file_path: z.string().describe('Relative file path to edit'),
      old_string: z.string().describe('The exact string to find and replace'),
      new_string: z.string().describe('The replacement string'),
      replace_all: z.boolean().optional().default(false).describe('Replace all occurrences (default: false, requires unique match)')
    }),
    execute: async ({ file_path, old_string, new_string, replace_all }) => {
      if (old_string === new_string) {
        return { error: 'old_string et new_string sont identiques' }
      }

      const pathCheck = validatePath(file_path, workspacePath)
      if (!pathCheck.valid) return { error: pathCheck.reason! }

      const fullPath = join(workspacePath, file_path)

      try {
        const stat = statSync(fullPath)

        // TOCTOU check: was the file read before editing?
        const lastReadMtime = fileReadTimestamps.get(fullPath)
        if (lastReadMtime !== undefined && Math.abs(stat.mtimeMs - lastReadMtime) > 100) {
          return { error: 'Le fichier a ete modifie depuis la derniere lecture. Relisez-le avec readFile avant de le modifier.' }
        }
        if (lastReadMtime === undefined) {
          return { error: 'Vous devez lire le fichier avec readFile() avant de le modifier avec FileEdit().' }
        }

        const content = readFileSync(fullPath, 'utf-8')

        if (!content.includes(old_string)) {
          return { error: "La chaine a remplacer n'a pas ete trouvee dans le fichier" }
        }

        // Check uniqueness (unless replace_all)
        if (!replace_all) {
          const count = content.split(old_string).length - 1
          if (count > 1) {
            return { error: `La chaine apparait ${count} fois dans le fichier. Utilisez replace_all: true ou fournissez une chaine plus specifique.` }
          }
        }

        const newContent = replace_all
          ? content.split(old_string).join(new_string)
          : content.replace(old_string, new_string)

        writeFileSync(fullPath, newContent, 'utf-8')

        // Update TOCTOU cache
        const newStat = statSync(fullPath)
        fileReadTimestamps.set(fullPath, newStat.mtimeMs)

        return { success: true, path: file_path }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot edit file' }
      }
    }
  })
}
