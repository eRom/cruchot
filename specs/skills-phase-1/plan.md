# Skills System Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Skills system to Cruchot — installable skill packs (GitHub / local / Barda) invocable in conversations via `/skill-name`, with Maton security scanning at install time.

**Architecture:** Skills are Markdown files with YAML frontmatter (Claude Code compatible format) stored in `~/.cruchot/skills/<name>/`. A new `skills` DB table stores metadata. Skills are invoked via slash commands, their content injected as `<skill-context>` XML in the system prompt. Shell blocks execute via Seatbelt. Maton (Python subprocess) scans skills before installation.

**Tech Stack:** Drizzle ORM (SQLite), Zod validation, React + Zustand, Seatbelt (macOS sandbox), child_process (git clone + Python), YAML regex parsing.

**Spec:** `specs/skills-phase-1/design.md`

---

## File Structure

### Files to Create

| File | Responsibility |
|------|---------------|
| `src/main/db/queries/skills.ts` | CRUD queries for skills table |
| `src/main/services/skill.service.ts` | SkillService singleton: frontmatter parsing, install, discovery, shell exec |
| `src/main/services/skill-maton.service.ts` | MatonService singleton: Python subprocess wrapper |
| `src/main/ipc/skills.ipc.ts` | ~10 IPC handlers with Zod validation |
| `src/main/llm/skill-prompt.ts` | `<skill-context>` XML injection + variable substitution + shell block execution |
| `src/renderer/src/stores/skills.store.ts` | Zustand store for skills list |
| `src/renderer/src/components/skills/SkillsView.tsx` | Grid view + detail view |
| `src/renderer/src/components/skills/SkillCard.tsx` | Individual skill card |
| `src/renderer/src/components/skills/SkillInstallDialog.tsx` | Install dialog (GitHub URL / local folder + Maton report) |

### Files to Modify

| File | Change |
|------|--------|
| `src/main/db/schema.ts` | +`skills` table (26th Drizzle table) |
| `src/main/db/migrate.ts` | +CREATE TABLE + 3 indexes |
| `src/main/db/queries/cleanup.ts` | +DELETE skills in `deleteResourcesByNamespace()` |
| `src/main/db/queries/bardas.ts` | +`skillsCount` in barda insert/update |
| `src/main/ipc/index.ts` | +`registerSkillsIpc()` |
| `src/main/ipc/chat.ipc.ts` | +skill branch: load, parse, shell exec, synthetic chunk, inject |
| `src/main/services/barda-parser.service.ts` | +parse `## Skills` section |
| `src/main/services/barda-import.service.ts` | +import skills in transaction |
| `src/preload/index.ts` | +~10 skill methods |
| `src/preload/types.ts` | +SkillInfo, MatonReport, SkillInstallResult types |
| `src/renderer/src/stores/ui.store.ts` | +`'skills'` in CustomizeTab |
| `src/renderer/src/components/customize/CustomizeView.tsx` | +Skills tab + lazy import |
| `src/renderer/src/hooks/useSlashCommands.ts` | +merge enabled skills into dropdown |
| `src/renderer/src/components/chat/MessageItem.tsx` | +render synthetic chunk "Skill: name" |

---

## Task 1: Database — Schema, Migration, Queries

**Files:**
- Modify: `src/main/db/schema.ts` (after `bardas` table, ~line 461)
- Modify: `src/main/db/migrate.ts` (after workspace migration, ~line 478)
- Create: `src/main/db/queries/skills.ts`
- Modify: `src/main/db/queries/cleanup.ts` (in `deleteResourcesByNamespace`)

- [ ] **Step 1: Add `skills` table to schema.ts**

Add after the `bardas` table definition (~line 461):

```typescript
// ---------------------------------------------------------------------------
// Skills (Installable Skill Packs)
// ---------------------------------------------------------------------------
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  allowedTools: text('allowed_tools', { mode: 'json' }).$type<string[]>(),
  shell: text('shell').default('bash'),
  effort: text('effort'),
  argumentHint: text('argument_hint'),
  userInvocable: integer('user_invocable', { mode: 'boolean' }).default(true),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  source: text('source', { enum: ['local', 'git', 'barda'] }).notNull(),
  gitUrl: text('git_url'),
  namespace: text('namespace'),
  matonVerdict: text('maton_verdict'),
  matonReport: text('maton_report', { mode: 'json' }).$type<Record<string, unknown>>(),
  installedAt: integer('installed_at').notNull()
})
```

- [ ] **Step 2: Add CREATE TABLE + indexes in migrate.ts**

Add before the closing `}` of `runMigrations()` (~line 478):

```typescript
  // --- Skills system (S46) ---
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      allowed_tools TEXT,
      shell TEXT DEFAULT 'bash',
      effort TEXT,
      argument_hint TEXT,
      user_invocable INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      source TEXT NOT NULL CHECK(source IN ('local', 'git', 'barda')),
      git_url TEXT,
      namespace TEXT,
      maton_verdict TEXT,
      maton_report TEXT,
      installed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace);
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  `)
```

- [ ] **Step 3: Create skills queries**

Create `src/main/db/queries/skills.ts`:

```typescript
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { getDatabase } from '..'
import { skills } from '../schema'

export interface CreateSkillData {
  name: string
  description?: string
  allowedTools?: string[]
  shell?: string
  effort?: string
  argumentHint?: string
  userInvocable?: boolean
  source: 'local' | 'git' | 'barda'
  gitUrl?: string
  namespace?: string
  matonVerdict?: string | null
  matonReport?: Record<string, unknown> | null
}

export function createSkill(data: CreateSkillData) {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  db.insert(skills).values({
    id,
    name: data.name,
    description: data.description ?? null,
    allowedTools: data.allowedTools ?? null,
    shell: data.shell ?? 'bash',
    effort: data.effort ?? null,
    argumentHint: data.argumentHint ?? null,
    userInvocable: data.userInvocable ?? true,
    enabled: true,
    source: data.source,
    gitUrl: data.gitUrl ?? null,
    namespace: data.namespace ?? null,
    matonVerdict: data.matonVerdict ?? null,
    matonReport: data.matonReport ?? null,
    installedAt: now
  }).run()
  return getSkillById(id)!
}

export function listSkills() {
  const db = getDatabase()
  return db.select().from(skills).orderBy(skills.name).all()
}

export function listEnabledSkills() {
  const db = getDatabase()
  return db.select().from(skills)
    .where(eq(skills.enabled, true))
    .orderBy(skills.name)
    .all()
}

export function getSkillById(id: string) {
  const db = getDatabase()
  return db.select().from(skills).where(eq(skills.id, id)).get() ?? null
}

export function getSkillByName(name: string) {
  const db = getDatabase()
  return db.select().from(skills).where(eq(skills.name, name)).get() ?? null
}

export function toggleSkill(id: string, enabled: boolean) {
  const db = getDatabase()
  db.update(skills).set({ enabled }).where(eq(skills.id, id)).run()
}

export function deleteSkill(id: string) {
  const db = getDatabase()
  db.delete(skills).where(eq(skills.id, id)).run()
}

export function deleteSkillsByNamespace(namespace: string) {
  const db = getDatabase()
  db.delete(skills).where(eq(skills.namespace, namespace)).run()
}

export function updateSkillMetadata(id: string, data: Partial<Pick<CreateSkillData, 'description' | 'allowedTools' | 'shell' | 'effort' | 'argumentHint' | 'userInvocable'>>) {
  const db = getDatabase()
  db.update(skills).set(data).where(eq(skills.id, id)).run()
}
```

- [ ] **Step 4: Add skills cleanup in deleteResourcesByNamespace**

In `src/main/db/queries/cleanup.ts`, inside `deleteResourcesByNamespace()`, add after the `mcp_servers` delete:

```typescript
  // Skills
  db.delete(skills).where(eq(skills.namespace, namespace)).run()
```

Add the import at the top:
```typescript
import { skills } from '../schema'
```

- [ ] **Step 5: Verify — restart app, check table exists**

Run: `npm run dev` — app should start without DB errors. Check in SQLite that `skills` table exists with the correct columns.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/schema.ts src/main/db/migrate.ts src/main/db/queries/skills.ts src/main/db/queries/cleanup.ts
git commit -m "feat(skills): add skills table, queries, and cleanup"
```

---

## Task 2: SkillService — Frontmatter Parsing, Discovery, Installation

**Files:**
- Create: `src/main/services/skill.service.ts`

- [ ] **Step 1: Create SkillService with frontmatter parsing**

Create `src/main/services/skill.service.ts`:

