import { eq } from 'drizzle-orm'
import { getDatabase } from '../index'
import { permissionRules } from '../schema'
import type { PermissionRule } from '../../llm/permission-engine'

let cachedRules: PermissionRule[] | null = null

const DEFAULT_RULES = [
  // ── Deny (checked first, can't be overridden by allow) ──
  { tool: 'bash', content: 'rm -rf *', behavior: 'deny' as const },
  { tool: 'bash', content: 'sudo *', behavior: 'deny' as const },
  { tool: 'bash', content: 'chmod *', behavior: 'deny' as const },
  { tool: 'bash', content: 'chown *', behavior: 'deny' as const },

  // ── Allow: dev tools & runtimes ─────────────────────────
  // Read-only commands (ls, cat, head, grep, etc.) are auto-allowed
  // by the built-in READONLY_COMMANDS set in permission-engine.ts.
  // These rules cover WRITE/EXECUTE tools that need explicit allow.
  { tool: 'bash', content: 'npm *', behavior: 'allow' as const },
  { tool: 'bash', content: 'npx *', behavior: 'allow' as const },
  { tool: 'bash', content: 'node *', behavior: 'allow' as const },
  { tool: 'bash', content: 'git *', behavior: 'allow' as const },
  { tool: 'bash', content: 'python3 *', behavior: 'allow' as const },
  { tool: 'bash', content: 'python *', behavior: 'allow' as const },
  { tool: 'bash', content: 'pip3 *', behavior: 'allow' as const },
  { tool: 'bash', content: 'pip *', behavior: 'allow' as const },
  { tool: 'bash', content: 'tsc *', behavior: 'allow' as const },
  { tool: 'bash', content: 'tsx *', behavior: 'allow' as const },
  { tool: 'bash', content: 'bun *', behavior: 'allow' as const },
  { tool: 'bash', content: 'pnpm *', behavior: 'allow' as const },
  { tool: 'bash', content: 'yarn *', behavior: 'allow' as const },
  { tool: 'bash', content: 'make *', behavior: 'allow' as const },
  { tool: 'bash', content: 'cargo *', behavior: 'allow' as const },
  { tool: 'bash', content: 'go *', behavior: 'allow' as const },
  { tool: 'bash', content: 'ruby *', behavior: 'allow' as const },
  { tool: 'bash', content: 'curl *', behavior: 'allow' as const },

  // ── Allow: file ops (safe — seatbelt confines to workspace) ──
  { tool: 'bash', content: 'mkdir *', behavior: 'allow' as const },
  { tool: 'bash', content: 'touch *', behavior: 'allow' as const },
  { tool: 'bash', content: 'cp *', behavior: 'allow' as const },
  { tool: 'bash', content: 'mv *', behavior: 'allow' as const },
  { tool: 'bash', content: 'rm *', behavior: 'allow' as const },
  { tool: 'bash', content: 'tar *', behavior: 'allow' as const },
  { tool: 'bash', content: 'unzip *', behavior: 'allow' as const },

  // ── Allow: web fetch domains ────────────────────────────
  { tool: 'WebFetchTool', content: '*.github.com', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.npmjs.com', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.mozilla.org', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.stackoverflow.com', behavior: 'allow' as const },
  { tool: 'WebFetchTool', content: '*.pypi.org', behavior: 'allow' as const },
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
