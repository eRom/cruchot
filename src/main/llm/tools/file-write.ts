import { tool } from 'ai'
import { z } from 'zod'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { validatePath, MAX_FILE_SIZE } from './shared'

/**
 * Build the writeFile tool for a given workspace path.
 */
export function buildWriteFileTool(workspacePath: string) {
  return tool({
    description:
      'Create or overwrite a file in the workspace. Parent directories are created automatically. Use for creating new files, modifying existing ones, or generating code.',
    inputSchema: z.object({
      path: z.string().describe('Relative file path to write (e.g. "src/components/Button.tsx")'),
      content: z.string().max(MAX_FILE_SIZE).describe('Full content to write to the file (max 5MB)')
    }),
    execute: async ({ path: filePath, content }) => {
      const pathCheck = validatePath(filePath, workspacePath)
      if (!pathCheck.valid) {
        return { error: pathCheck.reason! }
      }

      try {
        const fullPath = join(workspacePath, filePath)
        mkdirSync(dirname(fullPath), { recursive: true })
        writeFileSync(fullPath, content, 'utf-8')
        return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Cannot write file' }
      }
    }
  })
}
