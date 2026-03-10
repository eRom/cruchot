import { nanoid } from 'nanoid'

export interface ParsedFileOperation {
  id: string
  type: 'create' | 'modify' | 'delete'
  path: string
  content?: string
}

/**
 * Parse file operations from LLM response text.
 * Format:
 *   ```file:create:src/utils/helper.ts
 *   export function helper() { ... }
 *   ```
 *
 *   ```file:modify:src/config.ts
 *   // modified content
 *   ```
 *
 *   ```file:delete:src/old-file.ts
 *   ```
 */
export function parseFileOperations(text: string): ParsedFileOperation[] {
  const regex = /```file:(create|modify|delete):([^\n]+)\n([\s\S]*?)```/g
  const operations: ParsedFileOperation[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    operations.push({
      id: nanoid(),
      type: match[1] as 'create' | 'modify' | 'delete',
      path: match[2].trim(),
      content: match[1] !== 'delete' ? match[3] : undefined
    })
  }

  return operations
}
