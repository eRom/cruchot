// Types partages pour l'API IPC entre main et renderer

export interface SendMessagePayload {
  conversationId: string
  content: string
  modelId: string
  providerId: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
}

export interface StreamChunk {
  type: 'text-delta' | 'tool-call' | 'finish' | 'error'
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
  contextWindow: number
  inputPrice: number
  outputPrice: number
  supportsImages: boolean
  supportsStreaming: boolean
}

export interface ConversationInfo {
  id: string
  title: string
  projectId?: string
  modelId?: string
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
  getConversations: () => Promise<ConversationInfo[]>
  createConversation: (title?: string) => Promise<ConversationInfo>
  deleteConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  getMessages: (conversationId: string) => Promise<MessageInfo[]>

  // Providers
  getProviders: () => Promise<ProviderInfo[]>
  getModels: (providerId?: string) => Promise<ModelInfo[]>
  setApiKey: (providerId: string, apiKey: string) => Promise<void>
  validateApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  hasApiKey: (providerId: string) => Promise<boolean>
  getApiKeyMasked: (providerId: string) => Promise<string | null>

  // Events
  onConversationUpdated: (callback: (data: { id: string; title: string }) => void) => void
  offConversationUpdated: () => void

  // Settings
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
}
