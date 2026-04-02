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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Cruchot/1.0)',
  'Accept': 'text/html,application/xhtml+xml,text/plain,application/json'
}

function isPrivateOrReservedHost(hostname: string): boolean {
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('169.254.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return true
  }
  return false
}

async function processResponse(
  response: Response,
  url: string,
  prompt?: string
): Promise<Record<string, unknown>> {
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
}

export function buildWebFetchTool() {
  return tool({
    description: `Recupere le contenu d'une URL web et le retourne en markdown. Lecture seule.

Usage :
- Seules les URLs HTTPS sont autorisees. Les URLs HTTP seront refusees.
- Le HTML est automatiquement converti en markdown. Le JSON est formate.
- Utile pour : lire de la documentation, verifier une API, recuperer du materiel de reference.
- Timeout : 15 secondes. Taille max : 2 MB (reponse), 100 KB (markdown).
- Le parametre prompt est optionnel — il indique ce qu'on cherche dans la page.
- Pour les URLs GitHub, prefere bash avec gh CLI (gh pr view, gh issue view, etc.).`,
    inputSchema: z.object({
      url: z.string().url().describe('The HTTPS URL to fetch'),
      prompt: z.string().optional().describe('Optional instruction for what to extract from the page')
    }),
    execute: async ({ url, prompt }) => {
      // Validate protocol and host
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:') {
          return { error: 'Seules les URLs HTTPS sont autorisees' }
        }
        if (isPrivateOrReservedHost(parsed.hostname)) {
          return { error: 'Acces aux adresses internes/privees interdit' }
        }
      } catch {
        return { error: 'URL invalide' }
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const response = await fetch(url, {
          signal: controller.signal,
          redirect: 'manual',
          headers: FETCH_HEADERS
        })

        clearTimeout(timeout)

        // Handle redirects manually — validate target is still HTTPS + not private
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location')
          if (!location) {
            return { error: `Redirect ${response.status} sans header Location` }
          }
          try {
            const redirectUrl = new URL(location, url)
            if (redirectUrl.protocol !== 'https:') {
              return { error: `Redirect vers protocole non-HTTPS bloque: ${redirectUrl.protocol}` }
            }
            if (isPrivateOrReservedHost(redirectUrl.hostname)) {
              return { error: 'Redirect vers adresse interne/privee bloque' }
            }
            // Follow one redirect max
            const controller2 = new AbortController()
            const timeout2 = setTimeout(() => controller2.abort(), FETCH_TIMEOUT_MS)
            const redirectResponse = await fetch(redirectUrl.href, {
              signal: controller2.signal,
              redirect: 'manual',
              headers: FETCH_HEADERS
            })
            clearTimeout(timeout2)
            if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
              return { error: 'Trop de redirections (max 1)' }
            }
            return processResponse(redirectResponse, url, prompt)
          } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') {
              return { error: `Timeout apres ${FETCH_TIMEOUT_MS / 1000}s` }
            }
            return { error: `Redirect invalide: ${location}` }
          }
        }

        return processResponse(response, url, prompt)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { error: `Timeout apres ${FETCH_TIMEOUT_MS / 1000}s` }
        }
        return { error: error instanceof Error ? error.message : 'Fetch failed' }
      }
    }
  })
}