```typescript
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, cpSync, realpathSync } from 'fs'
import { join, basename } from 'path'
import crypto from 'crypto'
import { execSync } from 'child_process'

// ── Types ──────────────────────────────────────────────────

export interface ParsedFrontmatter {
  name: string
  description?: string
  allowedTools?: string[]
  argumentHint?: string
  userInvocable?: boolean
  effort?: string
  shell?: string
  // Parsed but ignored in phase 1
  context?: string
  agent?: string
  paths?: string[]
  model?: string
  whenToUse?: string
}

export interface ParsedSkill {
  frontmatter: ParsedFrontmatter
  content: string         // Markdown body (without frontmatter)
  rawContent: string      // Full file content
}

export interface SkillInstallResult {
  success: boolean
  skillName?: string
  error?: string
}

// ── Constants ──────────────────────────────────────────────

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/
const SKILLS_DIR_NAME = 'skills'
const SKILL_FILE = 'SKILL.md'

// Tree filter patterns
const TREE_EXCLUDE_DIRS = new Set([
  '__pycache__', '.git', 'node_modules', '.DS_Store',
  '.cache', '.venv', '__init__', '__main__'
])
const TREE_EXCLUDE_EXTENSIONS = new Set([
  '.pyc', '.pyo', '.o', '.so', '.dll', '.dylib', '.class'
])

// ── Service ────────────────────────────────────────────────

class SkillService {
  private skillsDir: string
  private pythonAvailable: boolean | null = null

  constructor() {
    const home = process.env.HOME ?? '/tmp'
    this.skillsDir = join(home, '.cruchot', SKILLS_DIR_NAME)
  }

  /** Ensure ~/.cruchot/skills/ exists. Called at app startup. */
  ensureSkillsDir(): void {
    if (!existsSync(this.skillsDir)) {
      mkdirSync(this.skillsDir, { recursive: true })
    }
  }

  getSkillsDir(): string {
    return this.skillsDir
  }

  // ── Frontmatter Parsing ─────────────────────────────────

  parseFrontmatter(content: string): ParsedSkill | null {
    const match = content.match(FRONTMATTER_REGEX)
    if (!match) return null

    const yamlBlock = match[1]
    const body = content.slice(match[0].length).trim()

    const frontmatter = this.parseYamlSimple(yamlBlock)
    if (!frontmatter || !frontmatter.name) return null

    return {
      frontmatter: {
        name: String(frontmatter.name),
        description: frontmatter.description ? String(frontmatter.description) : undefined,
        allowedTools: this.parseAllowedTools(frontmatter['allowed-tools']),
        argumentHint: frontmatter['argument-hint'] ? String(frontmatter['argument-hint']) : undefined,
        userInvocable: frontmatter['user-invocable'] !== undefined
          ? String(frontmatter['user-invocable']).toLowerCase() === 'true'
          : true,
        effort: frontmatter.effort ? String(frontmatter.effort) : undefined,
        shell: frontmatter.shell ? String(frontmatter.shell) : 'bash',
        // Forward-compat (parsed but ignored phase 1)
        context: frontmatter.context ? String(frontmatter.context) : undefined,
        agent: frontmatter.agent ? String(frontmatter.agent) : undefined,
        model: frontmatter.model ? String(frontmatter.model) : undefined,
        whenToUse: frontmatter.when_to_use ? String(frontmatter.when_to_use) : undefined,
        paths: frontmatter.paths ? this.parsePaths(frontmatter.paths) : undefined,
      },
      content: body,
      rawContent: content
    }
  }

  /** Simple YAML parser (key: value) — avoids external dependency */
  private parseYamlSimple(yaml: string): Record<string, unknown> | null {
    try {
      const result: Record<string, unknown> = {}
      const lines = yaml.split('\n')
      let currentKey: string | null = null
      let multilineValue = ''
      let inMultiline = false

      for (const line of lines) {
        // Multiline continuation (indented)
        if (inMultiline && (line.startsWith('  ') || line.startsWith('\t'))) {
          multilineValue += (multilineValue ? '\n' : '') + line.trim()
          continue
        }
        if (inMultiline && currentKey) {
          result[currentKey] = multilineValue.trim()
          inMultiline = false
          currentKey = null
          multilineValue = ''
        }

        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const colonIdx = trimmed.indexOf(':')
        if (colonIdx === -1) continue

        const key = trimmed.slice(0, colonIdx).trim()
        let value = trimmed.slice(colonIdx + 1).trim()

        // Handle YAML multiline indicators
        if (value === '|' || value === '>') {
          currentKey = key
          inMultiline = true
          multilineValue = ''
          continue
        }

        // Handle array syntax [a, b, c]
        if (value.startsWith('[') && value.endsWith(']')) {
          const inner = value.slice(1, -1)
          result[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
          continue
        }

        // Handle YAML list syntax (- item)
        if (value === '') {
          // Check for list items on following lines
          const items: string[] = []
          const startIdx = lines.indexOf(line)
          for (let i = startIdx + 1; i < lines.length; i++) {
            const nextLine = lines[i].trim()
            if (nextLine.startsWith('- ')) {
              items.push(nextLine.slice(2).trim().replace(/^["']|["']$/g, ''))
            } else if (nextLine && !nextLine.startsWith('#')) {
              break
            }
          }
          if (items.length > 0) {
            result[key] = items
            continue
          }
        }

        // Strip quotes
        value = value.replace(/^["']|["']$/g, '')

        // Boolean coercion
        if (value === 'true') { result[key] = true; continue }
        if (value === 'false') { result[key] = false; continue }

        result[key] = value
      }

      // Flush last multiline
      if (inMultiline && currentKey) {
        result[currentKey] = multilineValue.trim()
      }

      return result
    } catch {
      return null
    }
  }

  private parseAllowedTools(value: unknown): string[] | undefined {
    if (!value) return undefined
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === 'string') {
      // Handle comma-separated or bracket-enclosed
      const trimmed = value.replace(/^\[|\]$/g, '')
      return trimmed.split(',').map(s => s.trim()).filter(Boolean)
    }
    return undefined
  }

  private parsePaths(value: unknown): string[] | undefined {
    if (!value) return undefined
    if (Array.isArray(value)) return value.map(String)
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
    return undefined
  }

  // ── Skill Loading ───────────────────────────────────────

  /** Load and parse a SKILL.md from a directory */
  loadSkillFromDir(dirPath: string): ParsedSkill | null {
    const skillFile = join(dirPath, SKILL_FILE)
    if (!existsSync(skillFile)) return null

    const content = readFileSync(skillFile, 'utf-8')
    return this.parseFrontmatter(content)
  }

  /** Discover all installed skills from ~/.cruchot/skills/ */
  discoverSkills(): Array<{ dirName: string; parsed: ParsedSkill }> {
    if (!existsSync(this.skillsDir)) return []

    const results: Array<{ dirName: string; parsed: ParsedSkill }> = []
    const entries = readdirSync(this.skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dirPath = join(this.skillsDir, entry.name)
      const parsed = this.loadSkillFromDir(dirPath)
      if (parsed) {
        results.push({ dirName: entry.name, parsed })
      }
    }

    return results
  }

  // ── Installation ────────────────────────────────────────

  /** Clone a git repo to /tmp and return the temp path */
  cloneRepo(gitUrl: string): { success: true; tempDir: string } | { success: false; error: string } {
    const tempDir = join('/tmp', `cruchot-skill-${crypto.randomUUID()}`)
    try {
      execSync(`git clone --depth 1 "${gitUrl}" "${tempDir}"`, {
        timeout: 60_000,
        stdio: 'pipe',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      return { success: true, tempDir }
    } catch (err) {
      return { success: false, error: `Git clone failed: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /** Validate a skill directory: has SKILL.md, parseable frontmatter, returns name */
  validateSkillDir(dirPath: string): { valid: true; parsed: ParsedSkill } | { valid: false; error: string } {
    // Path validation: resolve symlinks
    let resolvedPath: string
    try {
      resolvedPath = realpathSync(dirPath)
    } catch {
      return { valid: false, error: 'Chemin invalide ou inaccessible' }
    }

    const skillFile = join(resolvedPath, SKILL_FILE)
    if (!existsSync(skillFile)) {
      return { valid: false, error: `${SKILL_FILE} introuvable a la racine` }
    }

    const content = readFileSync(skillFile, 'utf-8')
    const parsed = this.parseFrontmatter(content)
    if (!parsed) {
      return { valid: false, error: 'Frontmatter YAML invalide ou champ "name" manquant' }
    }

    return { valid: true, parsed }
  }

  /** Copy a validated skill directory to ~/.cruchot/skills/<name>/ */
  installSkill(sourceDir: string, skillName: string): void {
    const destDir = join(this.skillsDir, skillName)
    if (existsSync(destDir)) {
      throw new Error(`Le dossier ${destDir} existe deja`)
    }
    cpSync(sourceDir, destDir, { recursive: true })

    // Remove .git directory from installed skill (not needed)
    const gitDir = join(destDir, '.git')
    if (existsSync(gitDir)) {
      // Use trash via execSync (Romain's rule: never rm)
      try {
        execSync(`trash "${gitDir}"`, { stdio: 'pipe' })
      } catch {
        // Fallback: leave .git if trash fails (filtered in tree view anyway)
      }
    }
  }

  /** Remove a skill directory */
  uninstallSkill(skillName: string): void {
    const dirPath = join(this.skillsDir, skillName)
    if (!existsSync(dirPath)) return
    execSync(`trash "${dirPath}"`, { stdio: 'pipe' })
  }

  // ── File Tree ───────────────────────────────────────────

  /** Build filtered file tree for a skill directory */
  getSkillTree(skillName: string): SkillTreeNode[] {
    const dirPath = join(this.skillsDir, skillName)
    if (!existsSync(dirPath)) return []
    return this.buildTree(dirPath)
  }

  private buildTree(dirPath: string): SkillTreeNode[] {
    const entries = readdirSync(dirPath, { withFileTypes: true })
    const nodes: FileTreeNode[] = []

    for (const entry of entries) {
      // Filter excluded patterns
      if (entry.name.startsWith('__') || entry.name === '.DS_Store') continue
      if (TREE_EXCLUDE_DIRS.has(entry.name)) continue

      const fullPath = join(dirPath, entry.name)

      if (entry.isDirectory()) {
        const children = this.buildTree(fullPath)
        if (children.length > 0) {
          nodes.push({ name: entry.name, type: 'directory', children })
        }
      } else {
        const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop()! : ''
        if (TREE_EXCLUDE_EXTENSIONS.has(ext)) continue
        const stat = statSync(fullPath)
        nodes.push({ name: entry.name, type: 'file', size: stat.size })
      }
    }

    // Sort: directories first, then files, alphabetically
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  // ── Python Check ────────────────────────────────────────

  checkPythonAvailable(): boolean {
    if (this.pythonAvailable !== null) return this.pythonAvailable
    try {
      execSync('which python3', { stdio: 'pipe', timeout: 5000 })
      this.pythonAvailable = true
    } catch {
      this.pythonAvailable = false
    }
    return this.pythonAvailable
  }

  // ── Variable Substitution ───────────────────────────────

  substituteVariables(content: string, skillDir: string, workspacePath: string): string {
    return content
      .replace(/\$\{SKILL_DIR\}/g, skillDir)
      .replace(/\$\{WORKSPACE_PATH\}/g, workspacePath)
  }
}

