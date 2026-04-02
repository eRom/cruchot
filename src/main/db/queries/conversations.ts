import { eq, desc, isNull, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { getDatabase } from '../index'
import { conversations, messages, projects } from '../schema'

export function getAllConversations() {
  const db = getDatabase()
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .all()
}

export function getConversation(id: string) {
  const db = getDatabase()
  return db.select().from(conversations).where(eq(conversations.id, id)).get()
}

export function createConversation(title?: string, projectId?: string) {
  const db = getDatabase()
  const id = nanoid()
  const now = new Date()

  // Inherit workspace path from project if available
  let workspacePath = '~/.cruchot/sandbox/'
  if (projectId) {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (project?.workspacePath) {
      workspacePath = project.workspacePath
    }
  }

  const row = {
    id,
    title: title || 'Nouvelle conversation',
    projectId: projectId ?? null,
    workspacePath,
    createdAt: now,
    updatedAt: now,
    modelId: null,
    roleId: null,
    activeLibraryId: null,
    isFavorite: false,
    isArena: false,
    isScheduledTask: false
  }

  db.insert(conversations).values(row).run()

  return row
}

export function getConversationsByProject(projectId: string | null) {
  const db = getDatabase()
  if (projectId === null) {
    // "Boite de reception" — conversations sans projet
    return db
      .select()
      .from(conversations)
      .where(isNull(conversations.projectId))
      .orderBy(desc(conversations.updatedAt))
      .all()
  }
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .orderBy(desc(conversations.updatedAt))
    .all()
}

export function setConversationProject(id: string, projectId: string | null) {
  const db = getDatabase()
  db.update(conversations)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function renameConversation(id: string, title: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function updateConversationModel(id: string, modelId: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ modelId, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function updateConversationRole(id: string, roleId: string | null) {
  const db = getDatabase()
  db.update(conversations)
    .set({ roleId, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function touchConversation(id: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function deleteConversation(id: string) {
  const db = getDatabase()
  // Messages are cascade-deleted via FK or we delete them explicitly
  db.delete(conversations).where(eq(conversations.id, id)).run()
}

export function toggleFavorite(id: string, isFavorite: boolean) {
  const db = getDatabase()
  db.update(conversations)
    .set({ isFavorite, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
  return getConversation(id)
}

export function setWorkspacePath(id: string, workspacePath: string) {
  const db = getDatabase()
  db.update(conversations)
    .set({ workspacePath, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function setConversationArena(id: string, isArena: boolean) {
  const db = getDatabase()
  db.update(conversations)
    .set({ isArena, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}

export function setConversationScheduledTask(id: string, isScheduledTask: boolean) {
  const db = getDatabase()
  db.update(conversations)
    .set({ isScheduledTask, updatedAt: new Date() })
    .where(eq(conversations.id, id))
    .run()
}


export function deleteAllConversations() {
  const db = getDatabase()
  db.delete(conversations).run()
}

export function forkConversation(sourceId: string, upToMessageId?: string) {
  const db = getDatabase()
  const source = db.select().from(conversations).where(eq(conversations.id, sourceId)).get()
  if (!source) throw new Error('Conversation not found')

  const newId = nanoid()
  const now = new Date()

  // Use a transaction for atomicity
  const result = db.transaction(() => {
    // 1. Create the forked conversation
    db.insert(conversations)
      .values({
        id: newId,
        title: `${source.title} (fork)`,
        projectId: source.projectId,
        modelId: source.modelId,
        roleId: source.roleId,
        workspacePath: source.workspacePath,
        activeLibraryId: source.activeLibraryId,
        isFavorite: false,
        isArena: false,
        isScheduledTask: false,

        createdAt: now,
        updatedAt: now
      })
      .run()

    // 2. Copy messages (all or up to cutoff by position)
    const allMessages = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, sourceId))
      .orderBy(asc(messages.createdAt))
      .all()

    let sourceMessages = allMessages
    if (upToMessageId) {
      const cutoffIndex = allMessages.findIndex((m) => m.id === upToMessageId)
      if (cutoffIndex === -1) throw new Error('Message not found in conversation')
      sourceMessages = allMessages.slice(0, cutoffIndex + 1)
    }

    const idMap = new Map<string, string>()

    for (const msg of sourceMessages) {
      const newMsgId = nanoid()
      idMap.set(msg.id, newMsgId)

      db.insert(messages)
        .values({
          id: newMsgId,
          conversationId: newId,
          parentMessageId: msg.parentMessageId ? (idMap.get(msg.parentMessageId) ?? null) : null,
          role: msg.role,
          content: msg.content,
          contentData: msg.contentData,
          modelId: msg.modelId,
          providerId: msg.providerId,
          tokensIn: msg.tokensIn,
          tokensOut: msg.tokensOut,
          cost: msg.cost,
          responseTimeMs: msg.responseTimeMs,
          createdAt: msg.createdAt
        })
        .run()
    }

    return db.select().from(conversations).where(eq(conversations.id, newId)).get()!
  })

  return result
}
