import type { ModelDefinition, ProviderDefinition } from './types'

// ── Provider Definitions ──────────────────────────────────────────────────

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'cloud',
    description: 'GPT-5.4, GPT-5 Mini, GPT-5 Nano, GPT-4.1 Mini',
    requiresApiKey: true,
    icon: 'brain'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'cloud',
    description: 'Claude Opus 4.6, Sonnet 4.6, Haiku 4.5',
    requiresApiKey: true,
    icon: 'sparkles'
  },
  {
    id: 'google',
    name: 'Google',
    type: 'cloud',
    description: 'Gemini 3.1 Pro, Gemini 3 Flash + Image Generation',
    requiresApiKey: true,
    icon: 'gem'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    type: 'cloud',
    description: 'Magistral Medium, Codestral, Devstral 2, Mistral Large 3',
    requiresApiKey: true,
    icon: 'wind'
  },
  {
    id: 'xai',
    name: 'xAI',
    type: 'cloud',
    description: 'Grok 4.1 Fast Reasoning, Grok 4.1 Fast',
    requiresApiKey: true,
    icon: 'zap'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'cloud',
    description: 'DeepSeek Chat, DeepSeek Reasoner',
    requiresApiKey: true,
    icon: 'layers'
  },
  {
    id: 'qwen',
    name: 'Alibaba Qwen',
    type: 'cloud',
    description: 'Qwen3 Max, Qwen3.5 Plus/Flash, QwQ Plus',
    requiresApiKey: true,
    icon: 'cloud'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    type: 'cloud',
    description: 'Sonar — recherche web intégrée',
    requiresApiKey: true,
    icon: 'search'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'local',
    description: 'Modèles locaux via Ollama (port 11434)',
    baseUrl: 'http://localhost:11434',
    requiresApiKey: false,
    icon: 'hard-drive'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    type: 'local',
    description: 'Modèles locaux via LM Studio',
    baseUrl: 'http://localhost:1234',
    requiresApiKey: false,
    icon: 'monitor'
  }
]

// ── Model Definitions (static pricing from PRICING.md) ────────────────────