export interface SkillTreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillTreeNode[]
}

export const skillService = new SkillService()
```

- [ ] **Step 2: Verify — import and call ensureSkillsDir() in main/index.ts startup**

In `src/main/index.ts`, add after the sandbox directory creation:

```typescript
import { skillService } from './services/skill.service'
// ... in the app.whenReady() block:
skillService.ensureSkillsDir()
```

- [ ] **Step 3: Commit**

```bash
git add src/main/services/skill.service.ts src/main/index.ts
git commit -m "feat(skills): add SkillService with frontmatter parsing, discovery, install"
```

---

## Task 3: MatonService — Python Subprocess Wrapper

**Files:**
- Create: `src/main/services/skill-maton.service.ts`

- [ ] **Step 1: Create MatonService**

Create `src/main/services/skill-maton.service.ts`:

```typescript
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { skillService } from './skill.service'

export interface MatonFinding {
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  category: string
  rule_id: string
  file: string
  line: number
  match: string
  description: string
}

export interface MatonReport {
  source: string
  scan_date: string
  verdict: 'OK' | 'WARNING' | 'CRITICAL'
  summary: {
    critical: number
    warning: number
    info: number
  }
  findings: MatonFinding[]
}

export interface MatonScanResult {
  success: true
  report: MatonReport
} | {
  success: false
  error: string
  pythonMissing?: boolean
}

class MatonService {
  private matonScriptDir: string | null = null

  /** Locate the maton scanner. Returns the scanner module dir or null. */
  private findMaton(): string | null {
    if (this.matonScriptDir !== null) return this.matonScriptDir

    // Look for maton installed as a skill
    const matonSkillDir = join(skillService.getSkillsDir(), 'maton')
    const scannerDir = join(matonSkillDir, 'scripts', 'scanner')

    if (existsSync(join(scannerDir, '__main__.py'))) {
      this.matonScriptDir = scannerDir
      return this.matonScriptDir
    }

    // Fallback: look in /tmp (during install, maton may be the skill being installed)
    this.matonScriptDir = null
    return null
  }

  /** Scan a directory with Maton. Returns structured report or error. */
  scan(targetDir: string): MatonScanResult {
    if (!skillService.checkPythonAvailable()) {
      return { success: false, error: 'Python 3 non disponible', pythonMissing: true }
    }

    const scannerDir = this.findMaton()
    if (!scannerDir) {
      return { success: false, error: 'Maton non installe. Installez d\'abord le skill "maton" depuis GitHub.' }
    }

    try {
      const output = execSync(
        `python3 -m scanner "${targetDir}" --format json`,
        {
          cwd: join(scannerDir, '..'),   // parent of scanner/ (scripts/)
          timeout: 120_000,
          stdio: 'pipe',
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONPATH: join(scannerDir, '..')
          }
        }
      ).toString('utf-8')

      const report = JSON.parse(output) as MatonReport
      return { success: true, report }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Check if it's a Python import error vs actual findings
      if (msg.includes('ModuleNotFoundError') || msg.includes('No module named')) {
        return { success: false, error: `Erreur Maton: ${msg.slice(0, 200)}` }
      }
      // execSync throws on non-zero exit code — Maton returns 1 (WARNING) or 2 (CRITICAL)
      // The stdout still contains valid JSON
      try {
        const stderr = (err as { stderr?: Buffer })?.stderr?.toString('utf-8') ?? ''
        const stdout = (err as { stdout?: Buffer })?.stdout?.toString('utf-8') ?? ''
        if (stdout.startsWith('{')) {
          const report = JSON.parse(stdout) as MatonReport
          return { success: true, report }
        }
        return { success: false, error: `Maton scan failed: ${stderr || msg}`.slice(0, 500) }
      } catch {
        return { success: false, error: `Maton scan failed: ${msg}`.slice(0, 500) }
      }
    }
  }

  /** Reset cached scanner path (e.g., after installing maton skill) */
  resetCache(): void {
    this.matonScriptDir = null
  }
}

export const matonService = new MatonService()
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/skill-maton.service.ts
git commit -m "feat(skills): add MatonService for security scanning"
```

---

## Task 4: skill-prompt.ts — Injection & Shell Execution

**Files:**
- Create: `src/main/llm/skill-prompt.ts`

- [ ] **Step 1: Create skill-prompt.ts**

Create `src/main/llm/skill-prompt.ts`:

```typescript
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { skillService, type ParsedSkill } from '../services/skill.service'
import { execSandboxed } from '../services/seatbelt'

// ── Shell Block Patterns ──────────────────────────────────

