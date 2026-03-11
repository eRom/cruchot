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
  updateConversationRole
} from '../db/queries/conversations'
import { getMessagesForConversation, deleteMessagesForConversation, deleteAllMessages } from '../db/queries/messages'

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

  ipcMain.handle('conversations:deleteAll', async () => {
    deleteAllMessages()
    deleteAllConversations()
  })

  ipcMain.handle('conversations:setRole', async (_event, id: string, roleId: string | null) => {
    idSchema.parse(id)
    if (roleId !== null) idSchema.parse(roleId)
    updateConversationRole(id, roleId)
  })

  console.log('[IPC] Conversations handlers registered')
}
