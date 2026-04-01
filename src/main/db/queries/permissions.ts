import { eq } from 'drizzle-orm'
import { getDatabase } from '../index'
import { permissionRules } from '../schema'
import type { PermissionRule } from '../../llm/permission-engine'

let cachedRules: PermissionRule[] | null = null

const DEFAULT_RULES = [
  { tool: 'bash', content: 'npm *', behavior: 'allow' as const },
  { tool: 'bash', content: 'npx *', behavior: 'allow' as const },
  { tool: 'bash', content: 'git *', behavior: 'allow' as const },
  { tool: 'bash', content: 'node *', behavior: 'allow' as const },
  { tool: 'bash', content: 'cat *', behavior: 'allow' as const },
  { tool: 'bash', content: 'ls *', behavior: 'allow' as const },
  { tool: 'bash', content: 'find *', behavior: 'allow' as const },
  { tool: 'bash', content: 'grep *', behavior: 'allow' as const },
  { tool: 'bash', content: 'echo *', behavior: 'allow' as const },
  { tool: 'bash', content: 'pwd', behavior: 'allow' as const },
  { tool: 'bash', content: 'which *', behavior: 'allow' as const },
  { tool: 'bash', content: 'rm -rf *', behavior: 'deny' as const },
  { tool: 'bash', content: 'sudo *', behavior: 'deny' as const },
  { tool: 'bash', content: 'chmod *', behavior: 'deny' as const },
  { tool: 'bash', content: 'chown *', behavior: 'deny' as const },
  { tool: 'WebFetchTool', content: '*.github.com', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.npmjs.com', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.mozilla.org', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.stackoverflow.com', behavior: 'allow' as const },
]

export function getAllPermissionRules(): PermissionRule[] {
  if (cachedRules) return cachedRules
  const db = getDatabase()
  const rows = db.select().from(permissionRules).all()
  cachedRules = rows.map(r => ({
    id: r.id,
    toolName: r.toolName,
    ruleContent: r.ruleContent,
    behavior: r.behavior as 'allow' | 'deny' | 'ask',
    createdAt: r.createdAt
  }))
  return cachedRules
}

export function addPermissionRule(toolName: string, ruleContent: string | null, behavior: 'allow' | 'deny' | 'ask'): PermissionRule {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const createdAt = Math.floor(Date.now() / 1000)
  db.insert(permissionRules).values({ id, toolName, ruleContent, behavior, createdAt }).run()
  cachedRules = null
  return { id, toolName, ruleContent, behavior, createdAt }
}

export function deletePermissionRule(id: string): void {
  const db = getDatabase()
  db.delete(permissionRules).where(eq(permissionRules.id, id)).run()
  cachedRules = null
}

export function resetPermissionRules(): void {
  const db = getDatabase()
  db.delete(permissionRules).run()

  // Re-seed defaults
  const now = Math.floor(Date.now() / 1000)
  for (const rule of DEFAULT_RULES) {
    db.insert(permissionRules).values({
      id: crypto.randomUUID(),
      toolName: rule.tool,
      ruleContent: rule.content,
      behavior: rule.behavior,
      createdAt: now
    }).run()
  }

  cachedRules = null
}
