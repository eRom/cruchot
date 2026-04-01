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
  onAskApproval: (request: { toolName: string; toolArgs: Record<string, unknown> }) => Promise<'allow' | 'deny' | 'allow-session'>
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

  // Wrap each tool with the security pipeline
  const wrapped: Record<string, unknown> = {}
  for (const [name, toolDef] of Object.entries(rawTools)) {
    const original = (toolDef as any)
    wrapped[name] = {
      ...original,
      execute: async (args: Record<string, unknown>) => {
        // 1. Security checks (bash only, hard block)
        if (name === 'bash') {
          const check = runBashSecurityChecks(String(args.command ?? ''))
          if (!check.pass) {
            return { error: `Commande refusee (check #${check.failedCheck}): ${check.reason}` }
          }
        }

        // 2. Permission evaluation
        const decision = evaluatePermission(
          { toolName: name, toolArgs: args, workspacePath },
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
            const sessionKey = `${name}::${args.command ?? args.path ?? args.file_path ?? args.url ?? '*'}`
            addSessionApproval(sessionKey)
          }
        }

        // 3. Execute original
        return original.execute(args)
      }
    }
  }

  return wrapped as typeof rawTools
}
