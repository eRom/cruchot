export interface ProviderDefinition {
  id: string
  name: string
  type: 'cloud' | 'local'
  description: string
  baseUrl?: string
  requiresApiKey: boolean
  icon: string
}

export interface ModelDefinition {
  id: string
  providerId: string
  name: string
  displayName: string
  type: 'text' | 'image'
  contextWindow: number
  inputPrice: number  // USD per million tokens
  outputPrice: number // USD per million tokens
  supportsImages: boolean
  supportsStreaming: boolean
  supportsThinking: boolean
  supportsYolo: boolean
}

export interface ModelPricing {
  input: number  // USD per million tokens
  output: number // USD per million tokens
}
