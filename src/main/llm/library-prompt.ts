/**
 * Build the <library-context> block injected into the system prompt.
 * Contains relevant chunks from the attached library.
 */

export interface LibraryChunkForPrompt {
  id: number               // Sequential ID for citation (1, 2, 3...)
  sourceId: string
  libraryId: string
  libraryName: string
  filename: string
  heading: string | null
  lineStart: number | null
  lineEnd: number | null
  content: string
  contentPreview: string
  score: number
}

const MAX_CHARS = 3000

export function buildLibraryContextBlock(
  chunks: LibraryChunkForPrompt[],
  libraryName: string
): string {
  if (chunks.length === 0) return ''

  let block = `<library-context>
Tu as acces au referentiel documentaire "${sanitize(libraryName)}". Base tes reponses sur ces sources.
Cite tes sources avec le format [source:ID] apres chaque affirmation basee sur un document.

`
  let currentLength = block.length

  for (const chunk of chunks) {
    const sectionAttr = chunk.heading ? ` section="${sanitize(chunk.heading)}"` : ''
    const linesAttr = chunk.lineStart != null ? ` lines="${chunk.lineStart}-${chunk.lineEnd ?? chunk.lineStart}"` : ''

    const entry = `<source id="${chunk.id}" file="${sanitize(chunk.filename)}"${sectionAttr}${linesAttr} library="${sanitize(libraryName)}">\n${sanitizeContent(chunk.content)}\n</source>\n\n`

    if (currentLength + entry.length > MAX_CHARS) break

    block += entry
    currentLength += entry.length
  }

  block += '</library-context>'
  return block
}

function sanitize(s: string): string {
  return s.replace(/["<>&]/g, '')
}

function sanitizeContent(s: string): string {
  return s
    .replace(/<\/source>/gi, '&lt;/source&gt;')
    .replace(/<\/library-context>/gi, '&lt;/library-context&gt;')
}
