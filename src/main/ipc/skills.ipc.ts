/**
 * Skills IPC handlers — gestion des packs autonomes (SKILL.md).
 * Validation Zod, clone git, scan Maton, install, toggle, uninstall.
 */
import { ipcMain, shell } from 'electron'
import { execSync } from 'node:child_process'
import { join } from 'path'
import { z } from 'zod'
import { skillService } from '../services/skill.service'
import { matonService } from '../services/skill-maton.service'
import {
  createSkill,
  listSkills,
  getSkillByName,
  toggleSkill,
  deleteSkill,
  getSkillById
} from '../db/queries/skills'

// ── Schemas ──────────────────────────────────────────────────────────────

const dirPathSchema = z.object({
  dirPath: z.string().min(1).max(2000)
})

const gitUrlSchema = z.object({
  gitUrl: z.string().url().min(5).max(500)
})

const confirmInstallSchema = z.object({
  tempDir: z.string().min(1).max(2000).optional(),
  localDir: z.string().min(1).max(2000).optional(),
  gitUrl: z.string().url().optional(),
  matonVerdict: z.string().nullable().optional(),
  matonReport: z.record(z.string(), z.unknown()).nullable().optional()
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

// ── Helper: cleanup temp dir ──────────────────────────────────────────────

/** Cleanup temp dir. If it's a subpath of a /tmp/cruchot-skill-* clone, trash the clone root. */
function cleanupTemp(tempDir: string): void {
  try {
    // Find the clone root (/tmp/cruchot-skill-<uuid>)
    const cloneRootMatch = tempDir.match(/^(\/tmp\/cruchot-skill-[a-f0-9-]+)/)
    const target = cloneRootMatch ? cloneRootMatch[1] : tempDir
    execSync(`trash ${JSON.stringify(target)}`, { stdio: 'pipe' })
  } catch {
    // Best-effort cleanup
  }
}

// ── Register ──────────────────────────────────────────────────────────────

export function registerSkillsIpc(): void {
  // ── skills:list ────────────────────────────────────────────────────────
  ipcMain.handle('skills:list', async () => {
    return listSkills()
  })

  // ── skills:validate ────────────────────────────────────────────────────
  ipcMain.handle('skills:validate', async (_event, payload: unknown) => {
    const parsed = dirPathSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const result = skillService.validateSkillDir(parsed.data.dirPath)
    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Check name conflict
    const existing = getSkillByName(result.skillName)
    if (existing) {
      return {
        success: false,
        error: `Un skill nommé "${result.skillName}" est déjà installé`
      }
    }

    return {
      success: true,
      name: result.skillName,
      description: result.parsed.frontmatter.description
    }
  })

  // ── skills:scan ────────────────────────────────────────────────────────
  ipcMain.handle('skills:scan', async (_event, payload: unknown) => {
    const parsed = dirPathSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    return matonService.scan(parsed.data.dirPath)
  })

  // ── skills:install-git ─────────────────────────────────────────────────
  ipcMain.handle('skills:install-git', async (_event, payload: unknown) => {
    const parsed = gitUrlSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const { gitUrl } = parsed.data
    let tempDir: string | undefined

    try {
      // 1. Clone to /tmp
      const cloneResult = skillService.cloneRepo(gitUrl)
      if (!cloneResult.success) {
        return { success: false, error: cloneResult.error }
      }
      tempDir = cloneResult.tempDir

      // 2. Validate
      const validation = skillService.validateSkillDir(tempDir)
      if (!validation.success) {
        cleanupTemp(tempDir)
        return { success: false, error: validation.error }
      }

      const { skillName, parsed: parsedSkill, skillRoot } = validation

      // 3. Check name conflict
      const existing = getSkillByName(skillName)
      if (existing) {
        cleanupTemp(tempDir)
        return {
          success: false,
          error: `Un skill nommé "${skillName}" est déjà installé`
        }
      }

      // 4. Scan with Maton (scan the skill root, not the clone root)
      const scanResult = await matonService.scan(skillRoot)

      let matonVerdict: string | null = null
      let matonReport: Record<string, unknown> | null = null
      let pythonMissing = false

      if (scanResult.success) {
        matonVerdict = scanResult.report.verdict
        matonReport = scanResult.report as unknown as Record<string, unknown>
      } else if (scanResult.pythonMissing) {
        pythonMissing = true
      }

      // 5. Return scan result (confirm-install will do the actual install)
      // skillRoot is the dir containing SKILL.md (may differ from tempDir for monorepos)
      return {
        success: true,
        phase: 'scanned',
        tempDir: skillRoot,
        name: skillName,
        description: parsedSkill.frontmatter.description,
        matonVerdict,
        matonReport,
        pythonMissing
      }
    } catch (err) {
      if (tempDir) cleanupTemp(tempDir)
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ── skills:confirm-install ─────────────────────────────────────────────
  ipcMain.handle('skills:confirm-install', async (_event, payload: unknown) => {
    const parsed = confirmInstallSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const { tempDir, localDir, gitUrl, matonVerdict, matonReport } = parsed.data
    const sourceDir = tempDir ?? localDir
    if (!sourceDir) throw new Error('sourceDir manquant (tempDir ou localDir requis)')

    // 1. Re-validate (TOCTOU protection)
    const validation = skillService.validateSkillDir(sourceDir)
    if (!validation.success) {
      if (tempDir) cleanupTemp(tempDir)
      throw new Error(validation.error)
    }

    const { skillName, parsed: parsedSkill, skillRoot } = validation

    // 2. Re-check conflict
    const existing = getSkillByName(skillName)
    if (existing) {
      if (tempDir) cleanupTemp(tempDir)
      throw new Error(`Un skill nommé "${skillName}" est déjà installé`)
    }

    // 3. Install skill from skillRoot (the dir containing SKILL.md) to ~/.cruchot/skills/<skillName>/
    const installResult = skillService.installSkill(skillRoot, skillName)
    if (!installResult.success) {
      if (tempDir) cleanupTemp(tempDir)
      throw new Error(installResult.error ?? 'Installation échouée')
    }

    // 4. Create skill entry in DB
    const source: 'local' | 'git' | 'barda' = gitUrl ? 'git' : 'local'
    const skill = createSkill({
      name: installResult.skillName ?? skillName,
      description: parsedSkill.frontmatter.description,
      allowedTools: parsedSkill.frontmatter.allowedTools,
      shell: parsedSkill.frontmatter.shell,
      effort: parsedSkill.frontmatter.effort,
      argumentHint: parsedSkill.frontmatter.argumentHint,
      userInvocable: parsedSkill.frontmatter.userInvocable,
      source,
      gitUrl: gitUrl ?? undefined,
      matonVerdict: matonVerdict ?? null,
      matonReport: matonReport ?? null
    })

    // 5. Cleanup temp dir
    if (tempDir) cleanupTemp(tempDir)

    // 6. Reset Maton cache (new skill may be Maton itself)
    matonService.resetCache()

    return skill
  })

  // ── skills:toggle ──────────────────────────────────────────────────────
  ipcMain.handle('skills:toggle', async (_event, payload: unknown) => {
    const parsed = toggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    toggleSkill(parsed.data.id, parsed.data.enabled)
  })

  // ── skills:uninstall ───────────────────────────────────────────────────
  ipcMain.handle('skills:uninstall', async (_event, payload: unknown) => {
    const parsed = idSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const skill = getSkillById(parsed.data.id)
    if (!skill) throw new Error('Skill introuvable')

    // Uninstall from filesystem
    const uninstallResult = skillService.uninstallSkill(skill.name)
    if (!uninstallResult.success) {
      throw new Error(uninstallResult.error ?? 'Désinstallation échouée')
    }

    // Delete from DB
    deleteSkill(parsed.data.id)
  })

  // ── skills:get-tree ────────────────────────────────────────────────────
  ipcMain.handle('skills:get-tree', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    return skillService.getSkillTree(parsed.data.name)
  })

  // ── skills:get-content ─────────────────────────────────────────────────
  ipcMain.handle('skills:get-content', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const skillDir = join(skillService.getSkillsDir(), parsed.data.name)

    try {
      const parsedSkill = skillService.loadSkillFromDir(skillDir)
      return {
        content: parsedSkill.content,
        frontmatter: parsedSkill.frontmatter
      }
    } catch {
      return null
    }
  })

  // ── skills:open-finder ─────────────────────────────────────────────────
  ipcMain.handle('skills:open-finder', async (_event, payload: unknown) => {
    const parsed = nameSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const skillDir = join(skillService.getSkillsDir(), parsed.data.name)
    await shell.openPath(skillDir)
  })

  // ── skills:check-python ────────────────────────────────────────────────
  ipcMain.handle('skills:check-python', async () => {
    return skillService.checkPythonAvailable()
  })

  console.log('[IPC] Skills handlers registered')
}
