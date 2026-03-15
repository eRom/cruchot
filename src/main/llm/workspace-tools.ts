import { tool } from 'ai'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { join, sep, normalize } from 'path'
import { tmpdir } from 'os'
import type { WorkspaceService } from '../services/workspace.service'

const execAsync = promisify(exec)

// ── Bash Security ────────────────────────────────────────

const BLOCKED_PATTERNS = [
  // ── Destructive file operations ────────────────────────
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?[\/~]/,   // rm -rf / or ~ (absolute paths)
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\./,       // rm -rf . or ./ (current dir)
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\*/,       // rm -rf * (glob everything)
  /\bfind\b.*-delete\b/,                         // find . -delete
  /\bfind\b.*-exec\s+rm\b/,                     // find . -exec rm
  /\btruncate\b/,                                // truncate files
  /\bshred\b/,                                   // secure delete

  // ── Privilege escalation ───────────────────────────────
  /\bsudo\b/,
  /\bsu\s+/,
  /\bdoas\b/,

  // ── System commands ────────────────────────────────────
  /\bshutdown\b/,
  /\breboot\b/,
  /\bhalt\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\bformat\b.*[A-Z]:/i,
  />\s*\/dev\//,
  /\b(launchctl|systemctl|service)\s+(stop|disable|remove|load)\b/,
  /\bchmod\s+777\s+\//,
  /\bchown\s+.*\//,
  /\bkillall\b/,
  /\bpkill\s+-9\s+/,

  // ── Code execution / shell escapes ─────────────────────
  /\bcurl\b.*\|\s*\b(bash|sh|zsh)\b/,           // curl | bash
  /\bwget\b.*\|\s*\b(bash|sh|zsh)\b/,           // wget | bash
  /\beval\b.*\$\(/,                              // eval $(...)
  /\beval\b\s+/,                                 // eval (any form)
  /\bbash\s+-c\b/,                               // bash -c "..."
  /\bsh\s+-c\b/,                                 // sh -c "..."
  /\bzsh\s+-c\b/,                                // zsh -c "..."
  /\bbase64\b.*\|\s*\b(bash|sh|zsh)\b/,         // base64 | bash
  /\bpython[23]?\s+-c\b/,                       // python -c "..."
  /\bnode\s+-e\b/,                               // node -e "..."
  /\bperl\s+-e\b/,                               // perl -e "..."

  // ── Shell metacharacter evasion ───────────────────────
  /`[^`]*`/,                                     // backtick command substitution
  /\$\([^)]*\)/,                                 // $() command substitution
  /(^|[;&|]\s*)source\s+/,                       // source at command position (not in arguments)
  /(^|[;&|]\s*)\.\s+\//,                         // . /path at command position (dot-script)
  /\\x[0-9a-fA-F]{2}/,                          // hex escape sequences
  /\$'\\/,                                       // $'...' ANSI-C quoting (escape sequences)

  // ── Data exfiltration ──────────────────────────────────
  /\bscp\b/,                                     // scp (remote copy)
  /\brsync\b.*@/,                                // rsync to remote
  /\bsftp\b/,                                    // sftp
  /\bnc\s+-/,                                    // netcat
  /\bncat\b/,                                    // ncat
  /\btee\s+\//,                                  // tee /system/path

  // ── Write to system paths ──────────────────────────────
  />\s*\/etc\//,
  />\s*\/usr\//,
  />\s*\/System\//,
  />\s*~\//,                                     // write to home dir
]

// ── readFile Security ────────────────────────────────────
// Extensions textuelles autorisees (lecture seule par le LLM)
const TEXT_EXTENSIONS = new Set([
  // Documents
  '.md', '.txt', '.rst', '.adoc', '.org', '.csv', '.tsv', '.log',
  // Config
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.xml', '.plist', '.properties',
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.swift',
  '.php', '.lua', '.r', '.R', '.m', '.mm',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.prisma',
  // Web
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
  // Misc dev
  '.dockerfile', '.containerfile', '.tf', '.hcl',
  '.makefile', '.cmake', '.gradle', '.sbt',
  '.gitignore', '.gitattributes', '.editorconfig',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.env.example', '.env.sample',
  // Data
  '.jsonl', '.ndjson',
])

// Fichiers/dossiers bloques (sensibles ou gitignore classiques)
const BLOCKED_FILE_PATTERNS = [
  /^\.env$/,                      // .env
  /^\.env\..+$/,                  // .env.local, .env.production, etc. (sauf .env.example/.env.sample)
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.jks$/i,
  /\.keystore$/i, /\.credentials$/i,
  /^id_rsa/, /^id_ed25519/, /^id_ecdsa/,
]

const BLOCKED_PATH_SEGMENTS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.DS_Store', 'Thumbs.db', '.idea', '.vscode',
  'coverage', '.nyc_output', '.turbo',
  '.terraform', '.serverless',
]

function isReadableFile(filePath: string): { allowed: boolean; reason?: string } {
  const segments = normalize(filePath).split(sep)
  const filename = segments[segments.length - 1] || ''
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : ''

  // Block sensitive file patterns
  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(filename)) {
      // Allow .env.example and .env.sample explicitly
      if (filename === '.env.example' || filename === '.env.sample') continue
      return { allowed: false, reason: `Fichier sensible bloque : ${filename}` }
    }
  }

  // Block paths containing gitignore-style segments
  for (const seg of segments) {
    if (BLOCKED_PATH_SEGMENTS.includes(seg)) {
      return { allowed: false, reason: `Chemin bloque (${seg}) : ${filePath}` }
    }
  }

  // Allow files without extension if they look like common text files
  if (!ext) {
    const KNOWN_EXTENSIONLESS = ['Makefile', 'Dockerfile', 'Containerfile', 'LICENSE', 'README', 'CHANGELOG', 'AUTHORS', 'CODEOWNERS', 'Procfile', 'Gemfile', 'Rakefile', 'Vagrantfile', 'CLAUDE']
    if (KNOWN_EXTENSIONLESS.some(n => filename === n || filename.startsWith(n + '.'))) {
      return { allowed: true }
    }
    // Unknown extensionless file — block to be safe
    return { allowed: false, reason: `Type de fichier non reconnu (pas d'extension) : ${filename}` }
  }

  // Check extension whitelist
  if (!TEXT_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `Type de fichier non textuel (${ext}) : ${filename}` }
  }

  return { allowed: true }
}

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
            env: {
              PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
              HOME: process.env.HOME ?? tmpdir(),
              TMPDIR: tmpdir(),
              LANG: process.env.LANG ?? 'en_US.UTF-8',
              GIT_CONFIG_NOSYSTEM: '1',
              FORCE_COLOR: '0',
              NO_COLOR: '1'
            }
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
        'Read the contents of a TEXT file in the workspace. Only works on textual files (code, config, docs). Cannot read binary files (images, PDFs, archives), .env files, or files inside node_modules/.git/dist/build.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path from workspace root (e.g. "src/index.ts", "package.json")')
      }),
      execute: async ({ path }) => {
        // Security: check if the file is readable (text, not sensitive, not in gitignored dirs)
        const check = isReadableFile(path)
        if (!check.allowed) {
          return { error: check.reason! }
        }

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
        content: z.string().max(5_000_000).describe('Full content to write to the file (max 5MB)')
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

// ── Context Files (auto-injected) ────────────────────────
// Files read automatically and injected into the system prompt so the LLM
// doesn't need to waste tool calls discovering the project.
const CONTEXT_FILES = [
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

const MAX_CONTEXT_FILE_SIZE = 50_000 // 50KB per file
const MAX_TOTAL_CONTEXT_SIZE = 200_000 // 200KB total

/**
 * Reads context files from workspace root and returns an XML block
 * to inject into the system prompt. Only existing, non-empty files are included.
 */
export function buildWorkspaceContextBlock(rootPath: string): string {
  const parts: string[] = []
  let totalSize = 0

  for (const filename of CONTEXT_FILES) {
    const filePath = join(rootPath, filename)
    if (!existsSync(filePath)) continue

    try {
      const content = readFileSync(filePath, 'utf-8')
      if (!content.trim()) continue
      if (content.length > MAX_CONTEXT_FILE_SIZE) continue
      if (totalSize + content.length > MAX_TOTAL_CONTEXT_SIZE) break

      totalSize += content.length
      // Sanitize closing tags to prevent XML prompt injection
      const safeContent = content.replace(/<\/file>/gi, '&lt;/file&gt;').replace(/<\/workspace-context>/gi, '&lt;/workspace-context&gt;')
      parts.push(`<file name="${filename}">\n${safeContent}\n</file>`)
    } catch {
      // Skip unreadable files
    }
  }

  if (parts.length === 0) return ''
  return `<workspace-context>\n${parts.join('\n\n')}\n</workspace-context>`
}

/** System prompt instructions injected when workspace tools are available */
export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au workspace (dossier de projet) de l'utilisateur via des outils.

Outils disponibles :
- bash(command) — Executer une commande shell dans le repertoire du projet (npm, git, grep, find, tests, linters, builds, etc.)
- readFile(path) — Lire le contenu d'un fichier texte
- writeFile(path, content) — Creer ou modifier un fichier (repertoires parents crees automatiquement)
- listFiles(path?) — Lister les fichiers et dossiers (racine par defaut)

REGLES IMPORTANTES :
- Les fichiers de contexte du projet (README, CLAUDE.md, etc.) sont deja fournis ci-dessus dans <workspace-context>. NE PAS les relire avec readFile().
- Utilise les outils pour interagir avec le projet. Ne dis JAMAIS "je vais faire X" sans appeler l'outil immediatement.
- Tu peux enchainer plusieurs appels d'outils. Par exemple : listFiles() pour decouvrir la structure, readFile() pour lire un fichier, writeFile() pour le modifier.
- Utilise bash() pour : installer des packages (npm install), lancer des tests (npm test), verifier le code (npx tsc --noEmit), consulter git (git status, git diff), rechercher dans le code (grep -rn), et toute autre operation en ligne de commande.
- Utilise writeFile() pour creer ou modifier des fichiers. Fournis toujours le contenu COMPLET du fichier.
- Commence par listFiles() pour decouvrir la structure si tu ne connais pas les chemins.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Apres avoir modifie des fichiers, tu peux lancer les tests ou le linter avec bash() pour verifier que tout fonctionne.
`.trim()
