// Types partages pour l'API IPC entre main et renderer

export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high'

export interface AttachmentRef {
  path: string
  name: string
  size: number
  type: 'image' | 'document' | 'code'
  mimeType: string
}

export interface SendMessagePayload {
  conversationId: string
  content: string
  modelId: string
  providerId: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  thinkingEffort?: ThinkingEffort
  roleId?: string
  attachments?: AttachmentRef[]
  fileContexts?: WorkspaceFileContext[]
  searchEnabled?: boolean
  libraryId?: string
  skillName?: string
  skillArgs?: string
  planMode?: boolean  // force plan mode for this message
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  extension?: string
  children?: FileNode[]
}

export interface WorkspaceInfo {
  rootPath: string
  name: string
  fileCount: number
  totalSize: number
}

export interface FileContent {
  path: string
  content: string
  language: string
  size: number
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export type FileOperationType = 'create' | 'modify' | 'delete'

export interface FileOperation {
  id: string
  type: FileOperationType
  path: string
  content?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface WorkspaceFileContext {
  path: string
  content: string
  language: string
}

/** Info about a single tool call (persisted in contentData.toolCalls) */
export interface ToolCallInfo {
  toolName: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  error?: string
}

/** A single step in a plan */
export interface PlanStep {
  id: number
  label: string
  tools?: string[]
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  enabled: boolean
}

/** Plan data stored in message contentData */
export interface PlanData {
  title: string
  steps: PlanStep[]
  status: 'proposed' | 'approved' | 'running' | 'done' | 'cancelled'
  level: 'light' | 'full'
  estimatedTokens?: number
  estimatedCost?: number
  approvedAt?: number
  completedAt?: number
}

export interface StreamChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'tool-result' | 'tool-approval' | 'tool-approval-resolved' | 'plan-proposed' | 'plan-decision' | 'plan-step' | 'plan-done' | 'finish' | 'error'
  content?: string
  error?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolCallId?: string
  toolIsError?: boolean
  approvalId?: string
  decision?: 'allow' | 'deny'
  // Plan fields
  plan?: PlanData
  planDecision?: 'approved' | 'cancelled'
  planSteps?: PlanStep[]
  stepIndex?: number
  stepStatus?: 'running' | 'done' | 'failed' | 'skipped'
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** Permission rule for tool access control */
export interface PermissionRuleInfo {
  id: string
  toolName: string
  ruleContent?: string | null
  behavior: 'allow' | 'deny' | 'ask'
  createdAt: number
}

/** Tool approval request sent during streaming */
export interface ToolApprovalRequest {
  approvalId: string
  toolName: string
  toolArgs: Record<string, unknown>
}

export interface ProviderInfo {
  id: string
  name: string
  type: 'cloud' | 'local'
  description: string
  icon: string
  requiresApiKey: boolean
  isConfigured: boolean
  isEnabled: boolean
}

export interface ModelInfo {
  id: string
  name: string
  displayName: string
  providerId: string
  type: 'text' | 'image'
  contextWindow: number
  inputPrice: number
  outputPrice: number
  supportsImages: boolean
  supportsStreaming: boolean
  supportsThinking: boolean
}

export interface ConversationInfo {
  id: string
  title: string
  projectId?: string
  modelId?: string
  roleId?: string | null
  activeLibraryId?: string | null
  isFavorite?: boolean
  isArena?: boolean
  isScheduledTask?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MessageInfo {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  providerId?: string
  tokensIn?: number
  tokensOut?: number
  cost?: number
  responseTimeMs?: number
  contentData?: Record<string, unknown>
  createdAt: Date
}

export interface ProjectInfo {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  defaultModelId?: string | null
  color?: string | null
  workspacePath?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface PromptVariable {
  name: string
  description?: string
}

export interface PromptInfo {
  id: string
  title: string
  content: string
  category?: string | null
  tags?: string[] | null
  type: 'complet' | 'complement' | 'system'
  variables?: PromptVariable[] | null
  createdAt: Date
  updatedAt: Date
}

export interface RoleVariable {
  name: string
  description?: string
}

export interface RoleInfo {
  id: string
  name: string
  description?: string | null
  systemPrompt?: string | null
  icon?: string | null
  isBuiltin: boolean
  category?: string | null
  tags?: string[] | null
  variables?: RoleVariable[] | null
  createdAt: Date
  updatedAt: Date
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  role: string
  content: string
  createdAt: number
}

export interface DailyStat {
  date: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export interface ProviderStat {
  providerId: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export interface ModelStat {
  modelId: string
  providerId: string
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
}

export interface ProjectStat {
  projectId: string | null
  projectName: string
  projectColor: string | null
  messagesCount: number
  tokensIn: number
  tokensOut: number
  totalCost: number
  conversationsCount: number
}

export interface GlobalStats {
  totalCost: number
  totalMessages: number
  totalTokensIn: number
  totalTokensOut: number
  totalResponseTimeMs: number
  totalConversations: number
  totalTtsCost: number
}

// ── TTS ─────────────────────────────────────────────
export type TtsProvider = 'browser' | 'openai' | 'google'

export interface TtsSynthesizePayload {
  provider: Exclude<TtsProvider, 'browser'>
  text: string
  speed?: number
  messageId?: string
}

export interface TtsSynthesizeResult {
  audio: string    // base64
  mimeType: string
  cost: number
}

export interface TtsProviderOption {
  id: TtsProvider
  name: string
}

// ── Scheduled Tasks ─────────────────────────────────────────
export type ScheduleType = 'manual' | 'interval' | 'daily' | 'weekly'

export interface ScheduleConfig {
  value?: number
  unit?: 'seconds' | 'minutes' | 'hours'
  time?: string       // "HH:MM"
  days?: number[]     // 0=dimanche, 1=lundi, ..., 6=samedi
}

export interface ScheduledTaskInfo {
  id: string
  name: string
  description: string
  prompt: string
  modelId: string            // "providerId::modelId"
  roleId?: string | null
  projectId?: string | null
  scheduleType: ScheduleType
  scheduleConfig: ScheduleConfig | null
  useMemory: boolean
  isEnabled: boolean
  lastRunAt?: Date | null
  nextRunAt?: Date | null
  lastRunStatus?: 'success' | 'error' | null
  lastRunError?: string | null
  lastConversationId?: string | null
  runCount: number
  createdAt: Date
  updatedAt: Date
}

export interface TaskExecutedEvent {
  taskId: string
  conversationId: string
  success: boolean
  error?: string
}

export interface ExportResult {
  exported: boolean
  filePath?: string
}

export interface ImportResult {
  imported: boolean
  conversationId?: string
  messagesCount?: number
}

export interface BackupEntry {
  path: string
  filename: string
  date: string
  size: number
}

export interface NetworkStatus {
  online: boolean
}

export interface ImageGenerateResult {
  id: string
  path: string
  base64: string
}

export interface ImageRecord {
  id: string
  prompt: string
  modelId: string
  path: string
  size: number
  createdAt: Date
}

// ── Memory Fragments ─────────────────────────────────────────
export interface MemoryFragment {
  id: string
  content: string
  isActive: boolean
  sortOrder: number
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

// ── Slash Commands ─────────────────────────────────────────
export interface SlashCommandInfo {
  id: string
  name: string
  description: string
  prompt: string
  category?: string | null
  projectId?: string | null
  isBuiltin: boolean
  sortOrder: number
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

// ── Semantic Memory (Qdrant) ─────────────────────────────────────
export interface SemanticMemoryStatusResult {
  status: string
  totalPoints: number
  collectionSize: string
}

export interface SemanticMemorySearchResult {
  id: string
  score: number
  content: string
  contentPreview: string
  conversationId: string
  projectId: string | null
  role: string
  modelId: string | null
  createdAt: number
}

export interface SemanticMemoryStats {
  totalPoints: number
  indexedConversations: number
  collectionSizeMB: string
  pendingSync: number
  status: string
}

// ── Libraries (RAG Referentiels) ─────────────────────────────
export interface LibraryInfo {
  id: string
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
  projectId?: string | null
  embeddingModel: 'local' | 'google'
  embeddingDimensions: number
  sourcesCount: number
  chunksCount: number
  totalSizeBytes: number
  status: 'empty' | 'indexing' | 'ready' | 'error'
  lastIndexedAt?: Date | null
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface LibrarySourceInfo {
  id: string
  libraryId: string
  filename: string
  originalPath: string
  storedPath: string
  mimeType: string
  sizeBytes: number
  extractedLength?: number | null
  chunksCount: number
  status: 'pending' | 'extracting' | 'chunking' | 'indexing' | 'ready' | 'error'
  errorMessage?: string | null
  contentHash?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface LibrarySearchResult {
  id: string
  score: number
  content: string
  contentPreview: string
  sourceId: string
  libraryId: string
  filename: string
  heading: string | null
  chunkIndex: number
  lineStart: number | null
  lineEnd: number | null
}

export interface LibrarySourceForMessage {
  id: number
  sourceId: string
  libraryId: string
  libraryName: string
  filename: string
  heading: string | null
  lineStart: number | null
  lineEnd: number | null
  chunkPreview: string
  score: number
}

export interface LibraryIndexingProgress {
  libraryId: string
  sourceId: string
  percent: number
  status: 'extracting' | 'chunking' | 'embedding' | 'upserting' | 'done' | 'error'
}

// ── MCP Servers ─────────────────────────────────────────
export type McpTransportType = 'stdio' | 'http' | 'sse'
export type McpServerStatus = 'connected' | 'error' | 'stopped'

export interface McpServerInfo {
  id: string
  name: string
  description?: string | null
  transportType: McpTransportType
  command?: string | null
  args?: string[] | null
  cwd?: string | null
  url?: string | null
  headers?: Record<string, string> | null
  hasEnvVars: boolean
  isEnabled: boolean
  projectId?: string | null
  icon?: string | null
  color?: string | null
  toolTimeout: number
  autoConfirm: boolean
  status: McpServerStatus
  error?: string
  toolCount: number
  namespace?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface McpStatusEvent {
  serverId: string
  status: McpServerStatus
  error?: string
  toolCount: number
}

export interface McpTestResult {
  success: boolean
  toolCount: number
  toolNames: string[]
  error?: string
}

// ── Remote (Telegram) ─────────────────────────────────────────
export type RemoteStatus = 'disconnected' | 'configuring' | 'pairing' | 'connected' | 'expired' | 'error'

export interface RemoteStatusEvent {
  status: RemoteStatus
  chatId?: string
}

export interface RemoteConfig {
  hasToken: boolean
  botUsername: string | null
  allowedUserId: number | null
  status: RemoteStatus
  session: RemoteSession | null
}

export interface RemoteSession {
  id: string
  chatId: string | null
  isActive: boolean
  autoApproveRead: boolean
  autoApproveWrite: boolean
  autoApproveBash: boolean
  autoApproveList: boolean
  autoApproveMcp: boolean
}

export interface AutoApproveSettings {
  autoApproveRead: boolean
  autoApproveWrite: boolean
  autoApproveBash: boolean
  autoApproveList: boolean
  autoApproveMcp: boolean
}

// ── Remote Server (WebSocket) ─────────────────────────────────────
export type RemoteServerStatus = 'stopped' | 'running' | 'error'

export interface RemoteServerConfig {
  enabled: boolean
  port: number
  isRunning: boolean
  connectedClients: number
  tunnelUrl: string | null
  cfHostname: string | null
  hasCfToken: boolean
}

export interface RemoteServerClientInfo {
  id: string
  ip: string
  userAgent: string
  connectedAt: string
  lastActivity: string
}

export interface RemoteServerStatusEvent {
  status: RemoteServerStatus
  connectedClients: number
  tunnelUrl?: string | null
}

export interface RemoteServerPairingResult {
  code: string
  url: string | null
  wsUrl: string
  qrDataUrl: string | null
}

// ── Arena (LLM vs LLM) ─────────────────────────────────────────
export interface ArenaSendPayload {
  conversationId: string
  content: string
  leftProviderId: string
  leftModelId: string
  rightProviderId: string
  rightModelId: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  thinkingEffort?: ThinkingEffort
}

export interface ArenaVotePayload {
  matchId: string
  vote: 'left' | 'right' | 'tie'
}

export interface ArenaMatch {
  id: string
  conversationId: string
  userMessageId: string
  leftMessageId: string | null
  rightMessageId: string | null
  leftProviderId: string
  leftModelId: string
  rightProviderId: string
  rightModelId: string
  vote: string | null
  votedAt: Date | null
  createdAt: Date
}

export interface ArenaChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'finish' | 'error'
  content?: string
  modelId?: string
  providerId?: string
  messageId?: string
  error?: string
  usage?: { promptTokens: number; completionTokens: number }
  cost?: number
  responseTimeMs?: number
}

export interface ArenaStat {
  modelId: string
  providerId: string
  wins: number
  losses: number
  ties: number
  totalMatches: number
}

// ── Prompt Optimizer ─────────────────────────────────────────
export interface OptimizePromptPayload {
  text: string
  modelId: string       // "providerId::modelId"
}
export interface OptimizePromptResult {
  optimizedText: string
  inputTokens: number
  outputTokens: number
}

// ── Summary ─────────────────────────────────────────────────
export interface SummarizePayload {
  conversationId: string
  modelId: string       // "providerId::modelId"
  prompt: string
}
export interface SummarizeResult {
  text: string
}

// ── Custom Models (OpenRouter, etc.) ─────────────────────────────
export interface CustomModelInfo {
  id: string
  providerId: string
  label: string
  modelId: string
  type: 'text' | 'image'
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

// ── Local Providers ─────────────────────────────────────────
export interface LocalProviderStatus { ollama: boolean; lmstudio: boolean }
export interface LocalProviderTestResult { reachable: boolean; modelCount: number; models: ModelInfo[] }

// L'API exposee au renderer via contextBridge
export interface ElectronAPI {
  // Chat
  sendMessage: (payload: SendMessagePayload) => Promise<void>
  cancelStream: () => Promise<void>
  onChunk: (callback: (chunk: StreamChunk) => void) => void
  offChunk: () => void

  // Conversations
  getConversations: (projectId?: string | null) => Promise<ConversationInfo[]>
  createConversation: (title?: string, projectId?: string) => Promise<ConversationInfo>
  deleteConversation: (id: string) => Promise<void>
  deleteAllConversations: () => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  setConversationProject: (id: string, projectId: string | null) => Promise<void>
  toggleConversationFavorite: (id: string, isFavorite: boolean) => Promise<ConversationInfo>
  forkConversation: (id: string, upToMessageId?: string) => Promise<ConversationInfo>
  getMessages: (conversationId: string) => Promise<MessageInfo[]>
  getMessagesPage: (payload: {
    conversationId: string
    limit?: number
    beforeDate?: string
  }) => Promise<{
    messages: MessageInfo[]
    totalCount: number
    hasMore: boolean
  }>

  // Providers
  getProviders: () => Promise<ProviderInfo[]>
  getModels: (providerId?: string) => Promise<ModelInfo[]>
  setApiKey: (providerId: string, apiKey: string) => Promise<void>
  validateApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  hasApiKey: (providerId: string) => Promise<boolean>
  getApiKeyMasked: (providerId: string) => Promise<string | null>

  // Custom Models (OpenRouter, etc.)
  getCustomModels: (providerId?: string) => Promise<CustomModelInfo[]>
  createCustomModel: (data: { providerId: string; label: string; modelId: string; type: 'text' | 'image' }) => Promise<CustomModelInfo>
  updateCustomModel: (id: string, data: { label?: string; modelId?: string; type?: 'text' | 'image' }) => Promise<CustomModelInfo | undefined>
  deleteCustomModel: (id: string) => Promise<void>

  // Local Providers
  detectLocalProviders: () => Promise<LocalProviderStatus>
  getLocalModels: (providerId: string) => Promise<ModelInfo[]>
  setLocalProviderBaseUrl: (providerId: string, baseUrl: string) => Promise<void>
  testLocalProviderConnection: (providerId: string, baseUrl?: string) => Promise<LocalProviderTestResult>

  // Projects
  getProjects: () => Promise<ProjectInfo[]>
  createProject: (data: { name: string; description?: string; systemPrompt?: string; defaultModelId?: string; color?: string; workspacePath?: string }) => Promise<ProjectInfo>
  updateProject: (id: string, data: { name?: string; description?: string | null; systemPrompt?: string | null; defaultModelId?: string | null; color?: string | null; workspacePath?: string | null }) => Promise<ProjectInfo | undefined>
  deleteProject: (id: string) => Promise<void>

  // Prompts
  getPrompts: () => Promise<PromptInfo[]>
  getPromptsByCategory: (category: string) => Promise<PromptInfo[]>
  getPromptsByType: (type: string) => Promise<PromptInfo[]>
  searchPrompts: (query: string) => Promise<PromptInfo[]>
  createPrompt: (data: { title: string; content: string; category?: string; tags?: string[]; type: 'complet' | 'complement' | 'system'; variables?: PromptVariable[] }) => Promise<PromptInfo>
  updatePrompt: (id: string, data: { title?: string; content?: string; category?: string | null; tags?: string[] | null; type?: 'complet' | 'complement' | 'system'; variables?: PromptVariable[] | null }) => Promise<PromptInfo | undefined>
  deletePrompt: (id: string) => Promise<void>

  // Roles
  getRoles: () => Promise<RoleInfo[]>
  createRole: (data: { name: string; description?: string; systemPrompt?: string; icon?: string; category?: string; tags?: string[]; variables?: RoleVariable[] }) => Promise<RoleInfo>
  updateRole: (id: string, data: { name?: string; description?: string | null; systemPrompt?: string | null; icon?: string | null; category?: string | null; tags?: string[] | null; variables?: RoleVariable[] | null }) => Promise<RoleInfo | undefined>
  deleteRole: (id: string) => Promise<void>
  getRole: (id: string) => Promise<RoleInfo | undefined>
  setConversationRole: (id: string, roleId: string | null) => Promise<void>

  // Search
  searchMessages: (query: string) => Promise<SearchResult[]>

  // Export
  exportConversation: (data: { conversationId: string; format: 'md' | 'json' | 'txt' | 'html' }) => Promise<ExportResult>
  exportBulk: () => Promise<{ exported: boolean; filePath?: string }>

  // Import
  importConversation: (data: { format: 'json' | 'chatgpt' | 'claude' }) => Promise<ImportResult>
  importBulk: () => Promise<{ imported: boolean; needsToken?: boolean; projectsImported?: number; conversationsImported?: number; messagesImported?: number }>
  importBulkWithToken: (data: { tokenHex: string }) => Promise<{ imported: boolean; projectsImported?: number; conversationsImported?: number; messagesImported?: number }>

  // Instance Token
  getInstanceTokenMasked: () => Promise<string>
  copyInstanceToken: () => Promise<string>

  // Statistics
  getDailyStats: (days?: number) => Promise<DailyStat[]>
  getProviderStats: (days?: number) => Promise<ProviderStat[]>
  getModelStats: (days?: number) => Promise<ModelStat[]>
  getGlobalStats: (days?: number) => Promise<GlobalStats>
  getProjectStats: (days?: number) => Promise<ProjectStat[]>

  // Events
  onConversationUpdated: (callback: (data: { id: string; title: string }) => void) => void
  offConversationUpdated: () => void

  // Notifications
  showNotification: (data: { title: string; body: string; silent?: boolean }) => Promise<void>
  setBadge: (count: number) => Promise<void>
  clearBadge: () => Promise<void>

  // Backup
  backupCreate: () => Promise<BackupEntry>
  backupList: () => Promise<BackupEntry[]>
  backupRestore: (backupPath: string) => Promise<{ restored: boolean }>
  backupDelete: (backupPath: string) => Promise<{ deleted: boolean }>
  backupClean: (keep?: number) => Promise<{ removed: number }>

  // Network
  getNetworkStatus: () => Promise<NetworkStatus>
  onNetworkChanged: (callback: (status: NetworkStatus) => void) => void
  offNetworkChanged: () => void

  // Files (attachments)
  filePick: () => Promise<AttachmentRef[]>
  fileSave: (data: { buffer: ArrayBuffer; filename: string }) => Promise<{ path: string; size: number }>
  fileRead: (filePath: string) => Promise<ArrayBuffer>
  fileReadText: (filePath: string) => Promise<{ path: string; name: string; content: string; language: string; size: number }>
  getFilePath: (file: File) => string
  fileOpenInOS: (filePath: string) => Promise<string>
  fileShowInFolder: (filePath: string) => Promise<void>

  // Images (generation)
  generateImage: (data: { prompt: string; model?: string; aspectRatio?: string; conversationId?: string; providerId?: string }) => Promise<ImageGenerateResult>
  listImages: () => Promise<ImageRecord[]>

  // Updater (auto-update)
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdaterAvailable: (callback: (data: { version: string; releaseNotes?: string }) => void) => void
  onUpdaterProgress: (callback: (data: { percent: number }) => void) => void
  onUpdaterDownloaded: (callback: (data: { version: string }) => void) => void
  onUpdaterError: (callback: (data: { message: string }) => void) => void
  offUpdater: () => void

  // Workspace
  workspaceSelectFolder: () => Promise<string | null>
  workspaceOpen: (data: { rootPath: string; projectId?: string }) => Promise<WorkspaceInfo>
  workspaceClose: () => Promise<void>
  workspaceOpenInFinder: (folderPath: string) => Promise<void>
  workspaceGetTree: (relativePath?: string) => Promise<FileNode | FileNode[]>
  workspaceReadFile: (path: string) => Promise<FileContent>
  workspaceWriteFile: (data: { path: string; content: string }) => Promise<void>
  workspaceDeleteFile: (path: string) => Promise<void>
  workspaceGetInfo: () => Promise<WorkspaceInfo | null>
  onWorkspaceFileChanged: (callback: (event: FileChangeEvent) => void) => void
  offWorkspaceFileChanged: () => void

  // TTS
  ttsSynthesize: (payload: TtsSynthesizePayload) => Promise<TtsSynthesizeResult>
  ttsGetAvailableProviders: () => Promise<TtsProviderOption[]>

  // Scheduled Tasks
  getScheduledTasks: () => Promise<ScheduledTaskInfo[]>
  getScheduledTask: (id: string) => Promise<ScheduledTaskInfo | undefined>
  createScheduledTask: (data: {
    name: string
    description: string
    prompt: string
    modelId: string
    roleId?: string | null
    projectId?: string | null
    scheduleType: ScheduleType
    scheduleConfig: { type: string; value?: number; unit?: string; time?: string; days?: number[] }
    useMemory?: boolean
  }) => Promise<ScheduledTaskInfo>
  updateScheduledTask: (id: string, data: {
    name?: string
    description?: string
    prompt?: string
    modelId?: string
    roleId?: string | null
    projectId?: string | null
    scheduleType?: ScheduleType
    scheduleConfig?: { type: string; value?: number; unit?: string; time?: string; days?: number[] }
    isEnabled?: boolean
    useMemory?: boolean
  }) => Promise<ScheduledTaskInfo | undefined>
  deleteScheduledTask: (id: string) => Promise<void>
  executeScheduledTask: (id: string) => Promise<void>
  toggleScheduledTask: (id: string) => Promise<ScheduledTaskInfo | undefined>
  onTaskExecuted: (callback: (data: TaskExecutedEvent) => void) => void
  offTaskExecuted: () => void

  // Memory Fragments
  listMemoryFragments: () => Promise<MemoryFragment[]>
  getActiveMemoryBlock: () => Promise<string | null>
  createMemoryFragment: (payload: { content: string; isActive?: boolean }) => Promise<MemoryFragment>
  updateMemoryFragment: (payload: { id: string; content?: string; isActive?: boolean }) => Promise<MemoryFragment | undefined>
  deleteMemoryFragment: (payload: { id: string }) => Promise<void>
  reorderMemoryFragments: (payload: { orderedIds: string[] }) => Promise<void>
  toggleMemoryFragment: (payload: { id: string }) => Promise<MemoryFragment | undefined>

  // Slash Commands
  slashCommandsList: () => Promise<SlashCommandInfo[]>
  slashCommandsGet: (id: string) => Promise<SlashCommandInfo | undefined>
  slashCommandsCreate: (data: { name: string; description: string; prompt: string; category?: string; projectId?: string }) => Promise<SlashCommandInfo>
  slashCommandsUpdate: (id: string, data: { name?: string; description?: string; prompt?: string; category?: string | null; projectId?: string | null }) => Promise<SlashCommandInfo | undefined>
  slashCommandsDelete: (id: string) => Promise<void>
  slashCommandsReset: (id: string) => Promise<SlashCommandInfo | undefined>
  slashCommandsReorder: (orderedIds: string[]) => Promise<void>
  slashCommandsSeed: () => Promise<void>

  // MCP Servers
  mcpList: () => Promise<McpServerInfo[]>
  mcpGet: (id: string) => Promise<McpServerInfo | undefined>
  mcpGetEnvKeys: (id: string) => Promise<string[]>
  mcpCreate: (data: {
    name: string
    description?: string
    transportType: McpTransportType
    command?: string
    args?: string[]
    cwd?: string
    url?: string
    headers?: Record<string, string>
    envVars?: Record<string, string>
    isEnabled?: boolean
    projectId?: string | null
    icon?: string
    color?: string
    toolTimeout?: number
    autoConfirm?: boolean
  }) => Promise<McpServerInfo>
  mcpUpdate: (id: string, data: {
    name?: string
    description?: string | null
    transportType?: McpTransportType
    command?: string | null
    args?: string[] | null
    cwd?: string | null
    url?: string | null
    headers?: Record<string, string> | null
    envVars?: Record<string, string> | null
    isEnabled?: boolean
    projectId?: string | null
    icon?: string | null
    color?: string | null
    toolTimeout?: number
    autoConfirm?: boolean
  }) => Promise<McpServerInfo | undefined>
  mcpDelete: (id: string) => Promise<void>
  mcpToggle: (id: string) => Promise<McpServerInfo | undefined>
  mcpStart: (id: string) => Promise<void>
  mcpStop: (id: string) => Promise<void>
  mcpRestart: (id: string) => Promise<void>
  mcpTest: (data: {
    transportType: McpTransportType
    command?: string
    args?: string[]
    cwd?: string
    url?: string
    headers?: Record<string, string>
    envVars?: Record<string, string>
  }) => Promise<McpTestResult>
  onMcpStatusChanged: (callback: (event: McpStatusEvent) => void) => void
  offMcpStatusChanged: () => void

  // Remote (Telegram)
  remoteConfigure: (token: string) => Promise<{ botUsername: string }>
  remoteStart: (conversationId?: string) => Promise<{ pairingCode: string }>
  remoteStop: () => Promise<void>
  remoteGetStatus: () => Promise<{ status: RemoteStatus }>
  remoteGetConfig: () => Promise<RemoteConfig>
  remoteSetAutoApprove: (data: AutoApproveSettings) => Promise<void>
  remoteSetAllowedUser: (userId: number | null) => Promise<void>
  remoteDeleteToken: () => Promise<void>
  onRemoteStatusChanged: (callback: (event: RemoteStatusEvent) => void) => void
  offRemoteStatusChanged: () => void

  // Remote Server (WebSocket)
  remoteServerStart: (data?: { conversationId?: string }) => Promise<{ port: number; tunnelUrl: string | null }>
  remoteServerStop: () => Promise<void>
  remoteServerGetConfig: () => Promise<RemoteServerConfig>
  remoteServerSetConfig: (data: { port?: number; cfToken?: string | null; cfHostname?: string | null }) => Promise<RemoteServerConfig>
  remoteServerGeneratePairing: (data?: { conversationId?: string }) => Promise<RemoteServerPairingResult>
  remoteServerDisconnectClient: (clientId: string) => Promise<void>
  remoteServerGetClients: () => Promise<RemoteServerClientInfo[]>
  remoteServerSetAutoApprove: (data: AutoApproveSettings) => Promise<void>
  onRemoteServerStatusChanged: (callback: (event: RemoteServerStatusEvent) => void) => void
  offRemoteServerStatusChanged: () => void
  onRemoteServerClientConnected: (callback: (data: { id: string; ip: string; userAgent: string; connectedAt: string }) => void) => void
  offRemoteServerClientConnected: () => void
  onRemoteServerClientDisconnected: (callback: (data: { id: string }) => void) => void
  offRemoteServerClientDisconnected: () => void

  // Prompt Optimizer
  optimizePrompt: (payload: OptimizePromptPayload) => Promise<OptimizePromptResult>

  // Summary
  summarizeConversation: (payload: SummarizePayload) => Promise<SummarizeResult>

  // Profile
  selectAvatar: () => Promise<string | null>
  removeAvatar: () => Promise<boolean>

  // Data (cleanup / factory reset)
  dataCleanup: () => Promise<{ success: boolean }>
  dataFactoryReset: () => Promise<{ success: boolean }>

  // Semantic Memory (Qdrant)
  semanticMemoryStatus: () => Promise<SemanticMemoryStatusResult>
  semanticMemorySearch: (payload: { query: string; topK?: number; projectId?: string }) => Promise<SemanticMemorySearchResult[]>
  semanticMemoryForget: (payload: { pointIds: string[] }) => Promise<void>
  semanticMemoryForgetConversation: (payload: { conversationId: string }) => Promise<void>
  semanticMemoryForgetAll: () => Promise<void>
  semanticMemoryReindex: () => Promise<void>
  semanticMemoryToggle: (payload: { enabled: boolean }) => Promise<void>
  semanticMemoryStats: () => Promise<SemanticMemoryStats>

  // Libraries (RAG Referentiels)
  libraryList: () => Promise<LibraryInfo[]>
  libraryGet: (payload: { id: string }) => Promise<LibraryInfo | null>
  libraryCreate: (payload: { name: string; description?: string; color?: string; icon?: string; projectId?: string; embeddingModel?: 'local' | 'google' }) => Promise<LibraryInfo>
  libraryUpdate: (payload: { id: string; name?: string; description?: string; color?: string; icon?: string }) => Promise<LibraryInfo | null>
  libraryDelete: (payload: { id: string }) => Promise<void>
  libraryAddSources: (payload: { libraryId: string; filePaths: string[] }) => Promise<LibrarySourceInfo[]>
  libraryRemoveSource: (payload: { libraryId: string; sourceId: string }) => Promise<void>
  libraryGetSources: (payload: { libraryId: string }) => Promise<LibrarySourceInfo[]>
  libraryReindexSource: (payload: { libraryId: string; sourceId: string }) => Promise<void>
  libraryReindexAll: (payload: { libraryId: string }) => Promise<void>
  librarySearch: (payload: { libraryId: string; query: string; topK?: number }) => Promise<LibrarySearchResult[]>
  libraryStats: (payload: { libraryId: string }) => Promise<LibraryInfo & { qdrantPoints: number; collectionSizeMB: string } | null>
  libraryPickFiles: () => Promise<string[]>
  libraryAttach: (payload: { conversationId: string; libraryId: string }) => Promise<void>
  libraryDetach: (payload: { conversationId: string }) => Promise<void>
  libraryGetAttached: (payload: { conversationId: string }) => Promise<string | null>
  onLibraryIndexingProgress: (callback: (progress: LibraryIndexingProgress) => void) => void
  offLibraryIndexingProgress: () => void

  // Arena (LLM vs LLM)
  arenaSend: (payload: ArenaSendPayload) => Promise<void>
  arenaCancel: () => Promise<void>
  arenaVote: (payload: ArenaVotePayload) => Promise<void>
  arenaGetMatches: (payload: { conversationId: string }) => Promise<ArenaMatch[]>
  arenaGetStats: () => Promise<ArenaStat[]>
  onArenaChunkLeft: (callback: (chunk: ArenaChunk) => void) => void
  offArenaChunkLeft: () => void
  onArenaChunkRight: (callback: (chunk: ArenaChunk) => void) => void
  offArenaChunkRight: () => void
  onArenaMatchCreated: (callback: (data: { matchId: string }) => void) => void
  offArenaMatchCreated: () => void

  // Barda (Gestion de Brigade)
  bardaList: () => Promise<BardaInfo[]>
  bardaImport: (filePath: string) => Promise<BardaImportReport>
  bardaPreview: (filePath: string) => Promise<{ success: true; data: ParsedBarda } | { success: false; error: BardaParseError }>
  bardaToggle: (id: string, isEnabled: boolean) => Promise<void>
  bardaUninstall: (id: string) => Promise<void>

  // Skills
  skillsList: () => Promise<SkillInfo[]>
  skillsValidate: (dirPath: string) => Promise<SkillValidationResult>
  skillsScan: (dirPath: string) => Promise<any>
  skillsInstallGit: (gitUrl: string) => Promise<SkillScanResult>
  skillsConfirmInstall: (data: { tempDir?: string; localDir?: string; gitUrl?: string; matonVerdict?: string | null; matonReport?: Record<string, unknown> | null }) => Promise<SkillInfo>
  skillsToggle: (id: string, enabled: boolean) => Promise<void>
  skillsUninstall: (id: string) => Promise<void>
  skillsGetTree: (name: string) => Promise<SkillTreeNode[]>
  skillsGetContent: (name: string) => Promise<{ content: string; frontmatter: any } | null>
  skillsOpenFinder: (name: string) => Promise<void>
  skillsCheckPython: () => Promise<boolean>
  skillsAnalyze: (targetDir: string) => Promise<SkillAnalyzeResult>

  // Conversations: Workspace
  conversationSetWorkspacePath: (id: string, workspacePath: string) => Promise<void>

  // Permissions
  permissionsList: () => Promise<PermissionRuleInfo[]>
  permissionsAdd: (data: { toolName: string; ruleContent: string | null; behavior: 'allow' | 'deny' | 'ask' }) => Promise<PermissionRuleInfo>
  permissionsDelete: (data: { id: string }) => Promise<void>
  permissionsReset: () => Promise<void>

  // Tool Approval
  approveToolCall: (approvalId: string, decision: 'allow' | 'deny' | 'allow-session') => Promise<void>

  // YOLO Mode (per-conversation, owned by main process)
  setYoloMode: (conversationId: string, enabled: boolean) => Promise<void>
  getYoloMode: (conversationId: string) => Promise<boolean>

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>

  // Plan Mode
  approvePlan: (payload: { conversationId: string; messageId: string; decision: 'approved' | 'cancelled'; steps: { id: number; label: string; tools?: string[]; status: string; enabled: boolean }[] }) => Promise<void>
  setPlanMode: (payload: { conversationId: string; forced: boolean }) => Promise<void>
  updatePlanStep: (payload: { conversationId: string; messageId: string; stepIndex: number; action: 'retry' | 'skip' | 'abort' }) => Promise<void>
}

// ---------------------------------------------------------------------------
// Barda (Gestion de Brigade)
// ---------------------------------------------------------------------------

export interface BardaInfo {
  id: string
  namespace: string
  name: string
  description?: string
  version?: string
  author?: string
  isEnabled: boolean
  rolesCount: number
  commandsCount: number
  promptsCount: number
  fragmentsCount: number
  librariesCount: number
  mcpServersCount: number
  skillsCount: number
  createdAt: number
}

export interface ParsedResource {
  name: string
  content: string
  mcpConfig?: {
    transportType: string
    command?: string
    args?: string[]
    url?: string
    headers?: Record<string, string>
  }
}

export interface ParsedBarda {
  metadata: {
    name: string
    namespace: string
    version?: string
    description?: string
    author?: string
  }
  roles: ParsedResource[]
  commands: ParsedResource[]
  prompts: ParsedResource[]
  fragments: ParsedResource[]
  libraries: ParsedResource[]
  mcp: ParsedResource[]
  skills: ParsedResource[]
}

export interface BardaImportReport {
  bardaId: string
  succes: string[]
  skips: Array<{ type: string; name: string; reason: string }>
  warnings: string[]
}

export interface BardaParseError {
  line: number
  message: string
}

// ── Skills ───────────────────────────────────────────────
export interface SkillInfo {
  id: string
  name: string
  description: string | null
  allowedTools: string[] | null
  shell: string | null
  effort: string | null
  argumentHint: string | null
  userInvocable: boolean | null
  enabled: boolean | null
  source: 'local' | 'git' | 'barda'
  gitUrl: string | null
  namespace: string | null
  matonVerdict: string | null
  matonReport: Record<string, unknown> | null
  installedAt: number
}

export interface SkillTreeNode {
  name: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillTreeNode[]
}

export interface SkillScanResult {
  success: boolean
  phase?: 'scanned'
  tempDir?: string
  name?: string
  description?: string
  matonVerdict?: string | null
  matonReport?: Record<string, unknown> | null
  pythonMissing?: boolean
  error?: string
}

export interface SkillValidationResult {
  success: boolean
  name?: string
  description?: string
  error?: string
}

export interface SkillAnalyzeResult {
  success: boolean
  text?: string
  model?: string
  tokensIn?: number
  tokensOut?: number
  cost?: number
  error?: string
}

