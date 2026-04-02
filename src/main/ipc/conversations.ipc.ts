import { ipcMain } from 'electron'
import { z } from 'zod'
import {
  getAllConversations,
  createConversation,
  deleteConversation,
  deleteAllConversations,
  renameConversation,
  getConversationsByProject,
  setConversationProject,
  updateConversationRole,
  toggleFavorite,
  forkConversation,
  setWorkspacePath
} from '../db/queries/conversations'
import { getMessagesForConversation, getMessagesPage, deleteMessagesForConversation, deleteAllMessages } from '../db/queries/messages'

const idSchema = z.string().min(1).max(100)
const titleSchema = z.string().min(1).max(500)

export function registerConversationsIpc(): void {
  ipcMain.handle('conversations:list', async (_event, projectId?: string | null) => {
    if (projectId !== undefined && projectId !== null) {
      const parsed = idSchema.safeParse(projectId)
      if (!parsed.success) throw new Error('Invalid project ID')
      return getConversationsByProject(parsed.data)
    }
    if (projectId === null) return getConversationsByProject(null)
    return getAllConversations()
  })

  ipcMain.handle('conversations:create', async (_event, title?: string, projectId?: string) => {
    const safeTitle = title ? titleSchema.parse(title) : undefined
    const safeProjectId = projectId ? idSchema.parse(projectId) : undefined
    return createConversation(safeTitle, safeProjectId)
  })

  ipcMain.handle('conversations:setProject', async (_event, id: string, projectId: string | null) => {
    idSchema.parse(id)
    if (projectId !== null) idSchema.parse(projectId)
    setConversationProject(id, projectId)
  })

  ipcMain.handle('conversations:delete', async (_event, id: string) => {
    idSchema.parse(id)
    deleteMessagesForConversation(id)
    deleteConversation(id)
  })

  ipcMain.handle('conversations:rename', async (_event, id: string, title: string) => {
    idSchema.parse(id)
    titleSchema.parse(title)
    renameConversation(id, title)
  })

  ipcMain.handle('conversations:messages', async (_event, conversationId: string) => {
    idSchema.parse(conversationId)
    return getMessagesForConversation(conversationId)
  })

  ipcMain.handle('conversations:messagesPage', async (_event, payload: unknown) => {
    const schema = z.object({
      conversationId: idSchema,
      limit: z.number().int().min(1).max(500).default(50),
      beforeDate: z.string().optional()
    })
    const parsed = schema.parse(payload)
    return getMessagesPage(
      parsed.conversationId,
      parsed.limit,
      parsed.beforeDate ? new Date(parsed.beforeDate) : undefined
    )
  })

  ipcMain.handle('conversations:deleteAll', async () => {
    deleteAllMessages()
    deleteAllConversations()
  })

  ipcMain.handle('conversations:setRole', async (_event, id: string, roleId: string | null) => {
    idSchema.parse(id)
    if (roleId !== null) idSchema.parse(roleId)
    updateConversationRole(id, roleId)
  })

  ipcMain.handle('conversations:toggleFavorite', async (_event, payload: unknown) => {
    const schema = z.object({
      id: idSchema,
      isFavorite: z.boolean()
    })
    const parsed = schema.parse(payload)
    return toggleFavorite(parsed.id, parsed.isFavorite)
  })

  ipcMain.handle('conversations:fork', async (_event, id: string) => {
    idSchema.parse(id)
    return forkConversation(id)
  })

  ipcMain.handle('conversations:setWorkspacePath', async (_event, payload: unknown) => {
    const schema = z.object({
      id: idSchema,
      workspacePath: z.string().min(1).max(1000)
    })
    const { id, workspacePath } = schema.parse(payload)

    // Block dangerous root paths
    const BLOCKED_ROOTS = ['/', '/System', '/usr', '/etc', '/Library', '/bin', '/sbin', '/var', '/private']
    for (const root of BLOCKED_ROOTS) {
      if (workspacePath === root || workspacePath.startsWith(root + '/')) {
        throw new Error(`Chemin bloque : ${workspacePath}`)
      }
    }

    setWorkspacePath(id, workspacePath)
  })

  console.log('[IPC] Conversations handlers registered')
}
