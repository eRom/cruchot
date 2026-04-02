import { tool } from 'ai'
import { z } from 'zod'
import { execSandboxed } from '../../services/seatbelt'
import { truncateOutput, MAX_OUTPUT_LENGTH } from './shared'

/**
 * Build the bash tool for a given workspace path.
 * Security checks (blocklist, etc.) are NOT applied here —
 * they will be applied by the pipeline wrapper (Task 9).
 * OS-level confinement is provided by Seatbelt via execSandboxed.
 */
export function buildBashTool(workspacePath: string) {
  return tool({
    description: `Execute une commande shell dans le dossier de travail. Le repertoire de travail est la racine du workspace et persiste entre les appels. Timeout : 30 secondes.

Usage :
- Utilise pour : npm, git, compilateurs, linters, test runners, serveurs, et outils CLI.
- IMPORTANT : Evite bash() pour les taches que les outils dedies font mieux :
  - Recherche de fichiers → GlobTool (PAS find ou ls)
  - Recherche dans le contenu → GrepTool (PAS grep ou rg)
  - Lire un fichier → readFile (PAS cat/head/tail)
  - Modifier un fichier → FileEdit (PAS sed/awk)
  - Creer un fichier → writeFile (PAS echo >/cat <<EOF)
- Utilise des chemins relatifs au workspace. Evite cd sauf si necessaire.
- Toujours mettre les chemins contenant des espaces entre guillemets doubles.
- Pour lancer plusieurs commandes independantes, fais plusieurs appels bash() en parallele.
- Pour chainer des commandes dependantes, utilise && dans un seul appel.
- N'utilise PAS de retours a la ligne pour separer des commandes.
- Les commandes tournent dans un sandbox. Certaines actions hors du workspace seront refusees.
- Certaines commandes dangereuses (rm -rf /, sudo, chmod 777, etc.) sont bloquees automatiquement.
- Si une commande echoue, diagnostique la cause avant de reessayer. Ne boucle pas avec des sleep.
- Git : pas de git push/reset --hard/checkout -- sans demande explicite. Pas de --no-verify.`,
    inputSchema: z.object({
      command: z.string().describe('The bash command to execute')
    }),
    execute: async ({ command }) => {
      try {
        const result = await execSandboxed(command, workspacePath, {
          timeout: 30_000,
          maxBuffer: MAX_OUTPUT_LENGTH,
          cwd: workspacePath
        })
        return {
          stdout: truncateOutput(result.stdout),
          stderr: truncateOutput(result.stderr),
          exitCode: result.exitCode ?? 0
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Command execution failed'
        return { stdout: '', stderr: msg, exitCode: 1 }
      }
    }
  })
}
