import { eq, desc, isNull, or } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { mcpServers } from '../schema'

export function getAllMcpServers() {
  const db = getDatabase()
  return db
    .select()
    .from(mcpServers)
    .orderBy(desc(mcpServers.updatedAt))
    .all()
}

export function getMcpServer(id: string) {
  const db = getDatabase()
  return db.select().from(mcpServers).where(eq(mcpServers.id, id)).get()
}

export function getEnabledMcpServers(projectId?: string | null) {
  const db = getDatabase()
  if (projectId) {
    return db
      .select()
      .from(mcpServers)
      .where(
        eq(mcpServers.isEnabled, true)
      )
      .all()
      .filter(s => s.projectId === null || s.projectId === projectId)
  }
  return db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.isEnabled, true))
    .all()
}

export function createMcpServer(data: {
  name: string
  description?: string
  transportType: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  cwd?: string
  url?: string
  headers?: Record<string, string>
  envEncrypted?: string
  isEnabled?: boolean
  projectId?: string | null
  icon?: string
  color?: string
  toolTimeout?: number
  autoConfirm?: boolean
}) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  db.insert(mcpServers)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      transportType: data.transportType,
      command: data.command ?? null,
      args: data.args ?? null,
      cwd: data.cwd ?? null,
      url: data.url ?? null,
      headers: data.headers ?? null,
      envEncrypted: data.envEncrypted ?? null,
      isEnabled: data.isEnabled ?? true,
      projectId: data.projectId ?? null,
      icon: data.icon ?? null,
      color: data.color ?? null,
      toolTimeout: data.toolTimeout ?? 30000,
      autoConfirm: data.autoConfirm ?? true,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return getMcpServer(id)!
}

export function updateMcpServer(
  id: string,
  data: {
    name?: string
    description?: string | null
    transportType?: 'stdio' | 'http' | 'sse'
    command?: string | null
    args?: string[] | null
    cwd?: string | null
    url?: string | null
    headers?: Record<string, string> | null
    envEncrypted?: string | null
    isEnabled?: boolean
    projectId?: string | null
    icon?: string | null
    color?: string | null
    toolTimeout?: number
    autoConfirm?: boolean
  }
) {
  const db = getDatabase()
  db.update(mcpServers)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(mcpServers.id, id))
    .run()

  return getMcpServer(id)
}

export function deleteMcpServer(id: string) {
  const db = getDatabase()
  db.delete(mcpServers).where(eq(mcpServers.id, id)).run()
}

export function toggleMcpServer(id: string) {
  const server = getMcpServer(id)
  if (!server) return undefined

  return updateMcpServer(id, { isEnabled: !server.isEnabled })
}
