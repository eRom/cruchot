/**
 * BardaImportService — Importe un pack Barda parse dans la base de donnees.
 * Transaction atomique, verification namespace unique, limite fragments.
 */
import crypto from 'node:crypto'
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

    return report
  }
}

export const bardaImportService = new BardaImportService()
