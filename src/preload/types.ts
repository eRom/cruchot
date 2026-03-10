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
}

export interface StreamChunk {
  type: 'start' | 'text-delta' | 'reasoning-delta' | 'tool-call' | 'finish' | 'error'
  content?: string
  error?: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
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
  getMessages: (conversationId: string) => Promise<MessageInfo[]>

  // Providers
  getProviders: () => Promise<ProviderInfo[]>
  getModels: (providerId?: string) => Promise<ModelInfo[]>
  setApiKey: (providerId: string, apiKey: string) => Promise<void>
  validateApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  hasApiKey: (providerId: string) => Promise<boolean>
  getApiKeyMasked: (providerId: string) => Promise<string | null>

  // Projects
  getProjects: () => Promise<ProjectInfo[]>
  createProject: (data: { name: string; description?: string; systemPrompt?: string; defaultModelId?: string; color?: string }) => Promise<ProjectInfo>
  updateProject: (id: string, data: { name?: string; description?: string | null; systemPrompt?: string | null; defaultModelId?: string | null; color?: string | null }) => Promise<ProjectInfo | undefined>
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

  // Import
  importConversation: (data: { format: 'json' | 'chatgpt' | 'claude' }) => Promise<ImportResult>

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

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
}
