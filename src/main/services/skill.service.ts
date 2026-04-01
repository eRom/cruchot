/**
 * SkillService — Gestion des Skills (packs autonomes avec SKILL.md).
 * Frontmatter parsing, discovery, installation, file tree.
 */
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ParsedFrontmatter {
  name: string
  description?: string
  allowedTools?: string[]
  argumentHint?: string
  userInvocable?: boolean
  effort?: string
  shell?: string
  context?: string
  agent?: string
  paths?: string[]
  model?: string
  whenToUse?: string
}

export interface ParsedSkill {
  frontmatter: ParsedFrontmatter
  content: string
  rawContent: string
}

export interface SkillInstallResult {
  success: boolean
  skillName?: string
  error?: string
}

export interface SkillTreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillTreeNode[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/

// Patterns excluded from skill file tree
const TREE_EXCLUDE_NAMES = new Set(['.git', 'node_modules', '.DS_Store'])
const TREE_EXCLUDE_EXTENSIONS = new Set(['.pyc', '.o', '.so', '.dll'])

const BLOCKED_ROOTS = [
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/System',
  '/Library',
  '/private/etc',
  '/private/var/db'
]

// ── Simple YAML parser ─────────────────────────────────────────────────────

/**
 * Minimal YAML parser for SKILL.md frontmatter.
 * Supports: key: value, arrays [a, b] and - item, multiline |, boolean coercion.
 */
function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = raw.split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      i++
      continue
    }

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) {
      i++
      continue
    }

    const key = trimmed.slice(0, colonIdx).trim()
    let value = trimmed.slice(colonIdx + 1).trim()

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1)
      result[key] = inner
        .split(',')
        .map(s => stripQuotes(s.trim()))
        .filter(s => s.length > 0)
      i++
      continue
    }

    // Multiline block scalar: | (literal), > (folded), |- (literal strip), >- (folded strip)
    const blockMatch = value.match(/^([|>])(-?)$/)
    if (blockMatch) {
      const isFolded = blockMatch[1] === '>'
      const blockLines: string[] = []
      let baseIndent = -1
      i++
      while (i < lines.length) {
        const bLine = lines[i]
        const bTrimmed = bLine.trimEnd()
        if (!bTrimmed) {
          blockLines.push('')
          i++
          continue
        }
        const indent = bLine.length - bLine.trimStart().length
        if (baseIndent === -1) baseIndent = indent
        if (indent < baseIndent && bTrimmed.trim() !== '') break
        blockLines.push(bLine.slice(baseIndent))
        i++
      }
      if (isFolded) {
        // Folded: join lines with spaces (empty lines become newlines)
        result[key] = blockLines
          .join('\n')
          .replace(/([^\n])\n([^\n])/g, '$1 $2')  // join consecutive non-empty lines
          .trimEnd()
      } else {
        // Literal: preserve newlines
        result[key] = blockLines.join('\n').trimEnd()
      }
      continue
    }

    // Potential block array (value is empty → next lines are "- item")
    if (!value) {
      const arrayItems: string[] = []
      i++
      while (i < lines.length) {
        const aLine = lines[i].trim()
        if (aLine.startsWith('- ')) {
          arrayItems.push(stripQuotes(aLine.slice(2).trim()))
          i++
        } else if (aLine === '' || aLine.startsWith('#')) {
          i++
        } else {
          break
        }
      }
      if (arrayItems.length > 0) {
        result[key] = arrayItems
      }
      continue
    }

    // Boolean coercion
    if (value === 'true' || value === 'yes') {
      result[key] = true
    } else if (value === 'false' || value === 'no') {
      result[key] = false
    } else {
      result[key] = stripQuotes(value)
    }

    i++
  }

  return result
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

// ── SkillService class ─────────────────────────────────────────────────────

class SkillService {
  private skillsDir: string
  private pythonAvailableCache: boolean | null = null

  constructor() {
    const home = app?.getPath?.('home') ?? process.env.HOME ?? process.env.USERPROFILE ?? ''
    this.skillsDir = path.join(home, '.cruchot', 'skills')
  }

  // ── Directory management ─────────────────────────────────────────────────

  ensureSkillsDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true })
    }
  }

  getSkillsDir(): string {
    return this.skillsDir
  }

  // ── Frontmatter parsing ──────────────────────────────────────────────────

  /**
   * Parse a SKILL.md raw content string.
   * Returns ParsedSkill with frontmatter fields, body content, and raw content.
   */
  parseSkillContent(rawContent: string): ParsedSkill {
    const match = rawContent.match(FRONTMATTER_REGEX)

    if (!match) {
      throw new Error('SKILL.md: frontmatter manquant (attendu entre --- et ---)')
    }

    const yamlRaw = match[1]
    const content = rawContent.slice(match[0].length)

    const yaml = parseSimpleYaml(yamlRaw)

    if (!yaml.name || typeof yaml.name !== 'string') {
      throw new Error('SKILL.md: champ "name" obligatoire manquant dans le frontmatter')
    }

    const frontmatter: ParsedFrontmatter = {
      name: yaml.name as string
    }

    if (typeof yaml.description === 'string') frontmatter.description = yaml.description
    if (typeof yaml.argumentHint === 'string') frontmatter.argumentHint = yaml.argumentHint
    if (typeof yaml.argument_hint === 'string') frontmatter.argumentHint = yaml.argument_hint as string
    if (typeof yaml.effort === 'string') frontmatter.effort = yaml.effort
    if (typeof yaml.shell === 'string') frontmatter.shell = yaml.shell
    if (typeof yaml.context === 'string') frontmatter.context = yaml.context
    if (typeof yaml.agent === 'string') frontmatter.agent = yaml.agent
    if (typeof yaml.model === 'string') frontmatter.model = yaml.model
    if (typeof yaml.whenToUse === 'string') frontmatter.whenToUse = yaml.whenToUse
    if (typeof yaml.when_to_use === 'string') frontmatter.whenToUse = yaml.when_to_use as string
    if (typeof yaml.userInvocable === 'boolean') frontmatter.userInvocable = yaml.userInvocable
    if (typeof yaml.user_invocable === 'boolean') frontmatter.userInvocable = yaml.user_invocable as boolean

    if (Array.isArray(yaml.allowedTools)) {
      frontmatter.allowedTools = (yaml.allowedTools as unknown[]).map(String)
    } else if (Array.isArray(yaml.allowed_tools)) {
      frontmatter.allowedTools = (yaml.allowed_tools as unknown[]).map(String)
    }

    if (Array.isArray(yaml.paths)) {
      frontmatter.paths = (yaml.paths as unknown[]).map(String)
    }

    return { frontmatter, content, rawContent }
  }

  // ── Discovery ────────────────────────────────────────────────────────────

  /**
   * Scan all subdirs of skills dir, parse SKILL.md from each.
   * Returns map of skillName -> ParsedSkill (failures are silently skipped).
   */
  discoverSkills(): Map<string, ParsedSkill & { dirPath: string }> {
    this.ensureSkillsDir()
    const result = new Map<string, ParsedSkill & { dirPath: string }>()

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.skillsDir, { withFileTypes: true })
    } catch {
      return result
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = path.join(this.skillsDir, entry.name)
      try {
        const skill = this.loadSkillFromDir(dirPath)
        result.set(entry.name, { ...skill, dirPath })
      } catch {
        // Silently skip malformed skill dirs
      }
    }

    return result
  }

  /**
   * Load and parse SKILL.md from a specific directory.
   */
  loadSkillFromDir(dirPath: string): ParsedSkill {
    const skillMdPath = path.join(dirPath, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`SKILL.md introuvable dans : ${dirPath}`)
    }
    const rawContent = fs.readFileSync(skillMdPath, 'utf-8')
    return this.parseSkillContent(rawContent)
  }

  // ── Installation ─────────────────────────────────────────────────────────

  /**
   * Clone a git repo with --depth 1 to a temp directory.
   * Returns { success, tempDir } or { success: false, error }.
   */
  /**
   * Parse a GitHub URL to extract repo URL, branch, and subpath.
   * Handles: https://github.com/user/repo/tree/branch/path/to/dir
   * Returns: { repoUrl, branch?, subpath? }
   */
  parseGitHubUrl(gitUrl: string): { repoUrl: string; branch?: string; subpath?: string } {
    // Match: https://github.com/owner/repo/tree/branch/optional/path
    const treeMatch = gitUrl.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+)\/tree\/([^/]+)(?:\/(.+))?$/)
    if (treeMatch) {
      return {
        repoUrl: treeMatch[1],
        branch: treeMatch[2],
        subpath: treeMatch[3] ?? undefined
      }
    }

    // Match: https://github.com/owner/repo (with optional .git and trailing slash)
    const repoMatch = gitUrl.match(/^(https:\/\/github\.com\/[^/]+\/[^/]+?)(?:\.git)?\/?$/)
    if (repoMatch) {
      return { repoUrl: repoMatch[1] }
    }

    // Fallback: use as-is
    return { repoUrl: gitUrl }
  }

  cloneRepo(gitUrl: string): { success: true; tempDir: string } | { success: false; error: string } {
    const { repoUrl, branch, subpath } = this.parseGitHubUrl(gitUrl)
    const tempDir = path.join('/tmp', `cruchot-skill-${randomUUID()}`)

    try {
      const branchArg = branch ? `--branch ${JSON.stringify(branch)}` : ''
      execSync(`git clone --depth 1 ${branchArg} ${JSON.stringify(repoUrl)} ${JSON.stringify(tempDir)}`, {
        timeout: 60_000,
        stdio: 'pipe'
      })

      // If the URL pointed to a subpath, return that subpath as the skill dir
      const skillDir = subpath ? path.join(tempDir, subpath) : tempDir
      if (subpath && !fs.existsSync(skillDir)) {
        try { execSync(`trash ${JSON.stringify(tempDir)}`, { stdio: 'pipe' }) } catch {}
        return { success: false, error: `Sous-dossier "${subpath}" introuvable dans le depot` }
      }

      return { success: true, tempDir: skillDir }
    } catch (err) {
      // Cleanup failed clone attempt
      try {
        execSync(`trash ${JSON.stringify(tempDir)}`, { stdio: 'pipe' })
      } catch {
        // Best-effort cleanup
      }
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `git clone failed: ${message}` }
    }
  }

  /**
   * Validate a skill source directory.
   * Checks SKILL.md presence, parses frontmatter, applies security checks.
   * Returns { success, skillName } or { success: false, error }.
   */
  /** Recursively search for SKILL.md up to maxDepth levels deep. Returns the dir containing it, or null. */
  private findSkillMd(dirPath: string, maxDepth: number): string | null {
    if (maxDepth <= 0) return null
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const subDir = path.join(dirPath, entry.name)
        if (fs.existsSync(path.join(subDir, 'SKILL.md'))) return subDir
        const deeper = this.findSkillMd(subDir, maxDepth - 1)
        if (deeper) return deeper
      }
    } catch { /* unreadable dir */ }
    return null
  }

  validateSkillDir(dirPath: string): { success: true; skillName: string; parsed: ParsedSkill; skillRoot: string } | { success: false; error: string } {
    // Security: resolve real path to prevent symlink traversal
    let resolvedDir: string
    try {
      resolvedDir = fs.realpathSync(dirPath)
    } catch {
      return { success: false, error: `Chemin invalide ou inaccessible : ${dirPath}` }
    }

    // Block access to sensitive system roots
    for (const blocked of BLOCKED_ROOTS) {
      if (resolvedDir.startsWith(blocked + path.sep) || resolvedDir === blocked) {
        return { success: false, error: `Chemin refusé (zone système) : ${resolvedDir}` }
      }
    }

    // Look for SKILL.md: first at root, then search up to 3 levels deep
    let skillRoot = resolvedDir
    const skillMdPath = path.join(resolvedDir, 'SKILL.md')
    if (!fs.existsSync(skillMdPath)) {
      const found = this.findSkillMd(resolvedDir, 3)
      if (!found) {
        return { success: false, error: `SKILL.md introuvable dans : ${resolvedDir}` }
      }
      skillRoot = found
    }

    try {
      const parsed = this.loadSkillFromDir(skillRoot)
      return { success: true, skillName: parsed.frontmatter.name, parsed, skillRoot }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  }

  /**
   * Install a skill from sourceDir into ~/.cruchot/skills/<skillName>/.
   * Uses cpSync, then trashes the .git/ subdirectory inside the destination.
   */
  installSkill(sourceDir: string, skillName: string): SkillInstallResult {
    this.ensureSkillsDir()

    // Sanitize skillName to a safe directory name
    const safeName = skillName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[-.]/, '').slice(0, 64)
    if (!safeName) {
      return { success: false, error: `Nom de skill invalide : ${skillName}` }
    }

    const destDir = path.join(this.skillsDir, safeName)

    try {
      // Copy source to destination
      fs.cpSync(sourceDir, destDir, { recursive: true, force: true })

      // Remove .git directory inside destination (security + space)
      const gitDir = path.join(destDir, '.git')
      if (fs.existsSync(gitDir)) {
        try {
          execSync(`trash ${JSON.stringify(gitDir)}`, { stdio: 'pipe' })
        } catch {
          // Fallback: rmdir recursive if trash unavailable
          fs.rmSync(gitDir, { recursive: true, force: true })
        }
      }

      return { success: true, skillName: safeName }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Installation échouée : ${message}` }
    }
  }

  /**
   * Uninstall a skill by trashing its directory in ~/.cruchot/skills/<skillName>/.
   */
  uninstallSkill(skillName: string): SkillInstallResult {
    const safeName = path.basename(skillName) // Prevent path traversal
    const skillDir = path.join(this.skillsDir, safeName)

    // Security: resolve and verify it's within skillsDir
    let resolvedDir: string
    try {
      resolvedDir = fs.realpathSync(skillDir)
    } catch {
      return { success: false, error: `Skill introuvable : ${skillName}` }
    }

    if (!resolvedDir.startsWith(this.skillsDir + path.sep)) {
      return { success: false, error: `Chemin hors du répertoire skills : ${skillName}` }
    }

    try {
      execSync(`trash ${JSON.stringify(resolvedDir)}`, { stdio: 'pipe' })
      return { success: true, skillName: safeName }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Désinstallation échouée : ${message}` }
    }
  }

  // ── File tree ────────────────────────────────────────────────────────────

  /**
   * Build a filtered file tree for a skill directory.
   * Excludes: __*, .git, node_modules, .DS_Store, .pyc, .o, .so, .dll
   * Sorted: directories first, then files, alphabetically.
   */
  getSkillTree(skillName: string): SkillTreeNode[] {
    const safeName = path.basename(skillName)
    const skillDir = path.join(this.skillsDir, safeName)

    if (!fs.existsSync(skillDir)) {
      return []
    }

    return this.buildTree(skillDir)
  }

  private buildTree(dirPath: string): SkillTreeNode[] {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true })
    } catch {
      return []
    }

    const dirs: SkillTreeNode[] = []
    const files: SkillTreeNode[] = []

    for (const entry of entries) {
      const name = entry.name

      // Exclude __* patterns
      if (name.startsWith('__')) continue

      // Exclude known dirs/files
      if (TREE_EXCLUDE_NAMES.has(name)) continue

      // Exclude by extension
      const ext = path.extname(name).toLowerCase()
      if (TREE_EXCLUDE_EXTENSIONS.has(ext)) continue

      if (entry.isDirectory()) {
        const children = this.buildTree(path.join(dirPath, name))
        dirs.push({ name, type: 'directory', children })
      } else if (entry.isFile()) {
        let size: number | undefined
        try {
          const stat = fs.statSync(path.join(dirPath, name))
          size = stat.size
        } catch {
          // Size unavailable — omit
        }
        files.push({ name, type: 'file', size })
      }
    }

    // Sort each group alphabetically
    dirs.sort((a, b) => a.name.localeCompare(b.name))
    files.sort((a, b) => a.name.localeCompare(b.name))

    return [...dirs, ...files]
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  /**
   * Check whether python3 is available in PATH. Result is cached.
   */
  checkPythonAvailable(): boolean {
    if (this.pythonAvailableCache !== null) {
      return this.pythonAvailableCache
    }
    try {
      execSync('which python3', { stdio: 'pipe', timeout: 5_000 })
      this.pythonAvailableCache = true
    } catch {
      this.pythonAvailableCache = false
    }
    return this.pythonAvailableCache
  }

  /**
   * Substitute template variables in a content string.
   * Replaces ${SKILL_DIR} and ${WORKSPACE_PATH}.
   */
  substituteVariables(content: string, skillDir: string, workspacePath: string): string {
    return content
      .replace(/\$\{SKILL_DIR\}/g, skillDir)
      .replace(/\$\{WORKSPACE_PATH\}/g, workspacePath)
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────

export const skillService = new SkillService()
