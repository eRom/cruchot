import { tool } from 'ai'
import { z } from 'zod'
// turndown is a CJS module — use createRequire for clean interop in ESM/TS
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TurndownService = require('turndown') as typeof import('turndown')

const MAX_RESPONSE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_MARKDOWN_LENGTH = 100_000 // 100 KB
const FETCH_TIMEOUT_MS = 15_000

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

export function buildWebFetchTool() {
  return tool({
    description:
      'Fetch a web URL and return its content as markdown. Only HTTPS URLs are allowed. Useful for reading documentation, checking endpoints, or fetching reference material.',
    inputSchema: z.object({
      url: z.string().url().describe('The HTTPS URL to fetch'),
      prompt: z.string().optional().describe('Optional instruction for what to extract from the page')
    }),
    execute: async ({ url, prompt }) => {
      // Validate protocol
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') {
          return { error: 'Seules les URLs HTTPS sont autorisees' }
        }
      } catch {
        return { error: 'URL invalide' }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Cruchot/1.0)',
            'Accept': 'text/html,application/xhtml+xml,text/plain,application/json'
          }
        })

        clearTimeout(timeout)

        if (!response.ok) {
          return { error: `HTTP ${response.status}: ${response.statusText}` }
        }

        const contentType = response.headers.get('content-type') ?? ''
        const text = await response.text()

        if (text.length > MAX_RESPONSE_SIZE) {
          return { error: `Reponse trop volumineuse (${(text.length / 1024 / 1024).toFixed(1)} MB, max 2 MB)` }
        }

        let markdown: string

        if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
          markdown = turndown.turndown(text)
        } else if (contentType.includes('application/json')) {
          try {
            markdown = '```json\n' + JSON.stringify(JSON.parse(text), null, 2) + '\n```'
          } catch {
            markdown = '```\n' + text + '\n```'
          }
        } else {
          markdown = text
        }

        if (markdown.length > MAX_MARKDOWN_LENGTH) {
          markdown = markdown.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n... (contenu tronque)'
        }

        return {
          url,
          content: markdown,
          contentType,
          size: text.length,
          ...(prompt ? { prompt } : {})
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { error: `Timeout apres ${FETCH_TIMEOUT_MS / 1000}s` }
        }
        return { error: error instanceof Error ? error.message : 'Fetch failed' }
      }
    }
  })
}
