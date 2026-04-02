import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ElectronAPI, SendMessagePayload, StreamChunk, PermissionRuleInfo } from './types'

// Expose une API securisee au renderer — JAMAIS ipcRenderer directement
const api: ElectronAPI = {
  // ── Chat ──────────────────────────────────────────────
  sendMessage: (payload: SendMessagePayload): Promise<void> =>
    ipcRenderer.invoke('chat:send', payload),

  cancelStream: (): Promise<void> =>
    ipcRenderer.invoke('chat:cancel'),

  onChunk: (callback: (chunk: StreamChunk) => void): void => {
    ipcRenderer.on('chat:chunk', (_event, chunk: StreamChunk) => callback(chunk))
  },

  offChunk: (): void => {
    ipcRenderer.removeAllListeners('chat:chunk')
  },

  // ── Conversations ─────────────────────────────────────
  getConversations: (projectId?: string | null) =>
    ipcRenderer.invoke('conversations:list', projectId),

  createConversation: (title?: string, projectId?: string) =>
    ipcRenderer.invoke('conversations:create', title, projectId),

  deleteConversation: (id: string): Promise<void> =>
    ipcRenderer.invoke('conversations:delete', id),

  deleteAllConversations: (): Promise<void> =>
    ipcRenderer.invoke('conversations:deleteAll'),

  renameConversation: (id: string, title: string): Promise<void> =>
    ipcRenderer.invoke('conversations:rename', id, title),

  setConversationProject: (id: string, projectId: string | null): Promise<void> =>
    ipcRenderer.invoke('conversations:setProject', id, projectId),

  toggleConversationFavorite: (id: string, isFavorite: boolean) =>
    ipcRenderer.invoke('conversations:toggleFavorite', { id, isFavorite }),

  forkConversation: (id: string, upToMessageId?: string) =>
    ipcRenderer.invoke('conversations:fork', { id, upToMessageId }),

  getMessages: (conversationId: string): Promise<ReturnType<ElectronAPI['getMessages']>> =>
    ipcRenderer.invoke('conversations:messages', conversationId),

  getMessagesPage: (payload: {
    conversationId: string
    limit?: number
    beforeDate?: string
  }): Promise<ReturnType<ElectronAPI['getMessagesPage']>> =>
    ipcRenderer.invoke('conversations:messagesPage', payload),

  // ── Providers ─────────────────────────────────────────
  getProviders: (): Promise<ReturnType<ElectronAPI['getProviders']>> =>
    ipcRenderer.invoke('providers:list'),

  getModels: (providerId?: string): Promise<ReturnType<ElectronAPI['getModels']>> =>
    ipcRenderer.invoke('providers:models', providerId),

  setApiKey: (providerId: string, apiKey: string): Promise<void> =>
    ipcRenderer.invoke('providers:setApiKey', providerId, apiKey),

  validateApiKey: (providerId: string, apiKey: string): Promise<boolean> =>
    ipcRenderer.invoke('providers:validateApiKey', providerId, apiKey),

  hasApiKey: (providerId: string): Promise<boolean> =>
    ipcRenderer.invoke('providers:hasApiKey', providerId),

  getApiKeyMasked: (providerId: string): Promise<string | null> =>
    ipcRenderer.invoke('providers:getApiKeyMasked', providerId),

  // ── Custom Models (OpenRouter, etc.) ──────────────────────
  getCustomModels: (providerId?: string) =>
    ipcRenderer.invoke('custom-models:list', providerId),

  createCustomModel: (data: { providerId: string; label: string; modelId: string; type: 'text' | 'image' }) =>
    ipcRenderer.invoke('custom-models:create', data),

  updateCustomModel: (id: string, data: { label?: string; modelId?: string; type?: 'text' | 'image' }) =>
    ipcRenderer.invoke('custom-models:update', id, data),

  deleteCustomModel: (id: string) =>
    ipcRenderer.invoke('custom-models:delete', id),

  // ── Local Providers ─────────────────────────────────────
  detectLocalProviders: () =>
    ipcRenderer.invoke('localProviders:detect'),

  getLocalModels: (providerId: string) =>
    ipcRenderer.invoke('localProviders:models', providerId),

  setLocalProviderBaseUrl: (providerId: string, baseUrl: string) =>
    ipcRenderer.invoke('localProviders:setBaseUrl', { providerId, baseUrl }),

  testLocalProviderConnection: (providerId: string, baseUrl?: string) =>
    ipcRenderer.invoke('localProviders:testConnection', { providerId, baseUrl }),

  // ── Projects ──────────────────────────────────────────
  getProjects: () => ipcRenderer.invoke('projects:list'),

  createProject: (data) => ipcRenderer.invoke('projects:create', data),

  updateProject: (id, data) => ipcRenderer.invoke('projects:update', id, data),

  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),

  // ── Prompts ───────────────────────────────────────────
  getPrompts: () => ipcRenderer.invoke('prompts:list'),

  getPromptsByCategory: (category) => ipcRenderer.invoke('prompts:byCategory', category),

  getPromptsByType: (type) => ipcRenderer.invoke('prompts:byType', type),

  searchPrompts: (query) => ipcRenderer.invoke('prompts:search', query),

  createPrompt: (data) => ipcRenderer.invoke('prompts:create', data),

  updatePrompt: (id, data) => ipcRenderer.invoke('prompts:update', id, data),

  deletePrompt: (id) => ipcRenderer.invoke('prompts:delete', id),

  // ── Roles ─────────────────────────────────────────────
  getRoles: () => ipcRenderer.invoke('roles:list'),

  getRole: (id) => ipcRenderer.invoke('roles:get', id),

  createRole: (data) => ipcRenderer.invoke('roles:create', data),

  updateRole: (id, data) => ipcRenderer.invoke('roles:update', id, data),

  deleteRole: (id) => ipcRenderer.invoke('roles:delete', id),

  setConversationRole: (id, roleId) => ipcRenderer.invoke('conversations:setRole', id, roleId),

  // ── Search ────────────────────────────────────────────
  searchMessages: (query) => ipcRenderer.invoke('search:messages', query),

  // ── Export ────────────────────────────────────────────
  exportConversation: (data) => ipcRenderer.invoke('export:conversation', data),
  exportBulk: () => ipcRenderer.invoke('export:bulk'),

  // ── Import ────────────────────────────────────────────
  importConversation: (data) => ipcRenderer.invoke('import:conversation', data),
  importBulk: () => ipcRenderer.invoke('import:bulk'),
  importBulkWithToken: (data) => ipcRenderer.invoke('import:bulk-with-token', data),

  // ── Instance Token ────────────────────────────────────
  getInstanceTokenMasked: () => ipcRenderer.invoke('instance-token:get-masked'),
  copyInstanceToken: () => ipcRenderer.invoke('instance-token:copy'),

  // ── Statistics ────────────────────────────────────────
  getDailyStats: (days) => ipcRenderer.invoke('statistics:daily', days),

  getProviderStats: (days) => ipcRenderer.invoke('statistics:providers', days),

  getModelStats: (days) => ipcRenderer.invoke('statistics:models', days),

  getGlobalStats: (days) => ipcRenderer.invoke('statistics:total', days),

  getProjectStats: (days) => ipcRenderer.invoke('statistics:projects', days),

  // ── Events ────────────────────────────────────────────
  onConversationUpdated: (callback: (data: { id: string; title: string }) => void): void => {
    ipcRenderer.on('conversation:updated', (_event, data) => callback(data))
  },

  offConversationUpdated: (): void => {
    ipcRenderer.removeAllListeners('conversation:updated')
  },

  // ── Notifications ─────────────────────────────────────
  showNotification: (data) => ipcRenderer.invoke('notification:show', data),

  setBadge: (count) => ipcRenderer.invoke('notification:setBadge', { count }),

  clearBadge: () => ipcRenderer.invoke('notification:clearBadge'),

  // ── Backup ──────────────────────────────────────────
  backupCreate: () => ipcRenderer.invoke('backup:create'),

  backupList: () => ipcRenderer.invoke('backup:list'),

  backupRestore: (backupPath) => ipcRenderer.invoke('backup:restore', { backupPath }),

  backupDelete: (backupPath) => ipcRenderer.invoke('backup:delete', { backupPath }),

  backupClean: (keep) => ipcRenderer.invoke('backup:clean', { keep }),

  // ── Network ─────────────────────────────────────────
  getNetworkStatus: () => ipcRenderer.invoke('network:status'),

  onNetworkChanged: (callback) => {
    ipcRenderer.on('network:changed', (_event, status) => callback(status))
  },

  offNetworkChanged: () => {
    ipcRenderer.removeAllListeners('network:changed')
  },

  // ── Files (attachments) ─────────────────────────────
  filePick: () => ipcRenderer.invoke('files:pick'),

  fileSave: (data) => ipcRenderer.invoke('files:save', data),

  fileRead: (filePath) => ipcRenderer.invoke('files:read', filePath),

  fileReadText: (filePath: string) => ipcRenderer.invoke('files:readText', { filePath }),

  getFilePath: (file: File) => webUtils.getPathForFile(file),

  fileOpenInOS: (filePath) => ipcRenderer.invoke('files:openInOS', filePath),

  fileShowInFolder: (filePath) => ipcRenderer.invoke('files:showInFolder', filePath),

  // ── Images (generation) ─────────────────────────────
  generateImage: (data) => ipcRenderer.invoke('images:generate', data),

  listImages: () => ipcRenderer.invoke('images:list'),

  // ── Updater (auto-update) ────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  downloadUpdate: () => ipcRenderer.invoke('updater:download'),

  installUpdate: () => ipcRenderer.invoke('updater:install'),

  onUpdaterAvailable: (callback: (data: { version: string; releaseNotes?: string }) => void) => {
    ipcRenderer.on('updater:available', (_event, data) => callback(data))
  },

  onUpdaterProgress: (callback: (data: { percent: number }) => void) => {
    ipcRenderer.on('updater:progress', (_event, data) => callback(data))
  },

  onUpdaterDownloaded: (callback: (data: { version: string }) => void) => {
    ipcRenderer.on('updater:downloaded', (_event, data) => callback(data))
  },

  onUpdaterError: (callback: (data: { message: string }) => void) => {
    ipcRenderer.on('updater:error', (_event, data) => callback(data))
  },

  offUpdater: () => {
    ipcRenderer.removeAllListeners('updater:available')
    ipcRenderer.removeAllListeners('updater:progress')
    ipcRenderer.removeAllListeners('updater:downloaded')
    ipcRenderer.removeAllListeners('updater:error')
  },

  // ── Workspace ────────────────────────────────────────
  workspaceSelectFolder: () => ipcRenderer.invoke('workspace:selectFolder'),

  workspaceOpen: (data: { rootPath: string; projectId?: string }) =>
    ipcRenderer.invoke('workspace:open', data),

  workspaceClose: () => ipcRenderer.invoke('workspace:close'),

  workspaceOpenInFinder: (folderPath: string) =>
    ipcRenderer.invoke('workspace:openInFinder', folderPath),

  workspaceGetTree: (relativePath?: string) =>
    ipcRenderer.invoke('workspace:getTree', relativePath),

  workspaceReadFile: (filePath: string) =>
    ipcRenderer.invoke('workspace:readFile', filePath),

  workspaceWriteFile: (data: { path: string; content: string }) =>
    ipcRenderer.invoke('workspace:writeFile', data),

  workspaceDeleteFile: (filePath: string) =>
    ipcRenderer.invoke('workspace:deleteFile', filePath),

  workspaceGetInfo: () => ipcRenderer.invoke('workspace:getInfo'),

  onWorkspaceFileChanged: (cb: (event: { type: string; path: string }) => void): void => {
    ipcRenderer.on('workspace:fileChanged', (_event, data) => cb(data))
  },

  offWorkspaceFileChanged: (): void => {
    ipcRenderer.removeAllListeners('workspace:fileChanged')
  },

  // ── TTS ─────────────────────────────────────────────
  ttsSynthesize: (payload) => ipcRenderer.invoke('tts:synthesize', payload),

  ttsGetAvailableProviders: () => ipcRenderer.invoke('tts:getAvailableProviders'),

  // ── Scheduled Tasks ───────────────────────────────
  getScheduledTasks: () => ipcRenderer.invoke('tasks:list'),

  getScheduledTask: (id) => ipcRenderer.invoke('tasks:get', id),

  createScheduledTask: (data) => ipcRenderer.invoke('tasks:create', data),

  updateScheduledTask: (id, data) => ipcRenderer.invoke('tasks:update', id, data),

  deleteScheduledTask: (id) => ipcRenderer.invoke('tasks:delete', id),

  executeScheduledTask: (id) => ipcRenderer.invoke('tasks:execute', id),

  toggleScheduledTask: (id) => ipcRenderer.invoke('tasks:toggle', id),

  onTaskExecuted: (cb) => {
    ipcRenderer.on('task:executed', (_event, data) => cb(data))
  },

  offTaskExecuted: () => {
    ipcRenderer.removeAllListeners('task:executed')
  },

  // ── Memory Fragments ─────────────────────────────────────
  listMemoryFragments: () => ipcRenderer.invoke('memory:list'),

  getActiveMemoryBlock: () => ipcRenderer.invoke('memory:get-active-block'),

  createMemoryFragment: (payload) => ipcRenderer.invoke('memory:create', payload),

  updateMemoryFragment: (payload) => ipcRenderer.invoke('memory:update', payload),

  deleteMemoryFragment: (payload) => ipcRenderer.invoke('memory:delete', payload),

  reorderMemoryFragments: (payload) => ipcRenderer.invoke('memory:reorder', payload),

  toggleMemoryFragment: (payload) => ipcRenderer.invoke('memory:toggle', payload),

  // ── Slash Commands ─────────────────────────────────────────
  slashCommandsList: () => ipcRenderer.invoke('slash-commands:list'),

  slashCommandsGet: (id) => ipcRenderer.invoke('slash-commands:get', id),

  slashCommandsCreate: (data) => ipcRenderer.invoke('slash-commands:create', data),

  slashCommandsUpdate: (id, data) => ipcRenderer.invoke('slash-commands:update', id, data),

  slashCommandsDelete: (id) => ipcRenderer.invoke('slash-commands:delete', id),

  slashCommandsReset: (id) => ipcRenderer.invoke('slash-commands:reset', id),

  slashCommandsReorder: (orderedIds) => ipcRenderer.invoke('slash-commands:reorder', orderedIds),

  slashCommandsSeed: () => ipcRenderer.invoke('slash-commands:seed'),

  // ── MCP Servers ─────────────────────────────────────────
  mcpList: () => ipcRenderer.invoke('mcp:list'),

  mcpGet: (id) => ipcRenderer.invoke('mcp:get', id),

  mcpGetEnvKeys: (id) => ipcRenderer.invoke('mcp:getEnvKeys', id),

  mcpCreate: (data) => ipcRenderer.invoke('mcp:create', data),

  mcpUpdate: (id, data) => ipcRenderer.invoke('mcp:update', id, data),

  mcpDelete: (id) => ipcRenderer.invoke('mcp:delete', id),

  mcpToggle: (id) => ipcRenderer.invoke('mcp:toggle', id),

  mcpStart: (id) => ipcRenderer.invoke('mcp:start', id),

  mcpStop: (id) => ipcRenderer.invoke('mcp:stop', id),

  mcpRestart: (id) => ipcRenderer.invoke('mcp:restart', id),

  mcpTest: (data) => ipcRenderer.invoke('mcp:test', data),

  onMcpStatusChanged: (cb) => {
    ipcRenderer.on('mcp:status-changed', (_event, data) => cb(data))
  },

  offMcpStatusChanged: () => {
    ipcRenderer.removeAllListeners('mcp:status-changed')
  },

  // ── Remote (Telegram) ────────────────────────────────
  remoteConfigure: (token: string) => ipcRenderer.invoke('remote:configure', token),

  remoteStart: (conversationId?: string) => ipcRenderer.invoke('remote:start', conversationId),

  remoteStop: () => ipcRenderer.invoke('remote:stop'),

  remoteGetStatus: () => ipcRenderer.invoke('remote:status'),

  remoteGetConfig: () => ipcRenderer.invoke('remote:get-config'),

  remoteSetAutoApprove: (data) => ipcRenderer.invoke('remote:set-auto-approve', data),

  remoteSetAllowedUser: (userId: number | null) => ipcRenderer.invoke('remote:set-allowed-user', userId),

  remoteDeleteToken: () => ipcRenderer.invoke('remote:delete-token'),

  onRemoteStatusChanged: (cb) => {
    ipcRenderer.on('remote:status-changed', (_event, data) => cb(data))
  },

  offRemoteStatusChanged: () => {
    ipcRenderer.removeAllListeners('remote:status-changed')
  },

  // ── Remote Server (WebSocket) ──────────────────────
  remoteServerStart: (data) => ipcRenderer.invoke('remote-server:start', data),

  remoteServerStop: () => ipcRenderer.invoke('remote-server:stop'),

  remoteServerGetConfig: () => ipcRenderer.invoke('remote-server:get-config'),

  remoteServerSetConfig: (data) => ipcRenderer.invoke('remote-server:set-config', data),

  remoteServerGeneratePairing: (data) => ipcRenderer.invoke('remote-server:generate-pairing', data),

  remoteServerDisconnectClient: (clientId: string) => ipcRenderer.invoke('remote-server:disconnect-client', clientId),

  remoteServerGetClients: () => ipcRenderer.invoke('remote-server:get-clients'),

  remoteServerSetAutoApprove: (data) => ipcRenderer.invoke('remote-server:set-auto-approve', data),

  onRemoteServerStatusChanged: (cb) => {
    ipcRenderer.on('remote-server:status-changed', (_event, data) => cb(data))
  },

  offRemoteServerStatusChanged: () => {
    ipcRenderer.removeAllListeners('remote-server:status-changed')
  },

  onRemoteServerClientConnected: (cb) => {
    ipcRenderer.on('remote-server:client-connected', (_event, data) => cb(data))
  },

  offRemoteServerClientConnected: () => {
    ipcRenderer.removeAllListeners('remote-server:client-connected')
  },

  onRemoteServerClientDisconnected: (cb) => {
    ipcRenderer.on('remote-server:client-disconnected', (_event, data) => cb(data))
  },

  offRemoteServerClientDisconnected: () => {
    ipcRenderer.removeAllListeners('remote-server:client-disconnected')
  },

  // ── Profile ──────────────────────────────────────────
  selectAvatar: () => ipcRenderer.invoke('profile:select-avatar'),

  removeAvatar: () => ipcRenderer.invoke('profile:remove-avatar'),

  // ── Summary ─────────────────────────────────────────
  summarizeConversation: (payload) => ipcRenderer.invoke('summary:generate', payload),

  // ── Prompt Optimizer ──────────────────────────────────
  optimizePrompt: (payload: { text: string; modelId: string }) => ipcRenderer.invoke('prompt:optimize', payload),

  // ── Data (cleanup / factory reset) ─────────────────
  dataCleanup: () => ipcRenderer.invoke('data:cleanup'),
  dataFactoryReset: () => ipcRenderer.invoke('data:factory-reset'),

  // ── Semantic Memory (Qdrant) ──────────────────────────
  semanticMemoryStatus: () => ipcRenderer.invoke('memory:semantic-status'),
  semanticMemorySearch: (payload) => ipcRenderer.invoke('memory:semantic-search', payload),
  semanticMemoryForget: (payload) => ipcRenderer.invoke('memory:semantic-forget', payload),
  semanticMemoryForgetConversation: (payload) => ipcRenderer.invoke('memory:semantic-forget-conversation', payload),
  semanticMemoryForgetAll: () => ipcRenderer.invoke('memory:semantic-forget-all'),
  semanticMemoryReindex: () => ipcRenderer.invoke('memory:semantic-reindex'),
  semanticMemoryToggle: (payload) => ipcRenderer.invoke('memory:semantic-toggle', payload),
  semanticMemoryStats: () => ipcRenderer.invoke('memory:semantic-stats'),

  // ── Libraries (RAG Referentiels) ──────────────────────
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryGet: (payload) => ipcRenderer.invoke('library:get', payload),
  libraryCreate: (payload) => ipcRenderer.invoke('library:create', payload),
  libraryUpdate: (payload) => ipcRenderer.invoke('library:update', payload),
  libraryDelete: (payload) => ipcRenderer.invoke('library:delete', payload),
  libraryAddSources: (payload) => ipcRenderer.invoke('library:add-sources', payload),
  libraryRemoveSource: (payload) => ipcRenderer.invoke('library:remove-source', payload),
  libraryGetSources: (payload) => ipcRenderer.invoke('library:get-sources', payload),
  libraryReindexSource: (payload) => ipcRenderer.invoke('library:reindex-source', payload),
  libraryReindexAll: (payload) => ipcRenderer.invoke('library:reindex-all', payload),
  librarySearch: (payload) => ipcRenderer.invoke('library:search', payload),
  libraryStats: (payload) => ipcRenderer.invoke('library:stats', payload),
  libraryPickFiles: () => ipcRenderer.invoke('library:pick-files'),
  libraryAttach: (payload) => ipcRenderer.invoke('library:attach', payload),
  libraryDetach: (payload) => ipcRenderer.invoke('library:detach', payload),
  libraryGetAttached: (payload) => ipcRenderer.invoke('library:get-attached', payload),
  onLibraryIndexingProgress: (callback) => {
    ipcRenderer.on('library:indexing-progress', (_, progress) => callback(progress))
  },
  offLibraryIndexingProgress: () => ipcRenderer.removeAllListeners('library:indexing-progress'),

  // ── Arena (LLM vs LLM) ─────────────────────────────
  arenaSend: (payload) => ipcRenderer.invoke('arena:send', payload),
  arenaCancel: () => ipcRenderer.invoke('arena:cancel'),
  arenaVote: (payload) => ipcRenderer.invoke('arena:vote', payload),
  arenaGetMatches: (payload) => ipcRenderer.invoke('arena:getMatches', payload),
  arenaGetStats: () => ipcRenderer.invoke('arena:getStats'),
  onArenaChunkLeft: (cb) => { ipcRenderer.on('arena:chunk:left', (_, chunk) => cb(chunk)) },
  offArenaChunkLeft: () => { ipcRenderer.removeAllListeners('arena:chunk:left') },
  onArenaChunkRight: (cb) => { ipcRenderer.on('arena:chunk:right', (_, chunk) => cb(chunk)) },
  offArenaChunkRight: () => { ipcRenderer.removeAllListeners('arena:chunk:right') },
  onArenaMatchCreated: (cb) => { ipcRenderer.on('arena:match-created', (_, data) => cb(data)) },
  offArenaMatchCreated: () => { ipcRenderer.removeAllListeners('arena:match-created') },

  // ── Barda (Brigade Packs) ──────────────────────────────
  bardaImport: (filePath: string) => ipcRenderer.invoke('barda:import', { filePath }),
  bardaPreview: (filePath: string) => ipcRenderer.invoke('barda:preview', { filePath }),
  bardaList: () => ipcRenderer.invoke('barda:list'),
  bardaToggle: (id: string, isEnabled: boolean) => ipcRenderer.invoke('barda:toggle', { id, isEnabled }),
  bardaUninstall: (id: string) => ipcRenderer.invoke('barda:uninstall', { id }),

  // ── Skills ──────────────────────────────────────────────
  skillsList: () => ipcRenderer.invoke('skills:list'),
  skillsValidate: (dirPath: string) => ipcRenderer.invoke('skills:validate', { dirPath }),
  skillsScan: (dirPath: string) => ipcRenderer.invoke('skills:scan', { dirPath }),
  skillsInstallGit: (gitUrl: string) => ipcRenderer.invoke('skills:install-git', { gitUrl }),
  skillsConfirmInstall: (data: { tempDir?: string; localDir?: string; gitUrl?: string; matonVerdict?: string | null; matonReport?: Record<string, unknown> | null }) =>
    ipcRenderer.invoke('skills:confirm-install', data),
  skillsToggle: (id: string, enabled: boolean) => ipcRenderer.invoke('skills:toggle', { id, enabled }),
  skillsUninstall: (id: string) => ipcRenderer.invoke('skills:uninstall', { id }),
  skillsGetTree: (name: string) => ipcRenderer.invoke('skills:get-tree', { name }),
  skillsGetContent: (name: string) => ipcRenderer.invoke('skills:get-content', { name }),
  skillsOpenFinder: (name: string) => ipcRenderer.invoke('skills:open-finder', { name }),
  skillsCheckPython: () => ipcRenderer.invoke('skills:check-python'),
  skillsAnalyze: (targetDir: string) => ipcRenderer.invoke('skills:analyze', { targetDir }),

  // ── Conversations: Workspace ─────────────────────────
  conversationSetWorkspacePath: (id: string, workspacePath: string) =>
    ipcRenderer.invoke('conversations:setWorkspacePath', { id, workspacePath }),

  // ── Permissions ───────────────────────────────────────────
  permissionsList: (): Promise<PermissionRuleInfo[]> => ipcRenderer.invoke('permissions:list') as Promise<PermissionRuleInfo[]>,
  permissionsAdd: (data: { toolName: string; ruleContent: string | null; behavior: 'allow' | 'deny' | 'ask' }): Promise<PermissionRuleInfo> =>
    ipcRenderer.invoke('permissions:add', data) as Promise<PermissionRuleInfo>,
  permissionsDelete: (data: { id: string }): Promise<void> =>
    ipcRenderer.invoke('permissions:delete', data),
  permissionsReset: (): Promise<void> => ipcRenderer.invoke('permissions:reset'),

  // ── Tool Approval ─────────────────────────────────────────
  approveToolCall: (approvalId: string, decision: 'allow' | 'deny' | 'allow-session'): Promise<void> =>
    ipcRenderer.invoke('chat:approve-tool', { approvalId, decision }),

  // ── YOLO Mode (per-conversation, owned by main process) ──
  setYoloMode: (conversationId: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('chat:set-yolo-mode', { conversationId, enabled }),

  getYoloMode: (conversationId: string): Promise<boolean> =>
    ipcRenderer.invoke('chat:get-yolo-mode', { conversationId }),

  // ── Settings ──────────────────────────────────────────
  getSetting: (key: string): Promise<string | null> =>
    ipcRenderer.invoke('settings:get', key),

  setSetting: (key: string, value: string): Promise<void> =>
    ipcRenderer.invoke('settings:set', key, value)
}

contextBridge.exposeInMainWorld('api', api)
