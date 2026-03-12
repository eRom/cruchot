import type { LanguageModel } from 'ai'
import {
  getOpenAIProvider,
  getAnthropicProvider,
  getGoogleProvider,
  getMistralProvider,
  getXaiProvider,
  getDeepSeekProvider,
  getQwenProvider,
  getPerplexityProvider,
  getLmStudioProvider,
  getOllamaProvider
} from './providers'

/**
 * Returns a LanguageModel instance from the AI SDK for the given provider + model.
 * API keys are fetched from safeStorage at call time.
 */
export function getModel(providerId: string, modelId: string): LanguageModel {
  switch (providerId) {
    case 'openai':
      return getOpenAIProvider()(modelId)

    case 'anthropic':
      return getAnthropicProvider()(modelId)

    case 'google':
      return getGoogleProvider()(modelId)

    case 'mistral':
      return getMistralProvider()(modelId)

    case 'xai':
      return getXaiProvider()(modelId)

    case 'deepseek':
      return getDeepSeekProvider()(modelId)

    case 'qwen':
      return getQwenProvider()(modelId)

    case 'perplexity':
      return getPerplexityProvider()(modelId)

    case 'lmstudio':
      return getLmStudioProvider()(modelId)

    case 'ollama':
      return getOllamaProvider()(modelId)

    default:
      throw new Error(`Unknown provider: ${providerId}`)
  }
}
