import { tool } from 'ai'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { WorkspaceService } from '../services/workspace.service'

const execAsync = promisify(exec)

// ── Bash Security ────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?[\/~]/,   // rm -rf / or ~ (absolute paths)
  /\bsudo\b/,
  /\bsu\s+/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bformat\b.*[A-Z]:/i,
  />\s*\/dev\//,
  /\b(launchctl|systemctl|service)\s+(stop|disable|remove)/,
  /\bchmod\s+777\s+\//,
  /\bchown\s+.*\//,
  /\bkillall\b/,
  /\bpkill\s+-9\s+/,
  /\bcurl\b.*\|\s*\b(bash|sh|zsh)\b/,          // curl | bash (pipe to shell)
  /\bwget\b.*\|\s*\b(bash|sh|zsh)\b/,
  /\beval\b.*\$\(/,                              // eval $(...)
  />\s*\/etc\//,                                  // write to /etc
  />\s*\/usr\//,                                  // write to /usr
]

const COMMAND_TIMEOUT = 30_000   // 30s
const MAX_OUTPUT_LENGTH = 50_000 // ~50KB

function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: `Commande bloquee par la politique de securite` }
    }
  }
  return { allowed: true }
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output
  return output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (sortie tronquee)'
}

// ── Tool Builder ─────────────────────────────────────────

/**
 * Build AI SDK tools for workspace operations.
 * Includes bash shell execution, file read/write, and directory listing.
 * Only created when a workspace is active.
 */
export function buildWorkspaceTools(workspace: WorkspaceService) {
  const rootPath = workspace.rootPath

  return {
    bash: tool({
      description:
        'Execute a shell command in the workspace directory. Use for: npm, git, grep, find, test runners, linters, build tools, file manipulation, and any CLI tool. The working directory is the project root.',
      inputSchema: z.object({
        command: z.string().describe('The bash command to execute (e.g. "npm test", "git status", "grep -rn pattern src/")')
      }),
      execute: async ({ command }) => {
        const check = isCommandAllowed(command)
        if (!check.allowed) {
          return { stdout: '', stderr: check.reason!, exitCode: 1 }
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: rootPath,
            timeout: COMMAND_TIMEOUT,
            maxBuffer: 1024 * 1024, // 1MB
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
          })
          return {
            stdout: truncateOutput(stdout),
            stderr: truncateOutput(stderr),
            exitCode: 0
          }
        } catch (error: unknown) {
          const execError = error as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean }
          if (execError.killed) {
            return {
              stdout: truncateOutput(execError.stdout ?? ''),
              stderr: 'Commande arretee : depassement du delai de 30 secondes',
              exitCode: 124
            }
          }
          return {
            stdout: truncateOutput(execError.stdout ?? ''),
            stderr: truncateOutput(execError.stderr ?? ''),
            exitCode: typeof execError.code === 'number' ? execError.code : 1
          }
        }
      }
    }),

    readFile: tool({
      description:
        'Read the contents of a file in the workspace. Returns text content, detected language, and size.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path from workspace root (e.g. "src/index.ts", "package.json")')
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
            error: error instanceof Error ? error.message : 'Cannot read file'
          }
        }
      }
    }),

    writeFile: tool({
      description:
        'Create or overwrite a file in the workspace. Parent directories are created automatically. Use for creating new files, modifying existing ones, or generating code.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path to write (e.g. "src/components/Button.tsx")'),
        content: z.string().describe('Full content to write to the file')
      }),
      execute: async ({ path, content }) => {
        try {
          workspace.writeFile(path, content)
          return { success: true, path, bytesWritten: Buffer.byteLength(content, 'utf-8') }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Cannot write file'
          }
        }
      }
    }),

    listFiles: tool({
      description:
        'List files and directories in the workspace. Without argument, lists the root. With a path, lists that directory.',
      inputSchema: z.object({
        path: z.string().optional().describe('Relative directory path to list (optional, root by default)')
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
            error: error instanceof Error ? error.message : 'Cannot list directory'
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
- bash(command) — Executer une commande shell dans le repertoire du projet (npm, git, grep, find, tests, linters, builds, etc.)
- readFile(path) — Lire le contenu d'un fichier
- writeFile(path, content) — Creer ou modifier un fichier (repertoires parents crees automatiquement)
- listFiles(path?) — Lister les fichiers et dossiers (racine par defaut)

REGLES IMPORTANTES :
- TOUJOURS utiliser les outils pour interagir avec le projet. Ne dis JAMAIS "je vais faire X" sans appeler l'outil immediatement.
- Tu peux enchainer plusieurs appels d'outils. Par exemple : listFiles() pour decouvrir la structure, readFile() pour lire un fichier, writeFile() pour le modifier.
- Utilise bash() pour : installer des packages (npm install), lancer des tests (npm test), verifier le code (npx tsc --noEmit), consulter git (git status, git diff), rechercher dans le code (grep -rn), et toute autre operation en ligne de commande.
- Utilise writeFile() pour creer ou modifier des fichiers. Fournis toujours le contenu COMPLET du fichier.
- Commence par listFiles() pour decouvrir la structure si tu ne connais pas les chemins.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Apres avoir modifie des fichiers, tu peux lancer les tests ou le linter avec bash() pour verifier que tout fonctionne.
`.trim()
