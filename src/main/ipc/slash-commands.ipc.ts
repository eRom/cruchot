import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllSlashCommands,
  getSlashCommand,
  createSlashCommand,
  updateSlashCommand,
  deleteSlashCommand,
  reorderSlashCommands,
  seedBuiltinCommands
} from '../db/queries/slash-commands'
import { BUILTIN_COMMANDS, RESERVED_COMMAND_NAMES } from '../commands/builtin'

const NAME_REGEX = /^[a-z][a-z0-9-]*$/

const createSchema = z.object({
  name: z.string().min(1).max(50).regex(NAME_REGEX),
  description: z.string().min(1).max(200),
  prompt: z.string().min(1).max(10_000),
  category: z.string().max(50).optional(),
  projectId: z.string().max(100).optional()
})

const updateSchema = z.object({
  name: z.string().min(1).max(50).regex(NAME_REGEX).optional(),
  description: z.string().min(1).max(200).optional(),
  prompt: z.string().min(1).max(10_000).optional(),
  category: z.string().max(50).nullable().optional(),
  projectId: z.string().max(100).nullable().optional()
})

export function registerSlashCommandsIpc(): void {
  // List all commands
  ipcMain.handle('slash-commands:list', async () => {
    return getAllSlashCommands()
  })

  // Get single command
  ipcMain.handle('slash-commands:get', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    return getSlashCommand(id)
  })

  // Create command
  ipcMain.handle('slash-commands:create', async (_event, data: unknown) => {
    const parsed = createSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid command data')
    if (RESERVED_COMMAND_NAMES.has(parsed.data.name)) {
      throw new Error(`Le nom "${parsed.data.name}" est reserve`)
    }
    return createSlashCommand(parsed.data)
  })

  // Update command
  ipcMain.handle('slash-commands:update', async (_event, id: string, data: unknown) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const parsed = updateSchema.safeParse(data)
    if (!parsed.success) throw new Error('Invalid command data')
    if (parsed.data.name && RESERVED_COMMAND_NAMES.has(parsed.data.name)) {
      throw new Error(`Le nom "${parsed.data.name}" est reserve`)
    }
    return updateSlashCommand(id, parsed.data)
  })

  // Delete command (block builtins)
  ipcMain.handle('slash-commands:delete', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const cmd = getSlashCommand(id)
    if (!cmd) throw new Error('Command not found')
    if (cmd.isBuiltin) throw new Error('Cannot delete builtin command')
    deleteSlashCommand(id)
  })

  // Reset builtin to original prompt
  ipcMain.handle('slash-commands:reset', async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('ID required')
    const cmd = getSlashCommand(id)
    if (!cmd) throw new Error('Command not found')
    if (!cmd.isBuiltin) throw new Error('Only builtin commands can be reset')

    const original = BUILTIN_COMMANDS.find((b) => b.name === cmd.name)
    if (!original) throw new Error('Original builtin not found')

    return updateSlashCommand(id, {
      prompt: original.prompt,
      description: original.description
    })
  })

  // Reorder commands
  ipcMain.handle('slash-commands:reorder', async (_event, orderedIds: unknown) => {
    const parsed = z.array(z.string().min(1).max(100)).max(200).safeParse(orderedIds)
    if (!parsed.success) throw new Error('Invalid order data')
    reorderSlashCommands(parsed.data)
  })

  // Seed builtins (called at startup)
  ipcMain.handle('slash-commands:seed', async () => {
    seedBuiltinCommands(BUILTIN_COMMANDS)
  })

  console.log('[IPC] Slash commands handlers registered')
}
