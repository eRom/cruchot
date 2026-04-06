/**
 * BardaImportService — Importe un pack Barda parse dans la base de donnees.
 * Transaction atomique, verification namespace unique, limite fragments.
 */
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { eq, sql } from 'drizzle-orm'
import { getDatabase } from '../db/index'
import {
  bardas,
  roles,
  slashCommands,
  prompts,
  memoryFragments,
  libraries,
  mcpServers
} from '../db/schema'
import {
  getBardaByNamespace,
  countActiveFragments
} from '../db/queries/bardas'
import { createSkill, getSkillByName } from '../db/queries/skills'
import { skillService } from './skill.service'
import { matonService } from './skill-maton.service'
import type { ParsedBardaInternal } from './barda-parser.service'

// ── Types ────────────────────────────────────────────────

export interface BardaImportReport {
  bardaId: string
  succes: string[]
  skips: Array<{ type: string; name: string; reason: string }>
  warnings: string[]
}

// ── Service ──────────────────────────────────────────────

class BardaImportService {
  async import(parsed: ParsedBardaInternal): Promise<BardaImportReport> {
    const db = getDatabase()
    const report = db.transaction(() => {
      // 1. Verifier namespace unique (INSIDE transaction to prevent TOCTOU)
      const existing = getBardaByNamespace(parsed.metadata.namespace)
      if (existing) {
        throw new Error(`Le namespace "${parsed.metadata.namespace}" est deja utilise`)
      }

      // 2. Verifier capacite memory fragments
      const activeCount = countActiveFragments()
      if (activeCount + parsed.fragments.length > 50) {
        throw new Error(
          `Limite de 50 fragments depasee (${activeCount} actifs + ${parsed.fragments.length} nouveaux)`
        )
      }

      const succes: string[] = []
      const skips: Array<{ type: string; name: string; reason: string }> = []
      const warnings: string[] = []
      const now = new Date()
      const namespace = parsed.metadata.namespace

      // INSERT barda
      const bardaId = crypto.randomUUID()
      db.insert(bardas).values({
        id: bardaId,
        namespace,
        name: parsed.metadata.name,
        description: parsed.metadata.description ?? null,
        version: parsed.metadata.version ?? null,
        author: parsed.metadata.author ?? null,
        isEnabled: true,
        rolesCount: parsed.roles.length,
        commandsCount: parsed.commands.length,
        promptsCount: parsed.prompts.length,
        fragmentsCount: parsed.fragments.length,
        librariesCount: parsed.libraries.length,
        mcpServersCount: parsed.mcp.length,
        skillsCount: parsed.skills.length,
        createdAt: now,
        updatedAt: now
      }).run()

      // INSERT roles
      for (const role of parsed.roles) {
        db.insert(roles).values({
          id: crypto.randomUUID(),
          name: `${namespace}:${role.name}`,
          systemPrompt: role.content,
          namespace,
          isBuiltin: false,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`Role: ${namespace}:${role.name}`)
      }

      // INSERT slash_commands
      for (const cmd of parsed.commands) {
        db.insert(slashCommands).values({
          id: crypto.randomUUID(),
          name: `${namespace}:${cmd.name}`,
          description: cmd.name,
          prompt: cmd.content,
          namespace,
          isBuiltin: false,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`Command: /${namespace}:${cmd.name}`)
      }

      // INSERT prompts
      for (const prompt of parsed.prompts) {
        db.insert(prompts).values({
          id: crypto.randomUUID(),
          title: `${namespace}:${prompt.name}`,
          content: prompt.content,
          type: 'complet',
          namespace,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`Prompt: ${namespace}:${prompt.name}`)
      }

      // INSERT memory_fragments
      // Calculer le sortOrder max actuel + 1
      const maxResult = db
        .select({ maxOrder: sql<number>`COALESCE(MAX(sort_order), -1)` })
        .from(memoryFragments)
        .get()
      let maxOrder = (maxResult?.maxOrder ?? -1) + 1

      for (const frag of parsed.fragments) {
        db.insert(memoryFragments).values({
          id: crypto.randomUUID(),
          content: frag.content,
          isActive: true,
          sortOrder: maxOrder++,
          namespace,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`Fragment: ${frag.name}`)
      }

      // INSERT libraries (definition seulement, status 'empty')
      for (const lib of parsed.libraries) {
        db.insert(libraries).values({
          id: crypto.randomUUID(),
          name: `${namespace}:${lib.name}`,
          description: lib.content,
          namespace,
          status: 'empty',
          embeddingModel: 'local',
          embeddingDimensions: 384,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`Library: ${namespace}:${lib.name}`)
      }

      // INSERT mcp_servers (skip si conflit de nom)
      for (const mcp of parsed.mcp) {
        // Verifier si un serveur avec ce nom existe deja
        const existingServer = db
          .select()
          .from(mcpServers)
          .where(eq(mcpServers.name, mcp.name))
          .get()

        if (existingServer) {
          skips.push({
            type: 'MCP',
            name: mcp.name,
            reason: `Un serveur MCP "${mcp.name}" existe deja`
          })
          continue
        }

        const transportType = (mcp.mcpConfig?.transportType ?? 'stdio') as 'stdio' | 'http' | 'sse'

        db.insert(mcpServers).values({
          id: crypto.randomUUID(),
          name: mcp.name,
          description: mcp.content.replace(/```yaml[\s\S]*?```/g, '').trim() || null,
          transportType,
          command: mcp.mcpConfig?.command ?? null,
          args: mcp.mcpConfig?.args ?? null,
          url: mcp.mcpConfig?.url ?? null,
          headers: mcp.mcpConfig?.headers ?? null,
          isEnabled: true,
          namespace,
          createdAt: now,
          updatedAt: now
        }).run()
        succes.push(`MCP: ${mcp.name}`)
      }

      return { bardaId, succes, skips, warnings }
    })

    // Import skills (filesystem ops — async, outside transaction)
    const namespace = parsed.metadata.namespace
    for (const skillDef of parsed.skills) {
      const skillFullName = `${namespace}:${skillDef.name}`
      const existingSkill = getSkillByName(skillFullName)
      if (existingSkill) {
        report.skips.push({ type: 'Skill', name: skillDef.name, reason: 'Skill deja installe' })
        continue
      }

      // Parse source URL from content (format: "- source: https://...")
      const sourceMatch = skillDef.content.match(/^-\s*source:\s*(.+)$/m)
      if (!sourceMatch) {
        report.warnings.push(`Skill ${skillDef.name}: source manquante`)
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
            report.warnings.push(`Skill ${skillDef.name}: ${cloneResult.error}`)
            continue
          }
          sourceDir = cloneResult.tempDir
          tempDir = cloneResult.tempDir
        } else {
          sourceDir = source
        }

        // Validate
        const validation = skillService.validateSkillDir(sourceDir)
        if (!validation.success) {
          report.warnings.push(`Skill ${skillDef.name}: ${validation.error}`)
          if (tempDir) try { execFileSync('trash', [tempDir], { stdio: 'pipe' }) } catch {}
          continue
        }

        // Maton scan
        const scanResult = await matonService.scan(sourceDir)
        if (scanResult.success && scanResult.report.verdict === 'CRITICAL') {
          report.warnings.push(`Skill ${skillDef.name}: menaces critiques detectees, non installe`)
          if (tempDir) try { execFileSync('trash', [tempDir], { stdio: 'pipe' }) } catch {}
          continue
        }

        // Install to filesystem
        skillService.installSkill(sourceDir, skillFullName)

        // Insert into DB
        const fm = validation.parsed.frontmatter
        createSkill({
          name: skillFullName,
          description: fm.description,
          allowedTools: fm.allowedTools,
          shell: fm.shell,
          effort: fm.effort,
          argumentHint: fm.argumentHint,
          userInvocable: fm.userInvocable,
          source: 'barda',
          gitUrl: isGit ? source : undefined,
          namespace,
          matonVerdict: scanResult.success ? scanResult.report.verdict : null,
          matonReport: scanResult.success ? (scanResult.report as unknown as Record<string, unknown>) : null
        })

        report.succes.push(`Skill: ${skillFullName}`)

        if (tempDir) try { execFileSync('trash', [tempDir], { stdio: 'pipe' }) } catch {}
      } catch (err) {
        report.warnings.push(`Skill ${skillDef.name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return report
  }
}

export const bardaImportService = new BardaImportService()
