import { tool } from 'ai'
import { z } from 'zod'
import type { WorkspaceService } from '../services/workspace.service'

/**
 * Build AI SDK tools for workspace file operations.
 * Only created when a workspace is active.
 */
export function buildWorkspaceTools(workspace: WorkspaceService) {
  return {
    readFile: tool({
      description:
        'Lire le contenu d\'un fichier du workspace. Retourne le contenu texte, le langage detecte et la taille.',
      parameters: z.object({
        path: z.string().describe('Chemin relatif du fichier dans le workspace (ex: "src/index.ts", "README.md")')
      }),
      execute: async ({ path }) => {
        try {
          const file = workspace.readFile(path)
          return {
            path: file.path,
            content: file.content,
            language: file.language,
            size: file.size
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Impossible de lire le fichier'
          }
        }
      }
    }),

    listFiles: tool({
      description:
        'Lister les fichiers et dossiers dans le workspace. Sans argument, liste la racine. Avec un chemin, liste ce repertoire.',
      parameters: z.object({
        path: z.string().optional().describe('Chemin relatif du repertoire a lister (optionnel, racine par defaut)')
      }),
      execute: async ({ path }) => {
        try {
          const entries = workspace.scanDirectory(path ?? '')
          return {
            path: path ?? '.',
            entries: entries.map(e => ({
              name: e.name,
              path: e.path,
              type: e.type,
              size: e.size,
              extension: e.extension
            }))
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Impossible de lister le repertoire'
          }
        }
      }
    }),

    searchInFiles: tool({
      description:
        'Rechercher un texte dans les fichiers du workspace. Retourne les fichiers correspondants avec les lignes trouvees.',
      parameters: z.object({
        query: z.string().describe('Texte ou pattern a rechercher'),
        path: z.string().optional().describe('Restreindre la recherche a ce sous-repertoire (optionnel)')
      }),
      execute: async ({ query, path: searchPath }) => {
        try {
          const tree = searchPath
            ? { children: workspace.scanDirectory(searchPath), type: 'directory' as const, name: '', path: searchPath }
            : workspace.scanTree(3) // Limit depth for search

          const results: Array<{ path: string; matches: string[] }> = []
          const MAX_RESULTS = 20
          const queryLower = query.toLowerCase()

          function searchNode(node: { type: string; path: string; children?: Array<{ type: string; path: string; name: string; children?: unknown[] }> }) {
            if (results.length >= MAX_RESULTS) return

            if (node.type === 'file') {
              try {
                const file = workspace.readFile(node.path)
                const lines = file.content.split('\n')
                const matchingLines: string[] = []
                for (let i = 0; i < lines.length && matchingLines.length < 5; i++) {
                  if (lines[i].toLowerCase().includes(queryLower)) {
                    matchingLines.push(`L${i + 1}: ${lines[i].trimEnd()}`)
                  }
                }
                if (matchingLines.length > 0) {
                  results.push({ path: node.path, matches: matchingLines })
                }
              } catch {
                // Skip unreadable files
              }
            } else if (node.children) {
              for (const child of node.children as Array<{ type: string; path: string; name: string; children?: unknown[] }>) {
                searchNode(child)
              }
            }
          }

          searchNode(tree as Parameters<typeof searchNode>[0])

          return {
            query,
            resultCount: results.length,
            results
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Erreur lors de la recherche'
          }
        }
      }
    })
  }
}

/** System prompt instructions injected when workspace tools are available */
export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au workspace (dossier de projet) de l'utilisateur via des outils.

Outils disponibles :
- readFile(path) — Lire le contenu d'un fichier
- listFiles(path?) — Lister les fichiers et dossiers (racine par defaut)
- searchInFiles(query, path?) — Rechercher du texte dans les fichiers

Regles :
- Quand l'utilisateur te demande de lire, analyser ou explorer des fichiers, utilise ces outils au lieu de demander le contenu.
- Commence par listFiles() pour decouvrir la structure si tu ne la connais pas.
- Tu peux enchainer plusieurs appels d'outils pour explorer le projet.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Quand tu proposes des modifications de fichiers, utilise ce format :
\`\`\`file:create:chemin/fichier.ext
contenu
\`\`\`
\`\`\`file:modify:chemin/fichier.ext
contenu complet modifie
\`\`\`
\`\`\`file:delete:chemin/fichier.ext
\`\`\`
`.trim()
