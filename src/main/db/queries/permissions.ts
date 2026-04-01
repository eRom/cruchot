import { eq } from 'drizzle-orm'
import { getDatabase } from '../index'
import { permissionRules } from '../schema'
import type { PermissionRule } from '../../llm/permission-engine'

let cachedRules: PermissionRule[] | null = null

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
  cachedRules = null
}
