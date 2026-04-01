import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

// ── Context Files (auto-injected) ────────────────────────
export const CONTEXT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  'COPILOT.md',
  'CURSORRULES',
  '.cursorrules',
  'README.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
]

export const MAX_CONTEXT_FILE_SIZE = 50_000 // 50KB per file
export const MAX_TOTAL_CONTEXT_SIZE = 200_000 // 200KB total

/**
 * Reads context files from workspace root and returns an XML block
 * to inject into the system prompt.
 */
export function buildWorkspaceContextBlock(workspacePath: string): string {
  const parts: string[] = []
  let totalSize = 0

  for (const filename of CONTEXT_FILES) {
    const filePath = join(workspacePath, filename)
    if (!existsSync(filePath)) continue

    try {
      const content = readFileSync(filePath, 'utf-8')
      if (!content.trim()) continue
      if (content.length > MAX_CONTEXT_FILE_SIZE) continue
      if (totalSize + content.length > MAX_TOTAL_CONTEXT_SIZE) break

      totalSize += content.length
      const safeContent = content.replace(/<\/file>/gi, '&lt;/file&gt;').replace(/<\/workspace-context>/gi, '&lt;/workspace-context&gt;')
      parts.push(`<file name="${filename}">\n${safeContent}\n</file>`)
    } catch {
      // Skip unreadable files
    }
  }

  if (parts.length === 0) return ''
  return `<workspace-context>\n${parts.join('\n\n')}\n</workspace-context>`
}

/** System prompt instructions injected for conversation tools */
export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au dossier de travail de l'utilisateur via des outils.

Outils disponibles :
- bash(command) — Executer une commande shell dans le dossier de travail (npm, git, grep, find, tests, linters, builds, etc.)
- readFile(path) — Lire le contenu d'un fichier texte
- writeFile(path, content) — Creer ou modifier un fichier (repertoires parents crees automatiquement)
- listFiles(path?, recursive?) — Lister les fichiers et dossiers (racine par defaut)

REGLES IMPORTANTES :
- Les fichiers de contexte du projet (README, CLAUDE.md, etc.) sont deja fournis ci-dessus dans <workspace-context>. NE PAS les relire avec readFile().
- Utilise les outils pour interagir avec le projet. Ne dis JAMAIS "je vais faire X" sans appeler l'outil immediatement.
- Tu peux enchainer plusieurs appels d'outils. Par exemple : listFiles() pour decouvrir la structure, readFile() pour lire un fichier, writeFile() pour le modifier.
- Utilise bash() pour : installer des packages (npm install), lancer des tests (npm test), verifier le code (npx tsc --noEmit), rechercher dans le code (grep -rn), et toute autre operation en ligne de commande.
- Utilise writeFile() pour creer ou modifier des fichiers. Fournis toujours le contenu COMPLET du fichier.
- Commence par listFiles() pour decouvrir la structure si tu ne connais pas les chemins.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Apres avoir modifie des fichiers, tu peux lancer les tests ou le linter avec bash() pour verifier que tout fonctionne.
`.trim()
