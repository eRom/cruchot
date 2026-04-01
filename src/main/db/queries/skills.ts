import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDatabase } from '../index'
import { skills } from '../schema'

// ── Types ────────────────────────────────────────────────

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

// ── Skills CRUD ──────────────────────────────────────────

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
  return db.select().from(skills).where(eq(skills.enabled, true)).orderBy(skills.name).all()
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

export function updateSkillMetadata(
  id: string,
  data: Partial<Omit<CreateSkillData, 'name' | 'source'>>
) {
  const db = getDatabase()
  const patch: Record<string, unknown> = {}

  if (data.description !== undefined) patch.description = data.description
  if (data.allowedTools !== undefined) patch.allowedTools = data.allowedTools
  if (data.shell !== undefined) patch.shell = data.shell
  if (data.effort !== undefined) patch.effort = data.effort
  if (data.argumentHint !== undefined) patch.argumentHint = data.argumentHint
  if (data.userInvocable !== undefined) patch.userInvocable = data.userInvocable
  if (data.gitUrl !== undefined) patch.gitUrl = data.gitUrl
  if (data.namespace !== undefined) patch.namespace = data.namespace
  if (data.matonVerdict !== undefined) patch.matonVerdict = data.matonVerdict
  if (data.matonReport !== undefined) patch.matonReport = data.matonReport

  if (Object.keys(patch).length > 0) {
    db.update(skills).set(patch).where(eq(skills.id, id)).run()
  }
}
