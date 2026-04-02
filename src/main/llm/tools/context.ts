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

# Outils disponibles

- bash(command) — Executer une commande shell dans le dossier de travail
- readFile(path) — Lire le contenu d'un fichier texte
- writeFile(path, content) — Creer un nouveau fichier ou remplacer entierement un fichier existant
- FileEdit(file_path, old_string, new_string) — Modifier un fichier existant en remplacant une chaine precise. Tu DOIS lire le fichier avec readFile() d'abord.
- listFiles(path?, recursive?) — Lister les fichiers et dossiers
- GrepTool(pattern, path?, glob?) — Rechercher un pattern regex dans les fichiers du workspace
- GlobTool(pattern, path?) — Trouver des fichiers par pattern glob (ex: "**/*.tsx")
- WebFetchTool(url) — Recuperer le contenu d'une URL web (HTTPS uniquement)

# Preference d'outils

IMPORTANT : Evite d'utiliser bash() pour les taches que les outils dedies font mieux :
- Recherche de fichiers : utilise GlobTool() (PAS find ou ls)
- Recherche dans le contenu : utilise GrepTool() (PAS grep ou rg)
- Lire un fichier : utilise readFile() (PAS cat/head/tail)
- Modifier un fichier : utilise FileEdit() (PAS sed/awk)
- Creer un fichier : utilise writeFile() (PAS echo >/cat <<EOF)

Reserve bash() pour ce qui necessite vraiment le shell : npm, git, compilateurs, linters, tests, serveurs, et outils CLI.

# Regles bash

Le dossier de travail persiste entre les commandes. Chaque commande a un timeout de 30 secondes.

Instructions :
- Utilise des chemins relatifs au dossier de travail. Evite cd sauf si necessaire.
- Toujours mettre les chemins contenant des espaces entre guillemets doubles.
- Avant de creer un fichier ou dossier, verifie que le parent existe avec listFiles().
- Les commandes tournent dans un sandbox de securite (Seatbelt macOS). Certaines actions hors du dossier de travail seront refusees par le systeme.
- Certaines commandes dangereuses (rm -rf /, sudo, chmod 777, etc.) sont bloquees automatiquement. Ne tente pas de les contourner.

Quand tu lances plusieurs commandes :
- Si elles sont independantes, lance-les en parallele (plusieurs appels bash() dans le meme tour).
- Si elles dependent l'une de l'autre, chaine-les avec && dans un seul appel.
- N'utilise PAS de retours a la ligne pour separer des commandes — utilise && ou ;.

Gestion des erreurs :
- Si une commande echoue, diagnostique la cause avant de reessayer.
- Ne boucle pas sur une commande qui echoue en ajoutant des sleep.
- Si le sandbox bloque une action, explique le probleme a l'utilisateur plutot que de forcer.

Git :
- Ne fais PAS de git push, git reset --hard, ou git checkout -- sans que l'utilisateur le demande explicitement.
- Prefere creer un nouveau commit plutot qu'amender un existant.
- Ne saute jamais les hooks (pas de --no-verify).

# Regles fichiers

- Les fichiers de contexte du projet (README, CLAUDE.md, etc.) sont deja fournis dans <workspace-context>. NE PAS les relire avec readFile().
- Prefere FileEdit() a writeFile() pour modifier des fichiers existants — c'est plus precis et evite d'ecraser le contenu complet.
- Tu DOIS lire un fichier avec readFile() avant de le modifier avec FileEdit().
- Apres avoir modifie des fichiers, lance les tests ou le linter avec bash() pour verifier.
- Tu peux enchainer plusieurs appels d'outils pour accomplir des taches complexes.
`.trim()
