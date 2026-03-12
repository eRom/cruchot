import { BrowserWindow } from 'electron'
import type { Tool } from 'ai'
import { getAllMcpServers, getEnabledMcpServers, getMcpServer } from '../db/queries/mcp-servers'
import { encryptApiKey, decryptApiKey } from './credential.service'

// Types for MCP client (imported dynamically)
interface MCPClientInstance {
  tools: () => Promise<Record<string, Tool>>
  close: () => Promise<void>
}

type McpServerStatus = 'connected' | 'error' | 'stopped'

interface McpServerState {
  client: MCPClientInstance
  status: McpServerStatus
  error?: string
  toolCount: number
}

class McpManagerService {
  private servers = new Map<string, McpServerState>()
  private mainWindow: BrowserWindow | null = null

  async init(mainWindow: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow

    // Start all enabled servers
    const enabledServers = getEnabledMcpServers()
    for (const server of enabledServers) {
      try {
        await this.startServer(server.id)
      } catch (err) {
        console.error(`[MCP] Failed to start server "${server.name}":`, err)
      }
    }

    if (enabledServers.length > 0) {
      console.log(`[MCP] Initialized ${this.servers.size}/${enabledServers.length} servers`)
    }
  }

  async startServer(serverId: string): Promise<void> {
    // Stop existing if running
    if (this.servers.has(serverId)) {
      await this.stopServer(serverId)
    }

    const serverConfig = getMcpServer(serverId)
    if (!serverConfig) throw new Error(`MCP server ${serverId} not found`)

    try {
      const { createMCPClient } = await import('@ai-sdk/mcp')

      let transport: unknown

      if (serverConfig.transportType === 'stdio') {
        if (!serverConfig.command) throw new Error('Command is required for stdio transport')

        const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')

        // Build env: always inherit process.env, merge custom env vars on top
        let customEnv: Record<string, string> | undefined
        if (serverConfig.envEncrypted) {
          try {
            const decrypted = decryptApiKey(serverConfig.envEncrypted)
            customEnv = JSON.parse(decrypted)
          } catch {
            console.warn(`[MCP] Failed to decrypt env vars for server "${serverConfig.name}"`)
          }
        }

        // Minimal env — do NOT leak full process.env (may contain API keys/tokens from parent shell)
        const spawnEnv: Record<string, string> = {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
          HOME: process.env.HOME ?? '',
          TMPDIR: process.env.TMPDIR ?? '/tmp',
          LANG: process.env.LANG ?? 'en_US.UTF-8',
          SHELL: process.env.SHELL ?? '/bin/zsh',
          USER: process.env.USER ?? '',
          ...customEnv
        }

        transport = new Experimental_StdioMCPTransport({
          command: serverConfig.command,
          args: serverConfig.args ?? [],
          env: spawnEnv,
          cwd: serverConfig.cwd ?? undefined
        })
      } else if (serverConfig.transportType === 'http' || serverConfig.transportType === 'sse') {
        if (!serverConfig.url) throw new Error('URL is required for HTTP/SSE transport')

        transport = {
          type: serverConfig.transportType === 'http' ? 'http' : 'sse',
          url: serverConfig.url,
          headers: serverConfig.headers ?? undefined
        }
      } else {
        throw new Error(`Unsupported transport type: ${serverConfig.transportType}`)
      }

      const client = await createMCPClient({
        transport: transport as Parameters<typeof createMCPClient>[0]['transport'],
        name: `multi-llm-${serverConfig.name}`,
        onUncaughtError: (error) => {
          console.error(`[MCP] Uncaught error on "${serverConfig.name}":`, error)
          const state = this.servers.get(serverId)
          if (state) {
            state.status = 'error'
            state.error = error.message
          }
          this.notifyStatusChange(serverId, 'error', error.message)
        }
      })

      // Fetch tools to verify connection
      const tools = await client.tools()
      const toolCount = Object.keys(tools).length

      this.servers.set(serverId, {
        client,
        status: 'connected',
        toolCount
      })

      this.notifyStatusChange(serverId, 'connected')
      console.log(`[MCP] Server "${serverConfig.name}" connected (${toolCount} tools)`)

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.servers.set(serverId, {
        client: null as unknown as MCPClientInstance,
        status: 'error',
        error: errorMsg,
        toolCount: 0
      })
      this.notifyStatusChange(serverId, 'error', errorMsg)
      throw err
    }
  }

  async stopServer(serverId: string): Promise<void> {
    const state = this.servers.get(serverId)
    if (!state) return

    try {
      if (state.client) {
        await state.client.close()
      }
    } catch (err) {
      console.warn(`[MCP] Error closing server ${serverId}:`, err)
    }

    this.servers.delete(serverId)
    this.notifyStatusChange(serverId, 'stopped')
  }

  async restartServer(serverId: string): Promise<void> {
    await this.stopServer(serverId)
    await this.startServer(serverId)
  }

