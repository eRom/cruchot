import { readFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, dirname, relative, sep, normalize } from 'path'
import { app } from 'electron'
import matter from 'gray-matter'

// ── Types ────────────────────────────────────────────────

export interface SkillInfo {
  name: string
  description: string
  content: string
  source: 'global' | 'project'
  location: string
  baseDir: string
  companionFiles: string[]
}

// ── Constants ────────────────────────────────────────────

const SKILL_NAME_REGEX = /^[a-z][a-z0-9-]{0,49}$/
const MAX_CONTENT_SIZE = 200_000 // 200KB
const SKILLS_DIR = '.multi-llm/skills'

// ── SkillService ─────────────────────────────────────────

class SkillService {
  private cache = new Map<string, SkillInfo>()
  private globalDir: string

  constructor() {
    this.globalDir = join(app.getPath('home'), SKILLS_DIR)
  }

  /**
   * Initialize: create global skills directory if missing, scan global skills.
   */
  init(): void {
    if (!existsSync(this.globalDir)) {
      mkdirSync(this.globalDir, { recursive: true })
    }
    this.scanAll()
  }

  /**
   * Scan global + optional project skills. Project overrides global on name conflict.
   */
  scanAll(workspaceRoot?: string): SkillInfo[] {
    this.cache.clear()

    // 1. Scan global
    const globalSkills = this.scanDirectory(this.globalDir, 'global')
    for (const skill of globalSkills) {
      this.cache.set(skill.name, skill)
    }

    // 2. Scan project (higher priority — overwrites global)
    if (workspaceRoot) {
      const projectDir = join(workspaceRoot, SKILLS_DIR)
      if (existsSync(projectDir)) {
        const projectSkills = this.scanDirectory(projectDir, 'project')
        for (const skill of projectSkills) {
          this.cache.set(skill.name, skill)
        }
      }
    }

    return this.getAll()
  }

  get(name: string): SkillInfo | undefined {
    return this.cache.get(name)
  }

  getAll(): SkillInfo[] {
    return Array.from(this.cache.values())
  }

  refresh(workspaceRoot?: string): SkillInfo[] {
    return this.scanAll(workspaceRoot)
  }

  // ── Internal ────────────────────────────────────────────

  private scanDirectory(dir: string, source: 'global' | 'project'): SkillInfo[] {
    const results: SkillInfo[] = []
    if (!existsSync(dir)) return results

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillDir = join(dir, entry.name)
        const skillFile = join(skillDir, 'SKILL.md')
        if (!existsSync(skillFile)) continue

        const skill = this.parseSkillFile(skillFile, source)
        if (skill) results.push(skill)
      }
    } catch (err) {
      console.warn(`[Skills] Failed to scan directory ${dir}:`, err)
    }

    return results
  }

  private parseSkillFile(filePath: string, source: 'global' | 'project'): SkillInfo | null {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      if (raw.length > MAX_CONTENT_SIZE) {
        console.warn(`[Skills] Skipped ${filePath}: content exceeds 200KB`)
        return null
      }

      const { data, content } = matter(raw)

      // Validate name
      const name = typeof data.name === 'string' ? data.name : ''
      if (!SKILL_NAME_REGEX.test(name)) {
        console.warn(`[Skills] Skipped ${filePath}: invalid name "${name}" (must match ${SKILL_NAME_REGEX})`)
        return null
      }

      // Validate description
      const description = typeof data.description === 'string' ? data.description : ''
      if (!description) {
        console.warn(`[Skills] Skipped ${filePath}: missing description`)
        return null
      }

      const baseDir = dirname(filePath)

      // Path security: no .. allowed
      const normalizedBase = normalize(baseDir)
      if (normalizedBase.includes('..')) {
        console.warn(`[Skills] Skipped ${filePath}: path contains '..'`)
        return null
      }

      // Scan companion files
      const companionFiles = this.scanCompanionFiles(baseDir)

      return {
        name,
        description,
        content: content.trim(),
        source,
        location: filePath,
        baseDir,
        companionFiles
      }
    } catch (err) {
      console.warn(`[Skills] Failed to parse ${filePath}:`, err)
      return null
    }
  }

  private scanCompanionFiles(baseDir: string): string[] {
    const files: string[] = []
    this.walkDir(baseDir, baseDir, files)
    return files
  }

  private walkDir(currentDir: string, baseDir: string, files: string[]): void {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name)
        const relPath = relative(baseDir, fullPath)

        // Security: no .. in relative paths
        if (relPath.includes('..')) continue

        if (entry.isDirectory()) {
          this.walkDir(fullPath, baseDir, files)
        } else {
          // Exclude SKILL.md and LICENSE files
          const upper = entry.name.toUpperCase()
          if (upper === 'SKILL.MD' || upper.startsWith('LICENSE')) continue
          files.push(relPath.split(sep).join('/'))
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }
}

export const skillService = new SkillService()