const BLOCK_PATTERN = /^!\s*```\s*\n([\s\S]*?)```/gm
const INLINE_PATTERN = /!`([^`]+)`/g

// ── Public API ────────────────────────────────────────────

/**
 * Load, parse, and prepare a skill for injection into the system prompt.
 * Executes shell blocks via Seatbelt, substitutes variables, wraps in XML.
 */
export async function buildSkillContextBlock(
  skillName: string,
  args: string,
  workspacePath: string
): Promise<{ block: string; parsedSkill: ParsedSkill } | null> {
  const skillDir = join(skillService.getSkillsDir(), skillName)
  const skillFile = join(skillDir, 'SKILL.md')

  if (!existsSync(skillFile)) return null

  const rawContent = readFileSync(skillFile, 'utf-8')
  const parsed = skillService.parseFrontmatter(rawContent)
  if (!parsed) return null

  // Substitute variables
  let content = skillService.substituteVariables(parsed.content, skillDir, workspacePath)

  // Execute shell blocks (Seatbelt confined to workspacePath)
  content = await executeShellBlocks(content, workspacePath, parsed.frontmatter.shell ?? 'bash')

  // Wrap in XML
  const sanitizedName = skillName.replace(/["<>&]/g, '')
  let block = `<skill-context name="${sanitizedName}">\n`
  block += sanitizeContent(content)
  if (args.trim()) {
    block += `\n\nARGUMENTS: ${args.trim()}`
  }
  block += '\n</skill-context>'

  return { block, parsedSkill: parsed }
}

// ── Shell Execution ───────────────────────────────────────

async function executeShellBlocks(content: string, workspacePath: string, shell: string): Promise<string> {
  // Process block patterns: ! ``` ... ```
  const blockMatches = [...content.matchAll(BLOCK_PATTERN)]
  for (const match of blockMatches.reverse()) {
    const command = match[1].trim()
    const result = await runShellCommand(command, workspacePath)
    content = content.slice(0, match.index!) + result + content.slice(match.index! + match[0].length)
  }

  // Process inline patterns: !`cmd`
  const inlineMatches = [...content.matchAll(INLINE_PATTERN)]
  for (const match of inlineMatches.reverse()) {
    const command = match[1].trim()
    const result = await runShellCommand(command, workspacePath)
    content = content.slice(0, match.index!) + result + content.slice(match.index! + match[0].length)
  }

  return content
}

async function runShellCommand(command: string, workspacePath: string): Promise<string> {
  try {
    const result = await execSandboxed(command, workspacePath, { timeout: 30_000 })
    let output = ''
    if (result.stdout.trim()) output += result.stdout.trim()
    if (result.stderr.trim()) {
      if (output) output += '\n'
      output += `[stderr]\n${result.stderr.trim()}`
    }
    return output || '(no output)'
  } catch (err) {
    return `[error] ${err instanceof Error ? err.message : String(err)}`
  }
}

function sanitizeContent(s: string): string {
  return s
    .replace(/<\/skill-context>/gi, '&lt;/skill-context&gt;')
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/llm/skill-prompt.ts
git commit -m "feat(skills): add skill-prompt.ts for XML injection and shell execution"
```

---

## Task 5: IPC Handlers + Preload Bridge

**Files:**
- Create: `src/main/ipc/skills.ipc.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/types.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Create skills.ipc.ts**

Create `src/main/ipc/skills.ipc.ts`:

```typescript
import { ipcMain, shell } from 'electron'
import { z } from 'zod'
import { join } from 'path'
import { skillService } from '../services/skill.service'
import { matonService } from '../services/skill-maton.service'
import { createSkill, listSkills, getSkillByName, toggleSkill, deleteSkill, getSkillById } from '../db/queries/skills'

const installGitSchema = z.object({
  gitUrl: z.string().min(1).max(2000).url()
})

const installLocalSchema = z.object({
  dirPath: z.string().min(1).max(2000)
})

const toggleSchema = z.object({
  id: z.string().min(1).max(100),
  enabled: z.boolean()
})

const idSchema = z.object({
  id: z.string().min(1).max(100)
})

const nameSchema = z.object({
  name: z.string().min(1).max(200)
})

export function registerSkillsIpc(): void {

  // ── skills:list ──────────────────────────────────────
  ipcMain.handle('skills:list', async () => {
    return listSkills()
  })

  // ── skills:validate ──────────────────────────────────
  // Validate a local directory (has SKILL.md, valid frontmatter)
  ipcMain.handle('skills:validate', async (_event, payload: unknown) => {
    const parsed = installLocalSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const result = skillService.validateSkillDir(parsed.data.dirPath)
    if (!result.valid) {
      return { success: false, error: result.error }
    }

    // Check conflict
    const existing = getSkillByName(result.parsed.frontmatter.name)
    if (existing) {
      return { success: false, error: `Skill "${result.parsed.frontmatter.name}" deja installe` }
    }

    return {
      success: true,
      name: result.parsed.frontmatter.name,
      description: result.parsed.frontmatter.description ?? ''
    }
  })

  // ── skills:scan ──────────────────────────────────────
  // Run Maton scan on a directory
  ipcMain.handle('skills:scan', async (_event, payload: unknown) => {
    const parsed = installLocalSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    return matonService.scan(parsed.data.dirPath)
  })

  // ── skills:install-git ───────────────────────────────
  // Full flow: clone → validate → scan → install → cleanup
  ipcMain.handle('skills:install-git', async (_event, payload: unknown) => {
    const parsed = installGitSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    // 1. Clone to /tmp
    const cloneResult = skillService.cloneRepo(parsed.data.gitUrl)
    if (!cloneResult.success) {
      return { success: false, error: cloneResult.error }
    }

    try {
      // 2. Validate
      const validation = skillService.validateSkillDir(cloneResult.tempDir)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      const skillName = validation.parsed.frontmatter.name

      // 3. Check conflict
      const existing = getSkillByName(skillName)
      if (existing) {
        return { success: false, error: `Skill "${skillName}" deja installe` }
      }

      // 4. Maton scan
      const scanResult = matonService.scan(cloneResult.tempDir)
      const matonVerdict = scanResult.success ? scanResult.report.verdict : null
      const matonReport = scanResult.success ? scanResult.report : null

      // Return scan result + metadata for UI decision
      return {
        success: true,
        phase: 'scanned' as const,
        tempDir: cloneResult.tempDir,
        name: skillName,
        description: validation.parsed.frontmatter.description ?? '',
        matonVerdict,
        matonReport,
        pythonMissing: !scanResult.success && 'pythonMissing' in scanResult && scanResult.pythonMissing
      }
    } catch (err) {
      // Cleanup on error
      try { require('child_process').execSync(`trash "${cloneResult.tempDir}"`, { stdio: 'pipe' }) } catch { /* best effort */ }
      throw err
    }
  })

  // ── skills:confirm-install ───────────────────────────
  // User confirmed install after seeing Maton report
  ipcMain.handle('skills:confirm-install', async (_event, payload: unknown) => {
    const schema = z.object({
      tempDir: z.string().min(1).optional(),
      localDir: z.string().min(1).optional(),
      gitUrl: z.string().optional(),
      matonVerdict: z.string().nullable().optional(),
      matonReport: z.record(z.unknown()).nullable().optional()
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const sourceDir = parsed.data.tempDir ?? parsed.data.localDir
    if (!sourceDir) throw new Error('Missing source directory')

    // Re-validate (TOCTOU protection)
    const validation = skillService.validateSkillDir(sourceDir)
    if (!validation.valid) throw new Error(validation.error)

    const fm = validation.parsed.frontmatter
    const skillName = fm.name

    // Check conflict again
    const existing = getSkillByName(skillName)
    if (existing) throw new Error(`Skill "${skillName}" deja installe`)

    // Copy to ~/.cruchot/skills/<name>/
    skillService.installSkill(sourceDir, skillName)

    // Insert into DB
    const skill = createSkill({
      name: skillName,
      description: fm.description,
      allowedTools: fm.allowedTools,
      shell: fm.shell,
      effort: fm.effort,
      argumentHint: fm.argumentHint,
      userInvocable: fm.userInvocable,
      source: parsed.data.gitUrl ? 'git' : 'local',
      gitUrl: parsed.data.gitUrl,
      matonVerdict: (parsed.data.matonVerdict as string) ?? null,
      matonReport: (parsed.data.matonReport as Record<string, unknown>) ?? null
    })

    // Cleanup temp dir
    if (parsed.data.tempDir) {
      try { require('child_process').execSync(`trash "${parsed.data.tempDir}"`, { stdio: 'pipe' }) } catch { /* best effort */ }
    }

    // Reset Maton cache in case maton itself was just installed
    matonService.resetCache()

    return skill
  })

  // ── skills:toggle ────────────────────────────────────
  ipcMain.handle('skills:toggle', async (_event, payload: unknown) => {
    const parsed = toggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')
    toggleSkill(parsed.data.id, parsed.data.enabled)
  })

  // ── skills:uninstall ─────────────────────────────────
  ipcMain.handle('skills:uninstall', async (_event, payload: unknown) => {
    const parsed = idSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const skill = getSkillById(parsed.data.id)
    if (!skill) throw new Error('Skill introuvable')

    // Remove from filesystem
    skillService.uninstallSkill(skill.name)

    // Remove from DB
    deleteSkill(parsed.data.id)
  })

  // ── skills:get-tree ──────────────────────────────────
  ipcMain.handle('skills:get-tree', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')
    return skillService.getSkillTree(parsed.data.name)
  })

  // ── skills:get-content ───────────────────────────────
  // Get the SKILL.md content (without frontmatter) for preview
  ipcMain.handle('skills:get-content', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const skill = skillService.loadSkillFromDir(
      join(skillService.getSkillsDir(), parsed.data.name)
    )
    if (!skill) return null
    return { content: skill.content, frontmatter: skill.frontmatter }
  })

  // ── skills:open-finder ───────────────────────────────
  ipcMain.handle('skills:open-finder', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')
    const dirPath = join(skillService.getSkillsDir(), parsed.data.name)
    shell.openPath(dirPath)
  })

  // ── skills:check-python ──────────────────────────────
  ipcMain.handle('skills:check-python', async () => {
    return skillService.checkPythonAvailable()
  })
}
```

- [ ] **Step 2: Register in ipc/index.ts**

Add import and call in `src/main/ipc/index.ts`:

```typescript
import { registerSkillsIpc } from './skills.ipc'
```

In `registerAllIpcHandlers()`, add after the `registerBardaHandlers()` call:

```typescript
  // ── Skills ──────────────────────────────────────────────
  registerSkillsIpc()
