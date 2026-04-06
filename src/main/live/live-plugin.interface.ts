export type LiveStatus = 'off' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'dormant' | 'error' | 'interrupted'

export interface LiveStatusInfo {
  status: LiveStatus
  error?: string
}

export interface LiveCommand {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface LiveCommandResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ScreenSource {
  id: string
  name: string
  thumbnailDataUrl: string
  appIconDataUrl?: string
  type: 'screen' | 'window'
}

export interface CoreToolParam {
  type: 'string' | 'number' | 'boolean'
  description: string
  enum?: string[]
}

export interface CoreToolDeclaration {
  name: string
  description: string
  parameters: Record<string, CoreToolParam>
  required?: string[]
}

export type PluginToolDeclaration = CoreToolDeclaration

export interface LivePluginConfig {
  apiKey: string
  systemPrompt: string
  coreTools: CoreToolDeclaration[]
  voice?: string
  thinkingLevel?: string
}

export interface LivePlugin {
  readonly providerId: string
  readonly displayName: string

  // Lifecycle
  connect(config: LivePluginConfig): Promise<void>
  disconnect(): Promise<void>

  // Audio transport
  sendAudio(base64: string): void
  sendToolResponse(id: string, name: string, result: LiveCommandResult): void

  // Capabilities (opt-in)
  supportsScreenShare(): boolean
  sendScreenFrame?(base64: string): void
  setScreenSharing?(active: boolean): void
  requestScreenshot?(): void
  getScreenSharing?(): boolean

  // Prompt
  buildFinalPrompt(corePrompt: string): string

  // Plugin-specific tools
  getPluginTools(): PluginToolDeclaration[]

  // Callbacks — injected by Engine before connect()
  onAudio: (base64: string) => void
  onToolCall: (id: string, name: string, args: Record<string, unknown>) => void
  onStatusChange: (status: LiveStatus) => void
  onTranscript: (role: 'user' | 'assistant', text: string) => void
  onError: (error: string) => void
}

export interface AvailablePlugin {
  providerId: string
  displayName: string
  modelName: string
  available: boolean
  supportsScreenShare: boolean
}
