import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['cloud', 'local'] }).notNull(),
  baseUrl: text('base_url'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  providerId: text('provider_id')
    .notNull()
    .references(() => providers.id),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  contextWindow: integer('context_window').notNull(),
  inputPrice: real('input_price'),
  outputPrice: real('output_price'),
  supportsImages: integer('supports_images', { mode: 'boolean' }).notNull().default(false),
  supportsStreaming: integer('supports_streaming', { mode: 'boolean' }).notNull().default(true),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true)
})

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  defaultModelId: text('default_model_id'),
  color: text('color'),
  workspacePath: text('workspace_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  icon: text('icon'),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  category: text('category'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  variables: text('variables', { mode: 'json' }).$type<Array<{ name: string; description?: string }>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  projectId: text('project_id').references(() => projects.id),
  modelId: text('model_id'),
  roleId: text('role_id').references(() => roles.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id),
  parentMessageId: text('parent_message_id'),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  contentData: text('content_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  modelId: text('model_id'),
  providerId: text('provider_id'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  cost: real('cost'),
  responseTimeMs: integer('response_time_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  path: text('path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  type: text('type', { enum: ['complet', 'complement', 'system'] }).notNull(),
  variables: text('variables', { mode: 'json' }).$type<Array<{ name: string; description?: string }>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export const statistics = sqliteTable('statistics', {
  id: text('id').primaryKey(),
  date: text('date').notNull(), // YYYY-MM-DD
  providerId: text('provider_id'),
  modelId: text('model_id'),
  projectId: text('project_id'),
  messagesCount: integer('messages_count').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  totalCost: real('total_cost').notNull().default(0),
  avgResponseTimeMs: real('avg_response_time_ms')
})

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').references(() => conversations.id),
  messageId: text('message_id').references(() => messages.id),
  prompt: text('prompt').notNull(),
  modelId: text('model_id'),
  width: integer('width'),
  height: integer('height'),
  path: text('path').notNull(),
  size: integer('size'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})