```

- [ ] **Step 3: Add types in preload/types.ts**

Add after the Barda types:

```typescript
// ── Skills ───────────────────────────────────────────────

export interface SkillInfo {
  id: string
  name: string
  description: string | null
  allowedTools: string[] | null
  shell: string | null
  effort: string | null
  argumentHint: string | null
  userInvocable: boolean | null
  enabled: boolean | null
  source: 'local' | 'git' | 'barda'
  gitUrl: string | null
  namespace: string | null
  matonVerdict: string | null
  matonReport: Record<string, unknown> | null
  installedAt: number
}

export interface SkillTreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillTreeNode[]
}

export interface SkillScanResult {
  success: boolean
  phase?: 'scanned'
  tempDir?: string
  name?: string
  description?: string
  matonVerdict?: string | null
  matonReport?: Record<string, unknown> | null
  pythonMissing?: boolean
  error?: string
}

export interface SkillValidationResult {
  success: boolean
  name?: string
  description?: string
  error?: string
}
```

- [ ] **Step 4: Add preload methods in preload/index.ts**

Add in the `api` object, after the barda methods:

```typescript
  // ── Skills ──────────────────────────────────────────────
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsValidate: (dirPath: string) => ipcRenderer.invoke('skills:validate', { dirPath }),
  skillsScan: (dirPath: string) => ipcRenderer.invoke('skills:scan', { dirPath }),
  skillsInstallGit: (gitUrl: string) => ipcRenderer.invoke('skills:install-git', { gitUrl }),
  skillsConfirmInstall: (data: { tempDir?: string; localDir?: string; gitUrl?: string; matonVerdict?: string | null; matonReport?: Record<string, unknown> | null }) =>
    ipcRenderer.invoke('skills:confirm-install', data),
  skillsToggle: (id: string, enabled: boolean) => ipcRenderer.invoke('skills:toggle', { id, enabled }),
  skillsUninstall: (id: string) => ipcRenderer.invoke('skills:uninstall', { id }),
  skillsGetTree: (name: string) => ipcRenderer.invoke('skills:get-tree', { name }),
  skillsGetContent: (name: string) => ipcRenderer.invoke('skills:get-content', { name }),
  skillsOpenFinder: (name: string) => ipcRenderer.invoke('skills:open-finder', { name }),
  skillsCheckPython: () => ipcRenderer.invoke('skills:check-python'),
```

Add the corresponding type signatures in the `ElectronAPI` interface in `preload/types.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/skills.ipc.ts src/main/ipc/index.ts src/preload/index.ts src/preload/types.ts
git commit -m "feat(skills): add IPC handlers and preload bridge"
```

---

## Task 6: Chat Integration — Skill Invocation & Injection

**Files:**
- Modify: `src/main/ipc/chat.ipc.ts`
- Modify: `src/preload/types.ts` (SendMessagePayload)

- [ ] **Step 1: Add skillName to SendMessagePayload**

In `src/preload/types.ts`, add to `SendMessagePayload`:

```typescript
  skillName?: string
  skillArgs?: string
```

In `src/main/ipc/chat.ipc.ts`, add to `sendMessageSchema`:

```typescript
  skillName: z.string().max(200).optional(),
  skillArgs: z.string().max(10_000).optional(),
```

- [ ] **Step 2: Add skill branch in handleChatMessage**

In `src/main/ipc/chat.ipc.ts`, add the import at top:

```typescript
import { buildSkillContextBlock } from '../llm/skill-prompt'
import { getSkillByName } from '../db/queries/skills'
```

After the library retrieval block (~line 299, before "Build combined system prompt"), add:

```typescript
    // Skill injection (if invoked via /skill-name)
    let skillContextBlock = ''
    const skillName = (params as { skillName?: string }).skillName
    const skillArgs = (params as { skillArgs?: string }).skillArgs ?? ''
    if (skillName) {
      const dbSkill = getSkillByName(skillName)
      if (dbSkill && dbSkill.enabled) {
        const toolCallId = `skill-invoke-${Date.now()}`

        // Send synthetic tool-call chunk
        win.webContents.send('chat:chunk', {
          type: 'tool-call',
          toolName: 'skill',
          toolArgs: { name: skillName },
          toolCallId
        })

        try {
          const result = await buildSkillContextBlock(skillName, skillArgs, resolvedWorkspacePath)
          if (result) {
            skillContextBlock = result.block
          }
          // Send synthetic tool-result (success)
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: 'skill',
            toolCallId,
            toolIsError: false
          })
        } catch (err) {
          console.warn('[Chat] Skill execution failed:', err)
          win.webContents.send('chat:chunk', {
            type: 'tool-result',
            toolName: 'skill',
            toolCallId,
            toolIsError: true
          })
        }
      }
    }
```

- [ ] **Step 3: Inject skill context in system prompt assembly**

In the "Build combined system prompt" section (~line 302), add skill context after the role system prompt and before workspace context:

```typescript
    if (skillContextBlock) {
      if (combinedSystemPrompt) combinedSystemPrompt += '\n\n'
      combinedSystemPrompt += skillContextBlock
    }
```

The order should be: libraryContextBlock → semanticMemoryBlock → memoryBlock → systemPrompt (role) → **skillContextBlock**.

- [ ] **Step 4: Add skillName/skillArgs to HandleChatMessageParams**

In `HandleChatMessageParams` interface:

```typescript
  skillName?: string
  skillArgs?: string
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/chat.ipc.ts src/preload/types.ts
git commit -m "feat(skills): integrate skill invocation in chat flow"
```

---

## Task 7: Slash Commands — Merge Skills in Dropdown

**Files:**
- Modify: `src/renderer/src/hooks/useSlashCommands.ts`

- [ ] **Step 1: Add skills to the hook**

In `src/renderer/src/hooks/useSlashCommands.ts`, add import:

```typescript
import { useSkillsStore } from '@/stores/skills.store'
```

Inside `useSlashCommands()`, add after the `commands` line:

```typescript
  const enabledSkills = useSkillsStore((s) => s.skills.filter(sk => sk.enabled && sk.userInvocable))
```

In the `availableCommands` useMemo, add a new block after action commands:

```typescript
    // Skills (from skills store)
    for (const skill of enabledSkills) {
      if (!seen.has(skill.name)) {
        result.push({
          command: {
            id: `__skill_${skill.name}`,
            name: skill.name,
            description: skill.description ?? 'Skill',
            prompt: '',  // Not used — skills are handled differently
            isBuiltin: false,
            sortOrder: 100,
            createdAt: new Date(skill.installedAt * 1000),
            updatedAt: new Date(skill.installedAt * 1000)
          } as SlashCommand,
          isProjectScoped: false,
          isSkill: true
        })
        seen.add(skill.name)
      }
    }
```

Add `enabledSkills` to the useMemo dependencies.

- [ ] **Step 2: Update SlashCommandMatch interface**

```typescript
interface SlashCommandMatch {
  command: SlashCommand
  isProjectScoped: boolean
  isAction?: boolean
  isSkill?: boolean
}
```

- [ ] **Step 3: Handle skill resolution in resolve**

In the `resolve` function, add before the normal return:

```typescript
      if (match.isSkill) {
        return { prompt: argString.trim(), commandName: match.command.name, isSkill: true }
      }
```

Update the return type:

```typescript
  resolve: (content: string) => { prompt: string; commandName: string; isAction?: boolean; isSkill?: boolean } | null