  async getToolsForChat(projectId?: string | null): Promise<Record<string, Tool>> {
    const allTools: Record<string, Tool> = {}

    // Get enabled servers (filtered by project scope)
    const enabledServers = getEnabledMcpServers(projectId)
    const enabledIds = new Set(enabledServers.map(s => s.id))

    for (const [serverId, state] of this.servers.entries()) {
      if (state.status !== 'connected' || !enabledIds.has(serverId)) continue

      const serverConfig = getMcpServer(serverId)
      if (!serverConfig) continue

      try {
        const tools = await state.client.tools()
        // Prefix tool names with server name to avoid collisions
        const prefix = serverConfig.name.toLowerCase().replace(/[^a-z0-9]/g, '_')
        for (const [name, tool] of Object.entries(tools)) {
          allTools[`${prefix}__${name}`] = tool
        }
      } catch (err) {
        console.warn(`[MCP] Failed to get tools from "${serverConfig.name}":`, err)
        state.status = 'error'
        state.error = err instanceof Error ? err.message : String(err)
        this.notifyStatusChange(serverId, 'error', state.error)
      }
    }

    return allTools
  }

  getServerStatus(serverId: string): { status: McpServerStatus; error?: string; toolCount: number } {
    const state = this.servers.get(serverId)
    if (!state) return { status: 'stopped', toolCount: 0 }
    return { status: state.status, error: state.error, toolCount: state.toolCount }
  }

  getAllStatuses(): Record<string, { status: McpServerStatus; error?: string; toolCount: number }> {
    const result: Record<string, { status: McpServerStatus; error?: string; toolCount: number }> = {}
    for (const [id, state] of this.servers.entries()) {
      result[id] = { status: state.status, error: state.error, toolCount: state.toolCount }
    }
    return result
  }

  private static readonly TEST_TIMEOUT = 30_000 // 30s

  async testConnection(config: {
    transportType: 'stdio' | 'http' | 'sse'
    command?: string
    args?: string[]
    cwd?: string
    url?: string
    headers?: Record<string, string>
    env?: Record<string, string>
  }): Promise<{ success: boolean; toolCount: number; toolNames: string[]; error?: string }> {
    try {
      const result = await Promise.race([
        this.doTestConnection(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Test connection timeout (30s)')), McpManagerService.TEST_TIMEOUT)
        )
      ])
      return result
    } catch (err) {
      return {
        success: false,
        toolCount: 0,
        toolNames: [],
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }

  private async doTestConnection(config: {
    transportType: 'stdio' | 'http' | 'sse'
    command?: string
    args?: string[]
    cwd?: string
    url?: string
    headers?: Record<string, string>
    env?: Record<string, string>
  }): Promise<{ success: boolean; toolCount: number; toolNames: string[] }> {
    const { createMCPClient } = await import('@ai-sdk/mcp')

    let transport: unknown

    if (config.transportType === 'stdio') {
      if (!config.command) throw new Error('Command is required')
      const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio')

      // Minimal env — do NOT leak full process.env
      const spawnEnv: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin',
        HOME: process.env.HOME ?? '',
        TMPDIR: process.env.TMPDIR ?? '/tmp',
        LANG: process.env.LANG ?? 'en_US.UTF-8',
        SHELL: process.env.SHELL ?? '/bin/zsh',
        USER: process.env.USER ?? '',
        ...config.env
      }

      transport = new Experimental_StdioMCPTransport({
        command: config.command,
        args: config.args ?? [],
        env: spawnEnv,
        cwd: config.cwd ?? undefined
      })
    } else {
      if (!config.url) throw new Error('URL is required')
      transport = {
        type: config.transportType === 'http' ? 'http' : 'sse',
        url: config.url,
        headers: config.headers ?? undefined
      }
    }

    const client = await createMCPClient({
      transport: transport as Parameters<typeof createMCPClient>[0]['transport'],
      name: 'multi-llm-test'
    })

    try {
      const tools = await client.tools()
      const toolNames = Object.keys(tools)
      return { success: true, toolCount: toolNames.length, toolNames }
    } finally {
      await client.close()
    }
  }

  async stopAll(): Promise<void> {
    const serverIds = [...this.servers.keys()]
    for (const id of serverIds) {
      try {
        await this.stopServer(id)
      } catch (err) {
        console.warn(`[MCP] Error stopping server ${id}:`, err)
      }
    }
    console.log('[MCP] All servers stopped')
  }

  /** Encrypt env vars JSON for storage */
  encryptEnvVars(env: Record<string, string>): string {
    return encryptApiKey(JSON.stringify(env))
  }

  /** Decrypt env vars from stored encrypted form */
  decryptEnvVars(encrypted: string): Record<string, string> {
    const json = decryptApiKey(encrypted)
    return JSON.parse(json)
  }

  private notifyStatusChange(serverId: string, status: McpServerStatus, error?: string): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    const state = this.servers.get(serverId)
    this.mainWindow.webContents.send('mcp:status-changed', {
      serverId,
      status,
      error,
      toolCount: state?.toolCount ?? 0
    })
  }
}

export const mcpManagerService = new McpManagerService()
