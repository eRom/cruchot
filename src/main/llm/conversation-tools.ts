import { tool } from 'ai'
import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'fs'
import { join, sep, normalize, dirname, extname, basename } from 'path'
import { execSandboxed } from '../services/seatbelt'

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

// Fichiers/dossiers bloques (sensibles)
const BLOCKED_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
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

const KNOWN_EXTENSIONLESS = [
  'Makefile', 'Dockerfile', 'Containerfile', 'LICENSE', 'README',
  'CHANGELOG', 'AUTHORS', 'CODEOWNERS', 'Procfile', 'Gemfile',
  'Rakefile', 'Vagrantfile', 'CLAUDE'
]

const MAX_FILE_SIZE = 5_000_000 // 5MB
const MAX_OUTPUT_LENGTH = 100_000 // 100KB
const MAX_LIST_ENTRIES = 500

function isReadableFile(filePath: string): { allowed: boolean; reason?: string } {
  const segments = normalize(filePath).split(sep)
  const filename = segments[segments.length - 1] || ''
  const ext = filename.includes('.') ? '.' + filename.split('.').pop()!.toLowerCase() : ''

  for (const pattern of BLOCKED_FILE_PATTERNS) {
    if (pattern.test(filename)) {
      if (filename === '.env.example' || filename === '.env.sample') continue
      return { allowed: false, reason: `Fichier sensible bloque : ${filename}` }
    }
  }

  for (const seg of segments) {
    if (BLOCKED_PATH_SEGMENTS.includes(seg)) {
      return { allowed: false, reason: `Chemin bloque (${seg}) : ${filePath}` }
    }
  }

  if (!ext) {
    if (KNOWN_EXTENSIONLESS.some(n => filename === n || filename.startsWith(n + '.'))) {
      return { allowed: true }
    }
    return { allowed: false, reason: `Type de fichier non reconnu (pas d'extension) : ${filename}` }
  }

  if (!TEXT_EXTENSIONS.has(ext)) {
    return { allowed: false, reason: `Type de fichier non textuel (${ext}) : ${filename}` }
  }

  return { allowed: true }
}

function validatePath(filePath: string, workspacePath: string): { valid: boolean; resolved: string; reason?: string } {
  const fullPath = join(workspacePath, filePath)
  try {
    // Ensure parent exists for the check (file may not exist yet for write)
    const dirToCheck = existsSync(fullPath) ? fullPath : dirname(fullPath)
    if (!existsSync(dirToCheck)) {
      return { valid: true, resolved: fullPath } // Parent doesn't exist — will be created by write
    }
    const resolved = realpathSync(existsSync(fullPath) ? fullPath : dirToCheck)
    const resolvedWorkspace = realpathSync(workspacePath)
    if (!resolved.startsWith(resolvedWorkspace + sep) && resolved !== resolvedWorkspace) {
      return { valid: false, resolved: fullPath, reason: 'Chemin hors du dossier de travail' }
    }
    return { valid: true, resolved: fullPath }
  } catch {
    return { valid: true, resolved: fullPath } // Can't resolve — allow (file doesn't exist yet)
  }
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output
  return output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (sortie tronquee)'
}

// ── Tool Builder ─────────────────────────────────────────

/**
 * Build AI SDK tools for conversation workspace operations.
 * Always available — every conversation has a workspacePath.
 * Bash is unrestricted (security via Seatbelt OS confinement).
 */
export function buildConversationTools(workspacePath: string) {
  return {
    bash: tool({
      description:
        'Execute a shell command in the workspace directory. Use for: npm, git, grep, find, test runners, linters, build tools, and any CLI tool. The working directory is the workspace root. No restrictions — you have full shell access within this directory.',
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
    }),

    readFile: tool({
      description:
        'Read the contents of a TEXT file in the workspace. Only works on textual files (code, config, docs). Cannot read binary files, .env files, or files inside node_modules/.git.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path from workspace root (e.g. "src/index.ts")')
      }),
      execute: async ({ path: filePath }) => {
        const check = isReadableFile(filePath)
        if (!check.allowed) {
          return { error: check.reason! }
        }

        const pathCheck = validatePath(filePath, workspacePath)
        if (!pathCheck.valid) {
          return { error: pathCheck.reason! }
        }

        try {
          const fullPath = join(workspacePath, filePath)
          const stat = statSync(fullPath)
          if (stat.size > MAX_FILE_SIZE) {
            return { error: `Fichier trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)` }
          }
          const content = readFileSync(fullPath, 'utf-8')
          const ext = extname(filePath).slice(1) || 'txt'
          return { path: filePath, content, language: ext, size: stat.size }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Cannot read file' }
        }
      }
    }),

    writeFile: tool({
      description:
        'Create or overwrite a file in the workspace. Parent directories are created automatically. Use for creating new files, modifying existing ones, or generating code.',
      inputSchema: z.object({
        path: z.string().describe('Relative file path to write (e.g. "src/components/Button.tsx")'),
        content: z.string().max(MAX_FILE_SIZE).describe('Full content to write to the file (max 5MB)')
      }),
      execute: async ({ path: filePath, content }) => {
        const pathCheck = validatePath(filePath, workspacePath)
        if (!pathCheck.valid) {
          return { error: pathCheck.reason! }
        }

        try {
          const fullPath = join(workspacePath, filePath)
          mkdirSync(dirname(fullPath), { recursive: true })
          writeFileSync(fullPath, content, 'utf-8')
          return { success: true, path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Cannot write file' }
        }
      }
    }),

    listFiles: tool({
      description:
        'List files and directories in the workspace. Without argument, lists the root. With a path, lists that directory.',
      inputSchema: z.object({
        path: z.string().optional().describe('Relative directory path to list (optional, root by default)'),
        recursive: z.boolean().optional().describe('List recursively (default false)')
      }),
      execute: async ({ path: dirPath, recursive }) => {
        const pathCheck = validatePath(dirPath ?? '', workspacePath)
        if (!pathCheck.valid) {
          return { error: pathCheck.reason! }
        }

        try {
          const fullPath = join(workspacePath, dirPath ?? '')
          const entries: Array<{ path: string; type: string; size: number }> = []

          function scanDir(dir: string, prefix: string) {
            if (entries.length >= MAX_LIST_ENTRIES) return
            const items = readdirSync(dir, { withFileTypes: true })
            for (const item of items) {
              if (entries.length >= MAX_LIST_ENTRIES) break
              if (BLOCKED_PATH_SEGMENTS.includes(item.name)) continue
              const rel = prefix ? `${prefix}/${item.name}` : item.name
              if (item.isDirectory()) {
                entries.push({ path: rel, type: 'directory', size: 0 })
                if (recursive) scanDir(join(dir, item.name), rel)
              } else {
                try {
                  const stat = statSync(join(dir, item.name))
                  entries.push({ path: rel, type: 'file', size: stat.size })
                } catch {
                  entries.push({ path: rel, type: 'file', size: 0 })
                }
              }
            }
          }

          scanDir(fullPath, '')
          return { path: dirPath ?? '.', entries }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Cannot list directory' }
        }
      }
    })
  }
}

// ── Context Files (auto-injected) ────────────────────────
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
