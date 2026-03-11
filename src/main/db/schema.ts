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
// TTS Usage
// ---------------------------------------------------------------------------
export const ttsUsage = sqliteTable('tts_usage', {
  id: text('id').primaryKey(),
  messageId: text('message_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  textLength: integer('text_length').notNull(),
  cost: real('cost').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Scheduled Tasks
// ---------------------------------------------------------------------------
export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  prompt: text('prompt').notNull(),
  modelId: text('model_id').notNull(),
  roleId: text('role_id').references(() => roles.id),
  projectId: text('project_id').references(() => projects.id),
  scheduleType: text('schedule_type', {
    enum: ['manual', 'interval', 'daily', 'weekly']
  }).notNull(),
  scheduleConfig: text('schedule_config', { mode: 'json' }).$type<{
    value?: number
    unit?: 'seconds' | 'minutes' | 'hours'
    time?: string
    days?: number[]
  } | null>(),
  useMemory: integer('use_memory', { mode: 'boolean' }).notNull().default(true),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  lastRunStatus: text('last_run_status', {
    enum: ['success', 'error']
  }),
  lastRunError: text('last_run_error'),
  lastConversationId: text('last_conversation_id'),
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),

  // Transport
  transportType: text('transport_type', {
    enum: ['stdio', 'http', 'sse']
  }).notNull(),

  // Config stdio
  command: text('command'),
  args: text('args', { mode: 'json' }).$type<string[]>(),
  cwd: text('cwd'),

  // Config HTTP/SSE
  url: text('url'),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(),

  // Env vars (chiffrees via safeStorage, stockees comme JSON chiffre)
  envEncrypted: text('env_encrypted'),

  // Etat
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),

  // Scope
  projectId: text('project_id').references(() => projects.id),

  // Metadata
  icon: text('icon'),
  color: text('color'),
  toolTimeout: integer('tool_timeout').default(30000),
  autoConfirm: integer('auto_confirm', { mode: 'boolean' }).notNull().default(true),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Memory Fragments
// ---------------------------------------------------------------------------
export const memoryFragments = sqliteTable('memory_fragments', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ---------------------------------------------------------------------------
// Remote Sessions (Telegram)
// ---------------------------------------------------------------------------
export const remoteSessions = sqliteTable('remote_sessions', {
  id: text('id').primaryKey(),
  telegramChatId: text('telegram_chat_id'),
  botUsername: text('bot_username'),
  pairedAt: integer('paired_at', { mode: 'timestamp' }),
  lastActivity: integer('last_activity', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  conversationId: text('conversation_id').references(() => conversations.id),
  autoApproveRead: integer('auto_approve_read', { mode: 'boolean' }).notNull().default(true),
  autoApproveWrite: integer('auto_approve_write', { mode: 'boolean' }).notNull().default(false),
  autoApproveBash: integer('auto_approve_bash', { mode: 'boolean' }).notNull().default(false),
  autoApproveList: integer('auto_approve_list', { mode: 'boolean' }).notNull().default(true),
  autoApproveMcp: integer('auto_approve_mcp', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // WebSocket remote columns (session 25)
  sessionType: text('session_type').default('telegram'),
  wsClientFingerprint: text('ws_client_fingerprint'),
  wsSessionToken: text('ws_session_token'),
  wsIpAddress: text('ws_ip_address')
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
