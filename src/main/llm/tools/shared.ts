import { existsSync, realpathSync } from 'fs'
import { join, sep, normalize, dirname } from 'path'

// ── readFile Security ────────────────────────────────────
// Extensions textuelles autorisees (lecture seule par le LLM)
export const TEXT_EXTENSIONS = new Set([
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
export const BLOCKED_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\..+$/,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.jks$/i,
  /\.keystore$/i, /\.credentials$/i,
  /^id_rsa/, /^id_ed25519/, /^id_ecdsa/,
]

export const BLOCKED_PATH_SEGMENTS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.DS_Store', 'Thumbs.db', '.idea', '.vscode',
  'coverage', '.nyc_output', '.turbo',
  '.terraform', '.serverless',
]

export const KNOWN_EXTENSIONLESS = [
  'Makefile', 'Dockerfile', 'Containerfile', 'LICENSE', 'README',
  'CHANGELOG', 'AUTHORS', 'CODEOWNERS', 'Procfile', 'Gemfile',
  'Rakefile', 'Vagrantfile', 'CLAUDE'
]

export const MAX_FILE_SIZE = 5_000_000 // 5MB
export const MAX_OUTPUT_LENGTH = 100_000 // 100KB
export const MAX_LIST_ENTRIES = 500

// TOCTOU cache: tracks last read timestamps per file path
export const fileReadTimestamps = new Map<string, number>()

export function isReadableFile(filePath: string): { allowed: boolean; reason?: string } {
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

export function validatePath(filePath: string, workspacePath: string): { valid: boolean; resolved: string; reason?: string } {
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

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output
  return output.slice(0, MAX_OUTPUT_LENGTH) + '\n... (sortie tronquee)'
}
