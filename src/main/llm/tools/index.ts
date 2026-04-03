import { buildBashTool } from './bash'
import { buildReadFileTool } from './file-read'
import { buildWriteFileTool } from './file-write'
import { buildFileEditTool } from './file-edit'
import { buildListFilesTool } from './list-files'
import { buildGrepTool } from './grep'
import { buildGlobTool } from './glob'
import { buildWebFetchTool } from './web-fetch'
import { runBashSecurityChecks } from '../bash-security'
import { evaluatePermission, addSessionApproval, type PermissionRule } from '../permission-engine'

export { buildWorkspaceContextBlock, WORKSPACE_TOOLS_PROMPT } from './context'

export interface ToolPipelineOptions {
  rules: PermissionRule[]
  conversationId?: string
  onAskApproval: (request: { toolName: string; toolArgs: Record<string, unknown> }) => Promise<'allow' | 'deny' | 'allow-session'>
  planMode?: 'proposed' | 'approved'  // NEW
}

export function buildConversationTools(
  workspacePath: string,
  options?: ToolPipelineOptions
) {
  const rawTools = {
    bash: buildBashTool(workspacePath),
    readFile: buildReadFileTool(workspacePath),
    writeFile: buildWriteFileTool(workspacePath),
    FileEdit: buildFileEditTool(workspacePath),
    listFiles: buildListFilesTool(workspacePath),
    GrepTool: buildGrepTool(workspacePath),
    GlobTool: buildGlobTool(workspacePath),
    WebFetchTool: buildWebFetchTool(),
  }

  // Without pipeline options, return raw tools (for tests/Arena)
  if (!options) return rawTools

  const { rules, onAskApproval } = options

  // Tools allowed during plan proposal phase (read-only)
  const READ_ONLY_TOOLS = new Set(['readFile', 'listFiles', 'GrepTool', 'GlobTool', 'WebFetchTool'])

  // Wrap each tool with the security pipeline
  const wrapped: Record<string, unknown> = {}
  for (const [name, toolDef] of Object.entries(rawTools)) {
    const original = (toolDef as any)
    wrapped[name] = {
      ...original,
      execute: async (args: Record<string, unknown>) => {
        // 0. Plan mode gate — block write tools during proposal phase
        if (options.planMode === 'proposed' && !READ_ONLY_TOOLS.has(name)) {
          return { error: 'Plan en attente de validation. Outil bloque en lecture seule.' }
        }

        // 1. Security checks (bash only, hard block)
        if (name === 'bash') {
          const check = runBashSecurityChecks(String(args.command ?? ''))
          if (!check.pass) {
            return { error: `Commande refusee (check #${check.failedCheck}): ${check.reason}` }
          }
        }

        // 2. Permission evaluation
        const decision = evaluatePermission(
          { toolName: name, toolArgs: args, workspacePath, conversationId: options.conversationId },
          rules
        )

        if (decision === 'deny') {
          return { error: 'Action refusee par les permissions' }
        }

        if (decision === 'ask') {
          const result = await onAskApproval({ toolName: name, toolArgs: args })
          if (result === 'deny') {
            return { error: 'Action refusee par l\'utilisateur' }
          }
          if (result === 'allow-session') {
            const sessionKey = `${name}::${args.command ?? args.file_path ?? args.path ?? args.pattern ?? args.url ?? ''}`
            addSessionApproval(options.conversationId ?? '', sessionKey)
          }
        }

        // 3. Execute original
        return original.execute(args)
      }
    }
  }

  return wrapped as typeof rawTools
}

/**
 * Wraps an external tool (MCP, search, etc.) with the permission pipeline.
 * Security checks + deny/allow/ask evaluation, same as built-in tools.
 */
export function wrapExternalTool(
  name: string,
  toolDef: any,
  workspacePath: string,
  options: ToolPipelineOptions
): any {
  const { rules, onAskApproval, conversationId } = options
  return {
    ...toolDef,
    execute: async (args: Record<string, unknown>) => {
      // I2: Plan mode gate — block MCP tools during proposal phase
      if (options.planMode === 'proposed') {
        return { error: 'Plan en attente de validation. Outil MCP bloque en lecture seule.' }
      }

      const decision = evaluatePermission(
        { toolName: name, toolArgs: args, workspacePath, conversationId },
        rules
      )
      if (decision === 'deny') {
        return { error: 'Action MCP refusee par les permissions' }
      }
      if (decision === 'ask') {
        const result = await onAskApproval({ toolName: name, toolArgs: args })
        if (result === 'deny') {
          return { error: 'Action MCP refusee par l\'utilisateur' }
        }
        if (result === 'allow-session') {
          const sessionKey = `${name}::${JSON.stringify(args).slice(0, 200)}`
          addSessionApproval(conversationId ?? '', sessionKey)
        }
      }
      return toolDef.execute(args)
    }
  }
}
