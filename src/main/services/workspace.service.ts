import * as path from 'path'
import * as fs from 'fs'

// ── Types ─────────────────────────────────────────────────
export interface FileNode {
  name: string
  path: string // relatif au workspace root
  type: 'file' | 'directory'
  size?: number
  extension?: string
  children?: FileNode[]
}

export interface WorkspaceInfo {
  rootPath: string
  name: string
  fileCount: number
  totalSize: number
}

export interface FileContent {
  path: string
  content: string
  language: string
  size: number
}

// ── Constants ─────────────────────────────────────────────
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_DEPTH = 20

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.DS_Store',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.turbo',
  'coverage',
  '.nyc_output',
  'out'
]

const DEFAULT_IGNORE_EXTENSIONS = [
  '.lock',
  '.sqlite',
  '.sqlite3',
  '.sqlite-journal',
  '.sqlite-wal',
  '.sqlite-shm'
]

const SENSITIVE_PATTERNS = [
  /^\.env/,
  /\.key$/,
  /\.pem$/,
  /\.cert$/,
  /\.p12$/,
  /\.pfx$/,
  /^credentials\.json$/,
  /^service-account.*\.json$/,
  /^\.npmrc$/,
  /^\.pypirc$/,
  /^id_rsa/,
  /^id_ed25519/
]

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'bash',
  '.zsh': 'bash',
  '.bash': 'bash',
  '.dockerfile': 'dockerfile',
  '.graphql': 'graphql',
  '.prisma': 'prisma',
  '.env': 'plaintext',
  '.txt': 'plaintext',
  '.csv': 'csv',
  '.log': 'plaintext'
}

// ── WorkspaceService ──────────────────────────────────────
export class WorkspaceService {
  readonly rootPath: string
  private ignorePatterns: string[] = []

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath)
    this.loadIgnorePatterns()
  }

  // ── Security ──────────────────────────────────────────
  validatePath(relativePath: string): string {
    const resolved = path.resolve(this.rootPath, relativePath)
    if (!resolved.startsWith(this.rootPath + path.sep) && resolved !== this.rootPath) {
      throw new Error(`Path traversal detected: ${relativePath}`)
    }
    return resolved
  }

  isIgnored(relativePath: string): boolean {
    const parts = relativePath.split(path.sep)
    for (const part of parts) {
      if (this.ignorePatterns.includes(part)) return true
    }
    const ext = path.extname(relativePath).toLowerCase()
    if (DEFAULT_IGNORE_EXTENSIONS.includes(ext)) return true
    return false
  }

  isSensitive(relativePath: string): boolean {
    const filename = path.basename(relativePath)
    return SENSITIVE_PATTERNS.some(pattern => pattern.test(filename))
  }

  // ── File tree ─────────────────────────────────────────
  scanTree(maxDepth?: number): FileNode {
    return this.scanDir('', maxDepth ?? MAX_DEPTH)
  }

  scanDirectory(relativePath: string): FileNode[] {
    const absPath = relativePath ? this.validatePath(relativePath) : this.rootPath
    const entries = fs.readdirSync(absPath, { withFileTypes: true })
    const nodes: FileNode[] = []

    for (const entry of entries) {
      const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name
      if (this.isIgnored(relPath)) continue

      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'directory'
        })
      } else if (entry.isFile()) {
        const stat = fs.statSync(path.join(absPath, entry.name))
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stat.size,
          extension: path.extname(entry.name).toLowerCase() || undefined
        })
      }
    }

    // Sort: directories first, then alphabetical
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return nodes
  }

  // ── File operations ───────────────────────────────────
  readFile(relativePath: string): FileContent {
    if (this.isSensitive(relativePath)) {
      throw new Error(`Access denied: ${relativePath} is a sensitive file`)
    }

    const absPath = this.validatePath(relativePath)
    const stat = fs.statSync(absPath)

    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`)
    }

    // Detect binary
    const buffer = Buffer.alloc(512)
    const fd = fs.openSync(absPath, 'r')
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0)
    fs.closeSync(fd)

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        throw new Error(`Binary file detected: ${relativePath}`)
      }
    }

    const content = fs.readFileSync(absPath, 'utf-8')
    const ext = path.extname(relativePath).toLowerCase()
    const language = EXTENSION_TO_LANGUAGE[ext] || 'plaintext'

    return {
      path: relativePath,
      content,
      language,
      size: stat.size
    }
  }

  writeFile(relativePath: string, content: string): void {
    if (this.isSensitive(relativePath)) {
      throw new Error(`Cannot write sensitive file: ${relativePath}`)
    }

    const absPath = this.validatePath(relativePath)
    const dir = path.dirname(absPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(absPath, content, 'utf-8')
  }

  async deleteFile(relativePath: string): Promise<void> {
    if (this.isSensitive(relativePath)) {
      throw new Error(`Cannot delete sensitive file: ${relativePath}`)
    }

    const absPath = this.validatePath(relativePath)
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${relativePath}`)
    }

    // Use trash (macOS safe delete)
    const { default: trash } = await import('trash')
    await trash(absPath)
  }

  // ── Metadata ──────────────────────────────────────────
  getWorkspaceInfo(): WorkspaceInfo {
    let fileCount = 0
    let totalSize = 0

    const countFiles = (dir: string, depth: number): void => {
      if (depth > 5) return // Limit depth for info scan
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const rel = path.relative(this.rootPath, path.join(dir, entry.name))
          if (this.isIgnored(rel)) continue

          if (entry.isFile()) {
            fileCount++
            try {
              totalSize += fs.statSync(path.join(dir, entry.name)).size
            } catch { /* ignore */ }
          } else if (entry.isDirectory()) {
            countFiles(path.join(dir, entry.name), depth + 1)
          }
        }
      } catch { /* ignore permission errors */ }
    }

    countFiles(this.rootPath, 0)

    return {
      rootPath: this.rootPath,
      name: path.basename(this.rootPath),
      fileCount,
      totalSize
    }
  }

  // ── Ignore patterns ───────────────────────────────────
  loadIgnorePatterns(): void {
    this.ignorePatterns = [...DEFAULT_IGNORE]

    // Load .coworkignore if it exists
    const ignoreFile = path.join(this.rootPath, '.coworkignore')
    if (fs.existsSync(ignoreFile)) {
      try {
        const content = fs.readFileSync(ignoreFile, 'utf-8')
        const lines = content
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
        this.ignorePatterns.push(...lines)
      } catch { /* ignore */ }
    }
  }

  // ── Private ───────────────────────────────────────────
  private scanDir(relativePath: string, maxDepth: number, currentDepth = 0): FileNode {
    const absPath = relativePath ? path.join(this.rootPath, relativePath) : this.rootPath
    const name = relativePath ? path.basename(relativePath) : path.basename(this.rootPath)

    const node: FileNode = {
      name,
      path: relativePath || '.',
      type: 'directory',
      children: []
    }

    if (currentDepth >= maxDepth) return node

    try {
      const entries = fs.readdirSync(absPath, { withFileTypes: true })

      for (const entry of entries) {
        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name
        if (this.isIgnored(relPath)) continue

        if (entry.isDirectory()) {
          node.children!.push(this.scanDir(relPath, maxDepth, currentDepth + 1))
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(path.join(absPath, entry.name))
            node.children!.push({
              name: entry.name,
              path: relPath,
              type: 'file',
              size: stat.size,
              extension: path.extname(entry.name).toLowerCase() || undefined
            })
          } catch { /* ignore stat errors */ }
        }
      }

      // Sort: directories first, then alphabetical
      node.children!.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch { /* ignore permission errors */ }

    return node
  }
}
