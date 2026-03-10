import { relations } from 'drizzle-orm'
import {
  providers,
  models,
  projects,
  roles,
  conversations,
  messages,
  attachments,
  statistics,
  images,
  scheduledTasks
} from './schema'

// ---------------------------------------------------------------------------
// Providers relations
// ---------------------------------------------------------------------------
export const providersRelations = relations(providers, ({ many }) => ({
  models: many(models),
  statistics: many(statistics)
}))

// ---------------------------------------------------------------------------
// Models relations
// ---------------------------------------------------------------------------
export const modelsRelations = relations(models, ({ one }) => ({
  provider: one(providers, {
    fields: [models.providerId],
    references: [providers.id]
  })
}))

// ---------------------------------------------------------------------------
// Projects relations
// ---------------------------------------------------------------------------
export const projectsRelations = relations(projects, ({ many }) => ({
  conversations: many(conversations),
  statistics: many(statistics),
  scheduledTasks: many(scheduledTasks)
}))

// ---------------------------------------------------------------------------
// Roles relations
// ---------------------------------------------------------------------------
export const rolesRelations = relations(roles, ({ many }) => ({
  conversations: many(conversations),
  scheduledTasks: many(scheduledTasks)
}))

// ---------------------------------------------------------------------------
// Conversations relations
// ---------------------------------------------------------------------------
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  project: one(projects, {
    fields: [conversations.projectId],
    references: [projects.id]
  }),
  role: one(roles, {
    fields: [conversations.roleId],
    references: [roles.id]
  }),
  messages: many(messages),
  images: many(images)
}))

// ---------------------------------------------------------------------------
// Messages relations
// ---------------------------------------------------------------------------
export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id]
  }),
  parent: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: 'messageTree'
  }),
  children: many(messages, { relationName: 'messageTree' }),
  attachments: many(attachments),
  images: many(images)
}))

// ---------------------------------------------------------------------------
// Attachments relations
// ---------------------------------------------------------------------------
export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, {
    fields: [attachments.messageId],
    references: [messages.id]
  })
}))

// ---------------------------------------------------------------------------
// Statistics relations
// ---------------------------------------------------------------------------
export const statisticsRelations = relations(statistics, ({ one }) => ({
  provider: one(providers, {
    fields: [statistics.providerId],
    references: [providers.id]
  }),
  project: one(projects, {
    fields: [statistics.projectId],
    references: [projects.id]
  })
}))

// ---------------------------------------------------------------------------
// Images relations
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Scheduled Tasks relations
// ---------------------------------------------------------------------------
export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  role: one(roles, {
    fields: [scheduledTasks.roleId],
    references: [roles.id]
  }),
  project: one(projects, {
    fields: [scheduledTasks.projectId],
    references: [projects.id]
  })
}))

// ---------------------------------------------------------------------------
// Images relations
// ---------------------------------------------------------------------------
export const imagesRelations = relations(images, ({ one }) => ({
  conversation: one(conversations, {
    fields: [images.conversationId],
    references: [conversations.id]
  }),
  message: one(messages, {
    fields: [images.messageId],
    references: [messages.id]
  })
}))