```

- [ ] **Step 4: Handle skill dispatch in InputZone.tsx**

In the `InputZone.tsx` send handler, where slash commands are resolved, add a branch for skills:

```typescript
if (resolved.isSkill) {
  // Send with skillName instead of content
  sendMessage({
    ...payload,
    content: `/${resolved.commandName} ${resolved.prompt}`.trim(),
    skillName: resolved.commandName,
    skillArgs: resolved.prompt
  })
  return
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useSlashCommands.ts src/renderer/src/components/chat/InputZone.tsx
git commit -m "feat(skills): merge skills into slash commands dropdown"
```

---

## Task 8: Renderer — Skills Store + SkillsView + SkillCard

**Files:**
- Create: `src/renderer/src/stores/skills.store.ts`
- Create: `src/renderer/src/components/skills/SkillsView.tsx`
- Create: `src/renderer/src/components/skills/SkillCard.tsx`

- [ ] **Step 1: Create skills.store.ts**

Create `src/renderer/src/stores/skills.store.ts`:

```typescript
import { create } from 'zustand'
import type { SkillInfo } from '../../../../preload/types'

interface SkillsStore {
  skills: SkillInfo[]
  isLoading: boolean

  loadSkills: () => Promise<void>
  toggleSkill: (id: string, enabled: boolean) => Promise<void>
  uninstallSkill: (id: string) => Promise<void>
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  isLoading: false,

  loadSkills: async () => {
    set({ isLoading: true })
    try {
      const skills = await window.api.skillsList()
      set({ skills })
    } finally {
      set({ isLoading: false })
    }
  },

  toggleSkill: async (id: string, enabled: boolean) => {
    await window.api.skillsToggle(id, enabled)
    await get().loadSkills()
  },

  uninstallSkill: async (id: string) => {
    await window.api.skillsUninstall(id)
    await get().loadSkills()
  }
}))
```

- [ ] **Step 2: Create SkillCard.tsx**

Create `src/renderer/src/components/skills/SkillCard.tsx`:

```typescript
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Trash2 } from 'lucide-react'
import type { SkillInfo } from '../../../../../preload/types'

interface SkillCardProps {
  skill: SkillInfo
  onToggle: (id: string, enabled: boolean) => void
  onDelete: (id: string) => void
  onClick: (skill: SkillInfo) => void
}

const VERDICT_COLORS: Record<string, string> = {
  OK: 'bg-green-500',
  WARNING: 'bg-orange-500',
  CRITICAL: 'bg-red-500'
}

const SOURCE_COLORS: Record<string, string> = {
  git: 'bg-blue-500/20 text-blue-400',
  local: 'bg-muted text-muted-foreground',
  barda: 'bg-purple-500/20 text-purple-400'
}

