import { useMemo } from 'react'
import { useSlashCommandsStore, type SlashCommand } from '@/stores/slash-commands.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSkillsStore } from '@/stores/skills.store'

interface SlashCommandMatch {
  command: SlashCommand
  isProjectScoped: boolean
  isAction?: boolean
  isSkill?: boolean
}

interface UseSlashCommandsResult {
  /** Whether the content starts with / and autocomplete should be active */
  isActive: boolean
  /** Matching commands for the current input */
  matches: SlashCommandMatch[]
  /** Resolve a slash command input to the substituted prompt, or null if not a command */
  resolve: (content: string) => { prompt: string; commandName: string; isAction?: boolean; isSkill?: boolean } | null
}

/**
 * Hook for slash command detection, autocomplete filtering, and resolution.
 */
export function useSlashCommands(content: string): UseSlashCommandsResult {
  const commands = useSlashCommandsStore((s) => s.commands)
  const allSkills = useSkillsStore((s) => s.skills)
  const enabledSkills = useMemo(() => allSkills.filter(sk => sk.enabled && sk.userInvocable), [allSkills])
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const activeProject = useProjectsStore((s) => s.projects.find((p) => p.id === s.activeProjectId))
  const selectedModel = useProvidersStore((s) => {
    const m = s.models.find((m) => m.id === s.selectedModelId && m.providerId === s.selectedProviderId)
    return m?.name ?? ''
  })
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)

  // Action commands (client-side, not sent to LLM)
  const ACTION_COMMANDS: SlashCommandMatch[] = useMemo(() => [
    {
      command: { id: '__action_fork', name: 'fork', description: 'Forker cette discussion', prompt: '', isBuiltin: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() } as SlashCommand,
      isProjectScoped: false,
      isAction: true
    },
    {
      command: { id: '__action_open', name: 'open', description: 'Ouvrir une application autorisee', prompt: '$ARGS', isBuiltin: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() } as SlashCommand,
      isProjectScoped: false,
      isAction: true
    }
  ], [])

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

    // Action commands (skip if name already taken)
    for (const action of ACTION_COMMANDS) {
      if (!seen.has(action.command.name)) {
        result.push(action)
        seen.add(action.command.name)
      }
    }

    // Skills (invocable via /skill-name)
    for (const skill of enabledSkills) {
      if (!seen.has(skill.name)) {
        result.push({
          command: {
            id: `__skill_${skill.name}`,
            name: skill.name,
            description: skill.description ?? 'Skill',
            prompt: '',
            isBuiltin: false,
            sortOrder: 100,
            createdAt: new Date(skill.installedAt * 1000),
            updatedAt: new Date(skill.installedAt * 1000)
          } as SlashCommand,
          isProjectScoped: false,
          isSkill: true
        })
        seen.add(skill.name)
      }
    }

    return result
  }, [commands, activeProjectId, ACTION_COMMANDS, enabledSkills])

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
    return (rawContent: string): { prompt: string; commandName: string; isAction?: boolean; isSkill?: boolean } | null => {
      if (!rawContent.startsWith('/')) return null

      const firstLine = rawContent.split('\n')[0]
      const restLines = rawContent.split('\n').slice(1).join('\n')
      const parts = firstLine.slice(1).split(' ')
      const commandName = parts[0].toLowerCase()
      const argString = parts.slice(1).join(' ') + (restLines ? '\n' + restLines : '')

      // Find command (project > global > builtin)
      const match = availableCommands.find(({ command }) => command.name === commandName)
      if (!match) return null

      // Skills are handled differently — return raw args with isSkill flag
      if (match.isSkill) {
        return { prompt: argString.trim(), commandName: match.command.name, isSkill: true }
      }

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

      return { prompt: prompt.trim(), commandName: match.command.name, isAction: match.isAction }
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
