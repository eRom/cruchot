import type { ProviderDefinition, ModelDefinition } from './types'

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
    description: 'Mistral Large, Devstral',
    requiresApiKey: true,
    icon: 'wind'
  },
  {
    id: 'xai',
    name: 'xAI',
    type: 'cloud',
    description: 'Grok 4.1 Fast, Grok Code Fast',
    requiresApiKey: true,
    icon: 'zap'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'cloud',
    description: '400+ modèles, routing automatique',
    requiresApiKey: true,
    icon: 'route'
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
    contextWindow: 1050000,
    inputPrice: 2.50,
    outputPrice: 15.00,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'gpt-5.3-codex',
    providerId: 'openai',
    name: 'gpt-5.3-codex',
    displayName: 'GPT-5.3 Codex',
    contextWindow: 400000,
    inputPrice: 1.75,
    outputPrice: 14.00,
    supportsImages: false,
    supportsStreaming: true
  },
  {
    id: 'gpt-5-mini',
    providerId: 'openai',
    name: 'gpt-5-mini',
    displayName: 'GPT-5 Mini',
    contextWindow: 400000,
    inputPrice: 0.25,
    outputPrice: 2.00,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'gpt-5-nano',
    providerId: 'openai',
    name: 'gpt-5-nano',
    displayName: 'GPT-5 Nano',
    contextWindow: 400000,
    inputPrice: 0.05,
    outputPrice: 0.40,
    supportsImages: false,
    supportsStreaming: true
  },
  {
    id: 'gpt-4.1-mini',
    providerId: 'openai',
    name: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    contextWindow: 1048000,
    inputPrice: 0.40,
    outputPrice: 1.60,
    supportsImages: true,
    supportsStreaming: true
  },

  // Anthropic
  {
    id: 'claude-opus-4-6',
    providerId: 'anthropic',
    name: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    contextWindow: 1000000,
    inputPrice: 5.00,
    outputPrice: 25.00,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'claude-sonnet-4-6',
    providerId: 'anthropic',
    name: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 1000000,
    inputPrice: 3.00,
    outputPrice: 15.00,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'claude-haiku-4-5-20251001',
    providerId: 'anthropic',
    name: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    inputPrice: 1.00,
    outputPrice: 5.00,
    supportsImages: true,
    supportsStreaming: true
  },

  // Google
  {
    id: 'gemini-3.1-pro-preview',
    providerId: 'google',
    name: 'gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro Preview',
    contextWindow: 1048000,
    inputPrice: 2.00,
    outputPrice: 12.00,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'gemini-3-flash-preview',
    providerId: 'google',
    name: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash Preview',
    contextWindow: 1048000,
    inputPrice: 0.50,
    outputPrice: 3.00,
    supportsImages: true,
    supportsStreaming: true
  },

  // xAI
  {
    id: 'grok-4.1-fast',
    providerId: 'xai',
    name: 'grok-4.1-fast',
    displayName: 'Grok 4.1 Fast',
    contextWindow: 2000000,
    inputPrice: 0.20,
    outputPrice: 0.50,
    supportsImages: true,
    supportsStreaming: true
  },
  {
    id: 'grok-code-fast-1',
    providerId: 'xai',
    name: 'grok-code-fast-1',
    displayName: 'Grok Code Fast 1',
    contextWindow: 256000,
    inputPrice: 0.20,
    outputPrice: 1.50,
    supportsImages: false,
    supportsStreaming: true
  },

  // Mistral
  {
    id: 'devstral-2512',
    providerId: 'mistral',
    name: 'devstral-2512',
    displayName: 'Devstral 2512',
    contextWindow: 262000,
    inputPrice: 0.40,
    outputPrice: 2.00,
    supportsImages: false,
    supportsStreaming: true
  },
  {
    id: 'mistral-large-2512',
    providerId: 'mistral',
    name: 'mistral-large-2512',
    displayName: 'Mistral Large 2512',
    contextWindow: 262000,
    inputPrice: 0.50,
    outputPrice: 1.50,
    supportsImages: true,
    supportsStreaming: true
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
