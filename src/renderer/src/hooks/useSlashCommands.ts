import { useMemo } from 'react'
import { useSlashCommandsStore, type SlashCommand } from '@/stores/slash-commands.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'

interface SlashCommandMatch {
  command: SlashCommand
  isProjectScoped: boolean
}

interface UseSlashCommandsResult {
  /** Whether the content starts with / and autocomplete should be active */
  isActive: boolean
  /** Matching commands for the current input */
  matches: SlashCommandMatch[]
  /** Resolve a slash command input to the substituted prompt, or null if not a command */
  resolve: (content: string) => { prompt: string; commandName: string } | null
}

/**
 * Hook for slash command detection, autocomplete filtering, and resolution.
 */
export function useSlashCommands(content: string): UseSlashCommandsResult {
  const commands = useSlashCommandsStore((s) => s.commands)
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const activeProject = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
  const selectedModel = useProvidersStore((s) => {
    const m = s.models.find((m) => m.id === s.selectedModelId && m.providerId === s.selectedProviderId)
    return m?.name ?? ''
  })
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)

  // Build deduplicated command list with project priority
  const availableCommands = useMemo(() => {
    const result: SlashCommandMatch[] = []
    const seen = new Set<string>()

    // Project commands first (higher priority)
    if (activeProjectId) {
      for (const cmd of commands) {
        if (cmd.projectId === activeProjectId) {
          result.push({ command: cmd, isProjectScoped: true })
          seen.add(cmd.name)
        }
      }
    }

    // Global + builtin commands (skip if name already taken by project)
    for (const cmd of commands) {
      if (!cmd.projectId && !seen.has(cmd.name)) {
        result.push({ command: cmd, isProjectScoped: false })
        seen.add(cmd.name)
      }
    }

    return result
  }, [commands, activeProjectId])

  // Check if content starts with /
  const isActive = content.startsWith('/') && !content.startsWith('/ ')

  // Filter matches
  const matches = useMemo(() => {
    if (!isActive) return []

    const firstLine = content.split('\n')[0]
    const query = firstLine.slice(1).toLowerCase().split(' ')[0]

    if (!query) return availableCommands.slice(0, 8)

    return availableCommands
      .filter(({ command }) =>
        command.name.includes(query) ||
        command.description.toLowerCase().includes(query)
      )
      .slice(0, 8)
  }, [isActive, content, availableCommands])

  // Resolve function
  const resolve = useMemo(() => {
    return (rawContent: string): { prompt: string; commandName: string } | null => {
      if (!rawContent.startsWith('/')) return null

      const firstLine = rawContent.split('\n')[0]
      const restLines = rawContent.split('\n').slice(1).join('\n')
      const parts = firstLine.slice(1).split(' ')
      const commandName = parts[0].toLowerCase()
      const argString = parts.slice(1).join(' ') + (restLines ? '\n' + restLines : '')

      // Find command (project > global > builtin)
      const match = availableCommands.find(({ command }) => command.name === commandName)
      if (!match) return null

      const args = parseArgs(argString)
      let prompt = match.command.prompt

      // Substitute variables
      prompt = prompt.replace(/\$ARGS/g, argString.trim())
      prompt = prompt.replace(/\$MODEL/g, selectedModel)
      prompt = prompt.replace(/\$PROJECT/g, activeProject?.name ?? '')
      prompt = prompt.replace(/\$WORKSPACE/g, workspaceRootPath ?? '')
      prompt = prompt.replace(/\$DATE/g, new Date().toISOString().split('T')[0])

      for (let i = 0; i < args.length; i++) {
        prompt = prompt.replace(new RegExp(`\\$${i + 1}`, 'g'), args[i])
      }

      // Clean remaining positional variables
      prompt = prompt.replace(/\$\d+/g, '')

      return { prompt: prompt.trim(), commandName: match.command.name }
    }
  }, [availableCommands, selectedModel, activeProject?.name, workspaceRootPath])

  return { isActive, matches, resolve }
}

// ── Argument parser (same as CommandsView) ──────────────────

function parseArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (const char of input) {
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false
        if (current) args.push(current)
        current = ''
      } else {
        current += char
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true
      quoteChar = char
    } else if (char === ' ') {
      if (current) args.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current) args.push(current)
  return args
}
