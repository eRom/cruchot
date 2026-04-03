/**
 * Build the <user-profile> block injected into the system prompt.
 * Contains auto-extracted behavioral episodes about the user.
 */
import { getActiveEpisodesForInjection } from '../db/queries/episodes'

const MAX_CHARS = 2500

export function buildEpisodeProfileBlock(projectId?: string | null): string | null {
  const episodes = getActiveEpisodesForInjection(projectId)
  if (episodes.length === 0) return null

  const sorted = [...episodes].sort((a, b) => {
    const scoreA = a.confidence * Math.log(a.occurrences + 1)
    const scoreB = b.confidence * Math.log(b.occurrences + 1)
    return scoreB - scoreA
  })

  let block = '<user-profile>\nProfil comportemental de l\'utilisateur :\n\n'
  let currentLength = block.length

  for (const ep of sorted) {
    const pct = Math.round(ep.confidence * 100)
    const occ = ep.occurrences > 1 ? `, vu ${ep.occurrences}x` : ''

    const content = ep.content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .slice(0, 200)

    const entry = `[${ep.category}] (confiance: ${pct}%${occ}) ${content}\n`

    if (currentLength + entry.length > MAX_CHARS) break

    block += entry
    currentLength += entry.length
  }

  block += '</user-profile>'
  return block
}