export const MODELS: ModelDefinition[] = [
  // OpenAI
  {
    id: 'gpt-5.4',
    providerId: 'openai',
    name: 'gpt-5.4',
    displayName: 'GPT-5.4',
    type: 'text',
    contextWindow: 1050000,
    inputPrice: 2.50,
    outputPrice: 15.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'gpt-5.3-codex',
    providerId: 'openai',
    name: 'gpt-5.3-codex',
    displayName: 'GPT-5.3 Codex',
    type: 'text',
    contextWindow: 400000,
    inputPrice: 1.75,
    outputPrice: 14.00,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'gpt-5-mini',
    providerId: 'openai',
    name: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    type: 'text',
    contextWindow: 400000,
    inputPrice: 0.25,
    outputPrice: 2.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: false
  },
  {
    id: 'gpt-5-nano',
    providerId: 'openai',
    name: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    type: 'text',
    contextWindow: 400000,
    inputPrice: 0.05,
    outputPrice: 0.40,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: false
  },
  {
    id: 'gpt-4.1-mini',
    providerId: 'openai',
    name: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    type: 'text',
    contextWindow: 1048000,
    inputPrice: 0.40,
    outputPrice: 1.60,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: false
  },

  // Anthropic
  {
    id: 'claude-opus-4-6',
    providerId: 'anthropic',
    name: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    type: 'text',
    contextWindow: 1000000,
    inputPrice: 5.00,
    outputPrice: 25.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'claude-sonnet-4-6',
    providerId: 'anthropic',
    name: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    type: 'text',
    contextWindow: 1000000,
    inputPrice: 3.00,
    outputPrice: 15.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'claude-haiku-4-5-20251001',
    providerId: 'anthropic',
    name: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    type: 'text',
    contextWindow: 200000,
    inputPrice: 1.00,
    outputPrice: 5.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: false
  },

  // Google
  {
    id: 'gemini-3.1-pro-preview',
    providerId: 'google',
    name: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro Preview',
    type: 'text',
    contextWindow: 1048000,
    inputPrice: 2.00,
    outputPrice: 12.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'gemini-3-flash-preview',
    providerId: 'google',
    name: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash Preview',
    type: 'text',
    contextWindow: 1048000,
    inputPrice: 0.50,
    outputPrice: 3.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },

  // xAI
  {
    id: 'grok-4-1-fast-reasoning',
    providerId: 'xai',
    name: 'grok-4-1-fast-reasoning',
    displayName: 'Grok 4.1 Fast Reasoning',
    type: 'text',
    contextWindow: 2000000,
    inputPrice: 0.20,
    outputPrice: 0.50,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'grok-4-1-fast-non-reasoning',
    providerId: 'xai',
    name: 'grok-4-1-fast-non-reasoning',
    displayName: 'Grok 4.1 Fast Non Reasoning',
    type: 'text',
    contextWindow: 256000,
    inputPrice: 0.20,
    outputPrice: 1.50,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: false
  },

  // Mistral
  {
    id: 'magistral-medium-2509',
    providerId: 'mistral',
    name: 'magistral-medium-2509',
    displayName: 'Magistral Medium',
    type: 'text',
    contextWindow: 128000,
    inputPrice: 2.00,
    outputPrice: 5.00,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'codestral-2508',
    providerId: 'mistral',
    name: 'codestral-2508',
    displayName: 'Codestral',
    type: 'text',
    contextWindow: 256000,
    inputPrice: 0.30,
    outputPrice: 0.90,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: false
  },
  {
    id: 'devstral-2512',
    providerId: 'mistral',
    name: 'devstral-2512',
    displayName: 'Devstral 2',
    type: 'text',
    contextWindow: 256000,
    inputPrice: 0.40,
    outputPrice: 2.00,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: false
  },
  {
    id: 'mistral-large-2512',
    providerId: 'mistral',
    name: 'mistral-large-2512',
    displayName: 'Mistral Large 3',
    type: 'text',
    contextWindow: 262000,
    inputPrice: 0.50,
    outputPrice: 1.50,
    supportsImages: true,
    supportsStreaming: true,
    supportsThinking: false
  },

  // DeepSeek
  {
    id: 'deepseek-chat',
    providerId: 'deepseek',
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    type: 'text',
    contextWindow: 128000,
    inputPrice: 0.28,
    outputPrice: 0.42,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'deepseek-reasoner',
    providerId: 'deepseek',
    name: 'deepseek-reasoner',
    displayName: 'DeepSeek Reasoner',
    type: 'text',
    contextWindow: 128000,
    inputPrice: 0.28,
    outputPrice: 0.42,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },

  // Alibaba Qwen
  {
    id: 'qwen3-max',
    providerId: 'qwen',
    name: 'qwen3-max',
    displayName: 'Qwen3 Max',
    type: 'text',
    contextWindow: 262000,
    inputPrice: 1.20,
    outputPrice: 6.00,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'qwen3.5-plus',
    providerId: 'qwen',
    name: 'qwen3.5-plus',
    displayName: 'Qwen3.5 Plus',
    type: 'text',
    contextWindow: 131000,
    inputPrice: 0.40,
    outputPrice: 2.40,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'qwen3.5-flash',
    providerId: 'qwen',
    name: 'qwen3.5-flash',
    displayName: 'Qwen3.5 Flash',
    type: 'text',
    contextWindow: 131000,
    inputPrice: 0.10,
    outputPrice: 0.40,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },
  {
    id: 'qwq-plus',
    providerId: 'qwen',
    name: 'qwq-plus',
    displayName: 'QwQ Plus (Reasoning)',
    type: 'text',
    contextWindow: 131000,
    inputPrice: 1.20,
    outputPrice: 6.00,
    supportsImages: false,
    supportsStreaming: true,
    supportsThinking: true
  },

  // ── Image Generation Models ─────────────────────────────────────────────
  {
    id: 'gemini-3.1-flash-image-preview',
    providerId: 'google',
    name: 'gemini-3.1-flash-image-preview',
    displayName: 'Gemini Flash Image',
    type: 'image',
    contextWindow: 0,
    inputPrice: 0.04,
    outputPrice: 0.04,
    supportsImages: false,
    supportsStreaming: false,
    supportsThinking: false
  },
  {
    id: 'gemini-3-pro-image-preview',
    providerId: 'google',
    name: 'gemini-3-pro-image-preview',
    displayName: 'Gemini Pro Image',
    type: 'image',
    contextWindow: 0,
    inputPrice: 0.08,
    outputPrice: 0.08,
    supportsImages: false,
    supportsStreaming: false,
    supportsThinking: false
  },
  {
    id: 'gpt-image-1.5',
    providerId: 'openai',
    name: 'gpt-image-1.5',
    displayName: 'GPT Image 1.5',
    type: 'image',
    contextWindow: 0,
    inputPrice: 0.02,
    outputPrice: 0.08,
    supportsImages: false,
    supportsStreaming: false,
    supportsThinking: false
  }
]

// ── Helpers ───────────────────────────────────────────────────────────────

export function getProvider(providerId: string): ProviderDefinition | undefined {
  return PROVIDERS.find(p => p.id === providerId)
}

export function getModelsForProvider(providerId: string): ModelDefinition[] {
  return MODELS.filter(m => m.providerId === providerId)
}

export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODELS.find(m => m.id === modelId)
}

export function getProviderForModel(modelId: string): ProviderDefinition | undefined {
  const model = getModelById(modelId)
  if (!model) return undefined
  return getProvider(model.providerId)
}

export function isImageModel(modelId: string): boolean {
  const model = getModelById(modelId)
  return model?.type === 'image'
}
