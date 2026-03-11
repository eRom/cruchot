import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllMcpServers,
  getMcpServer,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer
} from '../db/queries/mcp-servers'
import { mcpManagerService } from '../services/mcp-manager.service'

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  transportType: z.enum(['stdio', 'http', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  envVars: z.record(z.string()).optional(),
  isEnabled: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
  toolTimeout: z.number().min(1000).max(300000).optional(),
  autoConfirm: z.boolean().optional()
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  transportType: z.enum(['stdio', 'http', 'sse']).optional(),
  command: z.string().nullable().optional(),
  args: z.array(z.string()).nullable().optional(),
  cwd: z.string().nullable().optional(),
  url: z.string().url().nullable().optional(),
  headers: z.record(z.string()).nullable().optional(),
  envVars: z.record(z.string()).nullable().optional(),
  isEnabled: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  toolTimeout: z.number().min(1000).max(300000).optional(),
  autoConfirm: z.boolean().optional()
})

const testSchema = z.object({
  transportType: z.enum(['stdio', 'http', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  envVars: z.record(z.string()).optional()
})

export function registerMcpIpc(): void {
  // List all MCP servers with statuses
  ipcMain.handle('mcp:list', async () => {
    const servers = getAllMcpServers()
    const statuses = mcpManagerService.getAllStatuses()

    return servers.map((s) => ({
      ...s,
      // Never return encrypted env to renderer — just indicate if set
      envEncrypted: undefined,
      hasEnvVars: !!s.envEncrypted,
      ...(statuses[s.id] ?? { status: 'stopped', toolCount: 0 })
    }))
  })

  // Get single server details
  ipcMain.handle('mcp:get', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const server = getMcpServer(id)
    if (!server) return undefined

    const status = mcpManagerService.getServerStatus(id)
    return {
      ...server,
      envEncrypted: undefined,
      hasEnvVars: !!server.envEncrypted,
      ...status
    }
  })

  // Get decrypted env var keys (not values) for edit form
  ipcMain.handle('mcp:getEnvKeys', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const server = getMcpServer(id)
    if (!server || !server.envEncrypted) return []

    try {
      const env = mcpManagerService.decryptEnvVars(server.envEncrypted)
      return Object.keys(env)
    } catch {
      return []
    }
  })

  // Create MCP server
  ipcMain.handle('mcp:create', async (_event, payload: unknown) => {
    const parsed = createSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { envVars, ...rest } = parsed.data

    // Validate transport-specific fields
    if (rest.transportType === 'stdio' && !rest.command) {
      throw new Error('Command is required for stdio transport')
    }
    if ((rest.transportType === 'http' || rest.transportType === 'sse') && !rest.url) {
      throw new Error('URL is required for HTTP/SSE transport')
    }

    // Encrypt env vars if provided
    let envEncrypted: string | undefined
    if (envVars && Object.keys(envVars).length > 0) {
      envEncrypted = mcpManagerService.encryptEnvVars(envVars)
    }

    const server = createMcpServer({ ...rest, envEncrypted })

    // Auto-start if enabled
    if (server.isEnabled) {
      try {
        await mcpManagerService.startServer(server.id)
      } catch (err) {
        console.warn(`[MCP] Failed to auto-start server "${server.name}":`, err)
      }
    }

    const status = mcpManagerService.getServerStatus(server.id)
    return {
      ...server,
      envEncrypted: undefined,
      hasEnvVars: !!server.envEncrypted,
      ...status
    }
  })

  // Update MCP server
  ipcMain.handle('mcp:update', async (_event, id: string, payload: unknown) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { envVars, ...rest } = parsed.data

    // Build update data
    const updateData: Parameters<typeof updateMcpServer>[1] = { ...rest }

    // Handle env vars update
    if (envVars !== undefined) {
      if (envVars === null || Object.keys(envVars).length === 0) {
        updateData.envEncrypted = null
      } else {
        updateData.envEncrypted = mcpManagerService.encryptEnvVars(envVars)
      }
    }

    const server = updateMcpServer(id, updateData)

    // Restart if connected (config changed)
    const currentStatus = mcpManagerService.getServerStatus(id)
    if (currentStatus.status === 'connected') {
      try {
        await mcpManagerService.restartServer(id)
      } catch (err) {
        console.warn(`[MCP] Failed to restart server "${server?.name}":`, err)
      }
    }

    const status = mcpManagerService.getServerStatus(id)
    return server ? {
      ...server,
      envEncrypted: undefined,
      hasEnvVars: !!server.envEncrypted,
      ...status
    } : undefined
  })

  // Delete MCP server
  ipcMain.handle('mcp:delete', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    await mcpManagerService.stopServer(id)
    deleteMcpServer(id)
  })

  // Toggle server enabled/disabled
  ipcMain.handle('mcp:toggle', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const server = toggleMcpServer(id)
    if (!server) return undefined

    if (server.isEnabled) {
      try {
        await mcpManagerService.startServer(id)
      } catch (err) {
        console.warn(`[MCP] Failed to start toggled server:`, err)
      }
    } else {
      await mcpManagerService.stopServer(id)
    }

    const status = mcpManagerService.getServerStatus(id)
    return {
      ...server,
      envEncrypted: undefined,
      hasEnvVars: !!server.envEncrypted,
      ...status
    }
  })

  // Start server manually
  ipcMain.handle('mcp:start', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    await mcpManagerService.startServer(id)
  })

  // Stop server manually
  ipcMain.handle('mcp:stop', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    await mcpManagerService.stopServer(id)
  })

  // Restart server
  ipcMain.handle('mcp:restart', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    await mcpManagerService.restartServer(id)
  })

  // List tools from a specific server
  ipcMain.handle('mcp:tools', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const status = mcpManagerService.getServerStatus(id)
    if (status.status !== 'connected') return []

    try {
      // We can get tool names from the server status
      // For a full list, we'd need the client, but toolCount is usually enough
      return { toolCount: status.toolCount }
    } catch {
      return { toolCount: 0 }
    }
  })

  // Test connection (before saving)
  ipcMain.handle('mcp:test', async (_event, payload: unknown) => {
    const parsed = testSchema.safeParse(payload)
    if (!parsed.success) throw new Error(`Invalid payload: ${parsed.error.message}`)

    const { envVars, ...config } = parsed.data

    return await mcpManagerService.testConnection({
      ...config,
      env: envVars
    })
  })

  console.log('[IPC] MCP handlers registered')
}