export function SkillCard({ skill, onToggle, onDelete, onClick }: SkillCardProps) {
  return (
    <div
      className="group flex cursor-pointer items-start gap-3 rounded-lg border border-border/40 bg-sidebar p-4 transition-colors hover:border-border"
      onClick={() => onClick(skill)}
    >
      {/* Maton verdict dot */}
      <div className="mt-1.5 shrink-0">
        <div className={`size-2.5 rounded-full ${skill.matonVerdict ? VERDICT_COLORS[skill.matonVerdict] ?? 'bg-muted-foreground' : 'bg-muted-foreground/40'}`} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-foreground">{skill.name}</span>
          <Badge variant="secondary" className={`shrink-0 text-[10px] ${SOURCE_COLORS[skill.source] ?? ''}`}>
            {skill.source === 'barda' && skill.namespace ? `Barda: ${skill.namespace}` : skill.source}
          </Badge>
        </div>
        {skill.description && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Switch
          checked={skill.enabled ?? true}
          onCheckedChange={(checked) => onToggle(skill.id, checked)}
        />
        <button
          onClick={() => onDelete(skill.id)}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create SkillsView.tsx**

Create `src/renderer/src/components/skills/SkillsView.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { Plus, ArrowLeft, FolderOpen, ChevronRight, File, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSkillsStore } from '@/stores/skills.store'
import { SkillCard } from './SkillCard'
import { SkillInstallDialog } from './SkillInstallDialog'
import { toast } from 'sonner'
import type { SkillInfo, SkillTreeNode } from '../../../../../preload/types'

type SubView = 'grid' | 'detail'

export function SkillsView() {
  const { skills, isLoading, loadSkills, toggleSkill, uninstallSkill } = useSkillsStore()
  const [subView, setSubView] = useState<SubView>('grid')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [tree, setTree] = useState<SkillTreeNode[]>([])
  const [skillContent, setSkillContent] = useState<string>('')

  useEffect(() => { loadSkills() }, [loadSkills])

  const handleDelete = async (id: string) => {
    const skill = skills.find(s => s.id === id)
    if (!skill) return
    if (!confirm(`Supprimer le skill "${skill.name}" ?`)) return
    try {
      await uninstallSkill(id)
      toast.success(`Skill "${skill.name}" supprime`)
      if (selectedSkill?.id === id) {
        setSubView('grid')
        setSelectedSkill(null)
      }
    } catch (err) {
      toast.error(`Erreur: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleDetail = async (skill: SkillInfo) => {
    setSelectedSkill(skill)
    setSubView('detail')
    // Load tree and content
    const [treeData, contentData] = await Promise.all([
      window.api.skillsGetTree(skill.name),
      window.api.skillsGetContent(skill.name)
    ])
    setTree(treeData ?? [])
    setSkillContent(contentData?.content ?? '')
  }

  // ── Grid View ──
  if (subView === 'grid') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-8 pb-5 pt-8">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-foreground">Skills</h1>
            <Button size="sm" onClick={() => setShowInstall(true)}>
              <Plus className="mr-1.5 size-4" /> Ajouter un skill
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {skills.length} skill{skills.length !== 1 ? 's' : ''} installe{skills.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {skills.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p>Aucun skill installe</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowInstall(true)}>
                Installer un skill
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={toggleSkill}
                  onDelete={handleDelete}
                  onClick={handleDetail}
                />
              ))}
            </div>
          )}
        </div>

        {showInstall && (
          <SkillInstallDialog
            onClose={() => setShowInstall(false)}
            onInstalled={() => { loadSkills(); setShowInstall(false) }}
          />
        )}
      </div>
    )
  }

  // ── Detail View ──
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-8 pb-4 pt-8">
        <button
          onClick={() => { setSubView('grid'); setSelectedSkill(null) }}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Retour
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{selectedSkill?.name}</h1>
            {selectedSkill?.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{selectedSkill.description}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { if (selectedSkill) window.api.skillsOpenFinder(selectedSkill.name) }}
          >
            <FolderOpen className="mr-1.5 size-4" /> Ouvrir dans Finder
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {/* Metadata */}
        {selectedSkill && (
          <div className="mb-6 rounded-lg border border-border/40 bg-sidebar p-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">Metadata</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-muted-foreground">Source</div>
              <div>{selectedSkill.source}{selectedSkill.gitUrl ? ` (${selectedSkill.gitUrl})` : ''}</div>
              {selectedSkill.shell && <><div className="text-muted-foreground">Shell</div><div>{selectedSkill.shell}</div></>}
              {selectedSkill.effort && <><div className="text-muted-foreground">Effort</div><div>{selectedSkill.effort}</div></>}
              {selectedSkill.allowedTools && <><div className="text-muted-foreground">Tools</div><div>{(selectedSkill.allowedTools as string[]).join(', ')}</div></>}
              <div className="text-muted-foreground">Verdict Maton</div>
              <div>{selectedSkill.matonVerdict ?? 'Non scanne'}</div>
            </div>
          </div>
        )}

        {/* File Tree */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-foreground">Fichiers</h3>
          <div className="rounded-lg border border-border/40 bg-sidebar p-3 font-mono text-xs">
            {tree.length > 0 ? (
              <TreeView nodes={tree} />
            ) : (
              <span className="text-muted-foreground">Chargement...</span>
            )}
          </div>
        </div>

        {/* SKILL.md Preview */}
        {skillContent && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-foreground">Contenu SKILL.md</h3>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-border/40 bg-sidebar p-4">
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{skillContent}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tree Component ──

function TreeView({ nodes, depth = 0 }: { nodes: SkillTreeNode[]; depth?: number }) {
  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {nodes.map((node) => (
        <div key={node.name}>
          <div className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
            {node.type === 'directory' ? (
              <Folder className="size-3.5 text-blue-400" />
            ) : (
              <File className="size-3.5" />
            )}
            <span className={node.type === 'directory' ? 'text-foreground' : ''}>{node.name}</span>
            {node.size !== undefined && (
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {node.size < 1024 ? `${node.size}B` : `${(node.size / 1024).toFixed(1)}K`}
              </span>
            )}
          </div>
          {node.children && <TreeView nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/stores/skills.store.ts src/renderer/src/components/skills/SkillsView.tsx src/renderer/src/components/skills/SkillCard.tsx
git commit -m "feat(skills): add SkillsView, SkillCard, and skills store"
```

---

## Task 9: SkillInstallDialog

**Files:**
- Create: `src/renderer/src/components/skills/SkillInstallDialog.tsx`

- [ ] **Step 1: Create SkillInstallDialog.tsx**

Create `src/renderer/src/components/skills/SkillInstallDialog.tsx`:

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Loader2, AlertTriangle, CheckCircle, ShieldAlert, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  onClose: () => void
  onInstalled: () => void
}

type InstallState =
  | { step: 'input' }
  | { step: 'cloning' }
  | { step: 'scanning' }
  | { step: 'scanned'; tempDir: string; name: string; description: string; matonVerdict: string | null; matonReport: Record<string, unknown> | null; gitUrl: string; pythonMissing: boolean }
  | { step: 'installing' }
  | { step: 'error'; message: string }

export function SkillInstallDialog({ onClose, onInstalled }: Props) {
  const [gitUrl, setGitUrl] = useState('')
  const [state, setState] = useState<InstallState>({ step: 'input' })

  const handleGitInstall = async () => {
    if (!gitUrl.trim()) return
    setState({ step: 'cloning' })

    try {
      const result = await window.api.skillsInstallGit(gitUrl.trim())
      if (!result.success) {
        setState({ step: 'error', message: result.error ?? 'Erreur inconnue' })
        return
      }
      setState({
        step: 'scanned',
        tempDir: result.tempDir!,
        name: result.name!,
        description: result.description ?? '',
        matonVerdict: result.matonVerdict ?? null,
        matonReport: result.matonReport ?? null,
        gitUrl: gitUrl.trim(),
        pythonMissing: result.pythonMissing ?? false
      })
    } catch (err) {
      setState({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleLocalInstall = async () => {
    try {
      const result = await window.api.filePick?.() // uses dialog.showOpenDialog
      if (!result?.length) return

      const dirPath = result[0].path ?? result[0]
      setState({ step: 'scanning' })

      // Validate
      const validation = await window.api.skillsValidate(dirPath)
      if (!validation.success) {
        setState({ step: 'error', message: validation.error ?? 'Dossier invalide' })
        return
      }

      // Scan
      const scanResult = await window.api.skillsScan(dirPath)
      const matonVerdict = scanResult.success ? scanResult.report?.verdict ?? null : null
      const matonReport = scanResult.success ? scanResult.report ?? null : null

      setState({
        step: 'scanned',
        tempDir: '',
        name: validation.name!,
        description: validation.description ?? '',
        matonVerdict,
        matonReport,
        gitUrl: '',
        pythonMissing: !scanResult.success && scanResult.pythonMissing
      })

      // For local: confirm install directly pointing to original dir
      // Store dirPath for confirm step
      ;(setState as unknown as (fn: (s: InstallState) => InstallState) => void)((s: InstallState) =>
        s.step === 'scanned' ? { ...s, tempDir: dirPath } : s
      )
    } catch (err) {
      setState({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const handleConfirmInstall = async () => {
    if (state.step !== 'scanned') return
    setState({ step: 'installing' })

    try {
      await window.api.skillsConfirmInstall({
        tempDir: state.gitUrl ? state.tempDir : undefined,
        localDir: !state.gitUrl ? state.tempDir : undefined,
        gitUrl: state.gitUrl || undefined,
        matonVerdict: state.matonVerdict,
        matonReport: state.matonReport
      })
      toast.success(`Skill "${state.name}" installe`)
      onInstalled()
    } catch (err) {
      setState({ step: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const verdictIcon = (verdict: string | null, pythonMissing: boolean) => {
    if (pythonMissing) return <ShieldOff className="size-5 text-muted-foreground" />
    if (!verdict) return <ShieldOff className="size-5 text-muted-foreground" />
    if (verdict === 'OK') return <CheckCircle className="size-5 text-green-500" />
    if (verdict === 'WARNING') return <AlertTriangle className="size-5 text-orange-500" />
    return <ShieldAlert className="size-5 text-red-500" />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold">Installer un skill</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="size-4" /></button>
        </div>

        {/* Input step */}
        {state.step === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Depuis GitHub</label>
              <div className="flex gap-2">
                <Input
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/skill-repo"
                  onKeyDown={(e) => e.key === 'Enter' && handleGitInstall()}
                />
                <Button onClick={handleGitInstall} disabled={!gitUrl.trim()}>Cloner</Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={handleLocalInstall}>
              Choisir un dossier local
            </Button>
          </div>
        )}

        {/* Loading states */}
        {(state.step === 'cloning' || state.step === 'scanning' || state.step === 'installing') && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {state.step === 'cloning' && 'Clonage du depot...'}
              {state.step === 'scanning' && 'Scan de securite...'}
              {state.step === 'installing' && 'Installation...'}
            </span>
          </div>
        )}

        {/* Scanned — show result */}
        {state.step === 'scanned' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/40 bg-sidebar p-4">
              <div className="flex items-start gap-3">
                {verdictIcon(state.matonVerdict, state.pythonMissing)}
                <div className="flex-1">
                  <div className="font-medium text-foreground">{state.name}</div>
                  {state.description && <p className="mt-0.5 text-xs text-muted-foreground">{state.description}</p>}
                  <div className="mt-2 text-xs">
                    {state.pythonMissing && <span className="text-muted-foreground">Python non disponible — scan impossible</span>}
                    {state.matonVerdict === 'OK' && <span className="text-green-500">Aucune menace detectee</span>}
                    {state.matonVerdict === 'WARNING' && <span className="text-orange-500">
                      {(state.matonReport as { summary?: { warning?: number } })?.summary?.warning ?? 0} avertissement(s)
                    </span>}
                    {state.matonVerdict === 'CRITICAL' && <span className="text-red-500">
                      {(state.matonReport as { summary?: { critical?: number } })?.summary?.critical ?? 0} menace(s) critique(s)
                    </span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setState({ step: 'input' })}>Annuler</Button>
              <Button
                onClick={handleConfirmInstall}
                disabled={state.matonVerdict === 'CRITICAL'}
                variant={state.matonVerdict === 'WARNING' ? 'outline' : 'default'}
                className={state.matonVerdict === 'WARNING' ? 'border-orange-500 text-orange-500 hover:bg-orange-500/10' : ''}
              >
                {state.matonVerdict === 'WARNING' ? 'Installer quand meme' : 'Installer'}
              </Button>
            </div>
          </div>
        )}

        {/* Error */}
        {state.step === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              {state.message}
            </div>
            <Button variant="outline" onClick={() => setState({ step: 'input' })}>Reessayer</Button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/skills/SkillInstallDialog.tsx
git commit -m "feat(skills): add SkillInstallDialog with Maton scan UI"
```

---

## Task 10: CustomizeView — Add Skills Tab

**Files:**
- Modify: `src/renderer/src/stores/ui.store.ts`
- Modify: `src/renderer/src/components/customize/CustomizeView.tsx`

- [ ] **Step 1: Add 'skills' to CustomizeTab**

In `src/renderer/src/stores/ui.store.ts`, update the type:

```typescript
export type CustomizeTab = 'prompts' | 'roles' | 'mcp' | 'memory' | 'commands' | 'libraries' | 'skills' | 'brigade'
```

- [ ] **Step 2: Add Skills tab in CustomizeView.tsx**

Add lazy import:

```typescript
const SkillsView = React.lazy(() => import('@/components/skills/SkillsView').then(m => ({ default: m.SkillsView })))
```

Add `Wand2` (or `Sparkles`) to the lucide imports:

```typescript
import { ArrowLeft, BookOpen, Brain, Library, Network, Shield, Sparkles, TerminalSquare, UserCircle } from 'lucide-react'
```

In the `TABS` array, add before the MCP separator:

```typescript
  { type: 'tab', id: 'skills' as CustomizeTab, label: 'Skills', icon: <Sparkles className="size-4" /> },
```

The order should be: Prompts, Roles, Commandes | Memoire, Referentiels, **Skills** | MCP, Brigade.

In the Suspense content, add:

```typescript
            {activeTab === 'skills' && <SkillsView />}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts src/renderer/src/components/customize/CustomizeView.tsx
git commit -m "feat(skills): add Skills tab in CustomizeView"
```

---

## Task 11: MessageItem — Synthetic Skill Chunk Rendering

**Files:**
- Modify: `src/renderer/src/components/chat/MessageItem.tsx`

- [ ] **Step 1: Add skill tool rendering**

In `MessageItem.tsx`, find where `toolName === 'librarySearch'` is handled in the tool call rendering. Add a similar block for `toolName === 'skill'`:

```typescript
if (toolCall.toolName === 'skill') {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Sparkles className="size-3.5" />
      <span>Skill: {toolCall.args?.name ?? 'inconnu'}</span>
    </div>
  )
}
```

Import `Sparkles` from lucide-react if not already imported.

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/chat/MessageItem.tsx
git commit -m "feat(skills): render synthetic skill chunk in message tools"
```

---

## Task 12: Barda Integration — Parse & Import Skills

**Files:**
- Modify: `src/main/services/barda-parser.service.ts`
- Modify: `src/main/services/barda-import.service.ts`
- Modify: `src/main/db/queries/bardas.ts`
- Modify: `src/main/db/schema.ts` (bardas table: +skillsCount)

- [ ] **Step 1: Add skills to barda parser**

In `src/main/services/barda-parser.service.ts`:

Add `skills` to `ParsedBardaInternal`:
```typescript
  skills: Array<{ name: string; content: string }>
```

Add to `KNOWN_SECTIONS`:
```typescript
  'Skills': 'skills',
```

Initialize in `parse()`:
```typescript
  result.skills = []
```

The existing section/subsection splitting logic will handle `## Skills` / `### skill-name` automatically.

- [ ] **Step 2: Add skills to barda import**

In `src/main/services/barda-import.service.ts`, after the MCP import block:

```typescript
      // Import skills
      for (const skillDef of parsed.skills) {
        const existingSkill = getSkillByName(`${namespace}:${skillDef.name}`)
        if (existingSkill) {
          skips.push({ type: 'Skill', name: skillDef.name, reason: 'Skill deja installe' })
          continue
        }

        // Parse source URL from content (first line: "- source: https://...")
        const sourceMatch = skillDef.content.match(/^-\s*source:\s*(.+)$/m)
        if (!sourceMatch) {
          warnings.push(`Skill ${skillDef.name}: source manquante`)
          continue
        }

        const source = sourceMatch[1].trim()
        const isGit = source.startsWith('http://') || source.startsWith('https://')

        try {
          let sourceDir: string
          let tempDir: string | null = null

          if (isGit) {
            const cloneResult = skillService.cloneRepo(source)
            if (!cloneResult.success) {
              warnings.push(`Skill ${skillDef.name}: ${cloneResult.error}`)
              continue
            }
            sourceDir = cloneResult.tempDir
            tempDir = cloneResult.tempDir
          } else {
            sourceDir = source
          }

          // Validate
          const validation = skillService.validateSkillDir(sourceDir)
          if (!validation.valid) {
            warnings.push(`Skill ${skillDef.name}: ${validation.error}`)
            if (tempDir) try { execSync(`trash "${tempDir}"`, { stdio: 'pipe' }) } catch {}
            continue
          }

          // Maton scan
          const scanResult = matonService.scan(sourceDir)
          if (scanResult.success && scanResult.report.verdict === 'CRITICAL') {
            warnings.push(`Skill ${skillDef.name}: menaces critiques detectees, non installe`)
            if (tempDir) try { execSync(`trash "${tempDir}"`, { stdio: 'pipe' }) } catch {}
            continue
          }

          // Install
          const skillName = `${namespace}:${validation.parsed.frontmatter.name}`
          skillService.installSkill(sourceDir, skillName)

          createSkill({
            name: skillName,
            description: validation.parsed.frontmatter.description,
            allowedTools: validation.parsed.frontmatter.allowedTools,
            shell: validation.parsed.frontmatter.shell,
            effort: validation.parsed.frontmatter.effort,
            argumentHint: validation.parsed.frontmatter.argumentHint,
            userInvocable: validation.parsed.frontmatter.userInvocable,
            source: 'barda',
            gitUrl: isGit ? source : undefined,
            namespace,
            matonVerdict: scanResult.success ? scanResult.report.verdict : null,
            matonReport: scanResult.success ? scanResult.report : null
          })

          succes.push(`Skill: ${skillName}`)

          // Cleanup temp
          if (tempDir) try { execSync(`trash "${tempDir}"`, { stdio: 'pipe' }) } catch {}
        } catch (err) {
          warnings.push(`Skill ${skillDef.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
```

Add necessary imports:
```typescript
import { skillService } from './skill.service'
import { matonService } from './skill-maton.service'
import { createSkill, getSkillByName } from '../db/queries/skills'
import { execSync } from 'child_process'
```

- [ ] **Step 3: Add skillsCount to bardas schema**

In `src/main/db/schema.ts`, add to the `bardas` table:
```typescript
  skillsCount: integer('skills_count').default(0),
```

In `src/main/db/migrate.ts`, add a migration:
```typescript
  try { sqlite.exec('ALTER TABLE bardas ADD COLUMN skills_count INTEGER DEFAULT 0') } catch {}
```

Update the barda INSERT in `barda-import.service.ts` to include:
```typescript
  skillsCount: parsed.skills.length,
```

- [ ] **Step 4: Update preload types**

In `src/preload/types.ts`, add `skillsCount` to `BardaInfo`:
```typescript
  skillsCount: number
```

Add `skills` to `ParsedBarda`:
```typescript
  skills: ParsedResource[]
```

- [ ] **Step 5: Commit**

```bash
git add src/main/services/barda-parser.service.ts src/main/services/barda-import.service.ts src/main/db/queries/bardas.ts src/main/db/schema.ts src/main/db/migrate.ts src/preload/types.ts
git commit -m "feat(skills): integrate skills in Barda parser and import"
```

---

## Task 13: Sync Skills at Startup

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add startup sync**

In `src/main/index.ts`, after `skillService.ensureSkillsDir()`, add:

```typescript
  // Sync installed skills with DB
  const discoveredSkills = skillService.discoverSkills()
  const { listSkills, createSkill, getSkillByName, deleteSkill } = await import('./db/queries/skills')
  const dbSkills = listSkills()
  const dbSkillNames = new Set(dbSkills.map(s => s.name))
  const fsSkillNames = new Set(discoveredSkills.map(s => s.parsed.frontmatter.name))

  // Add skills found on filesystem but not in DB
  for (const { parsed } of discoveredSkills) {
    if (!dbSkillNames.has(parsed.frontmatter.name)) {
      createSkill({
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        allowedTools: parsed.frontmatter.allowedTools,
        shell: parsed.frontmatter.shell,
        effort: parsed.frontmatter.effort,
        argumentHint: parsed.frontmatter.argumentHint,
        userInvocable: parsed.frontmatter.userInvocable,
        source: 'local'
      })
    }
  }

  // Remove DB entries for skills no longer on filesystem (except barda-managed)
  for (const dbSkill of dbSkills) {
    if (!fsSkillNames.has(dbSkill.name) && dbSkill.source !== 'barda') {
      deleteSkill(dbSkill.id)
    }
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(skills): sync filesystem skills with DB at startup"
```

---

## Task 14: End-to-End Testing

- [ ] **Step 1: Install maton skill from GitHub**

In Cruchot, go to Personnaliser > Skills > "Ajouter un skill". Paste `https://github.com/eRom/claude-skill-maton` and click "Cloner". The scan should show itself as OK (Maton scans Maton). Install it.

- [ ] **Step 2: Install frontend-design skill**

Install `https://github.com/anthropics/skills` — note: this is a monorepo, so the SKILL.md may not be at the root. If it fails validation, clone manually and point to the `skills/frontend-design` subfolder via local install.

- [ ] **Step 3: Test slash command invocation**

In a conversation, type `/maton` and verify:
- The skill appears in the autocomplete dropdown
- Selecting it sends the message with `skillName`
- The "Skill: maton" synthetic chunk appears in the tools used
- The LLM receives the skill prompt context

- [ ] **Step 4: Test toggle and uninstall**

In Personnaliser > Skills:
- Toggle a skill OFF → verify it disappears from the slash dropdown
- Toggle it back ON → verify it reappears
- Uninstall → verify the card disappears and the directory is trashed

- [ ] **Step 5: Test Barda integration**

Create a test barda .md with a `## Skills` section, import it, verify the skill is installed with the barda namespace.

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat(skills): Skills system phase 1 complete"
```
