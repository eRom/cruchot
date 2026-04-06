import type { CoreToolDeclaration, PluginToolDeclaration } from '../../live-plugin.interface'

export function convertToolsToOpenAI(
  coreTools: CoreToolDeclaration[],
  pluginTools: PluginToolDeclaration[]
): Record<string, unknown>[] {
  const allTools = [...coreTools, ...pluginTools]
  return allTools.map(tool => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, param]) => [key, {
          type: param.type,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        }])
      ),
      required: tool.required ?? [],
    },
  }))
}

export const OPENAI_PLUGIN_TOOLS: PluginToolDeclaration[] = []
