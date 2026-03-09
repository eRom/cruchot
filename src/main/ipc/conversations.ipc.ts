import { ipcMain } from 'electron'
import {
  getAllConversations,
  createConversation,
  deleteConversation,
  renameConversation,
  getConversationsByProject,
  setConversationProject
} from '../db/queries/conversations'
import { getMessagesForConversation, deleteMessagesForConversation } from '../db/queries/messages'

export function registerConversationsIpc(): void {
  ipcMain.handle('conversations:list', async (_event, projectId?: string | null) => {
    if (projectId !== undefined) {
      return getConversationsByProject(projectId)
    }
    return getAllConversations()
  })

  ipcMain.handle('conversations:create', async (_event, title?: string, projectId?: string) => {
    return createConversation(title, projectId)
  })

  ipcMain.handle('conversations:setProject', async (_event, id: string, projectId: string | null) => {
    if (!id) throw new Error('Conversation ID required')
    setConversationProject(id, projectId)
  })

  ipcMain.handle('conversations:delete', async (_event, id: string) => {
    if (!id) throw new Error('Conversation ID required')
    deleteMessagesForConversation(id)
    deleteConversation(id)
  })

  ipcMain.handle('conversations:rename', async (_event, id: string, title: string) => {
    if (!id || !title) throw new Error('ID and title required')
    renameConversation(id, title)
  })

  ipcMain.handle('conversations:messages', async (_event, conversationId: string) => {
    if (!conversationId) throw new Error('Conversation ID required')
    return getMessagesForConversation(conversationId)
  })

  console.log('[IPC] Conversations handlers registered')
}
