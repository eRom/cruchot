import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { createXai } from '@ai-sdk/xai'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { getApiKeyForProvider } from '../ipc/providers.ipc'
import { getLmStudioBaseUrl, getOllamaBaseUrl } from '../services/local-providers.service'

/**
 * Creates configured AI SDK provider instances.
 * API keys are retrieved from safeStorage at call time (not cached).
 */

export function getOpenAIProvider() {
  const apiKey = getApiKeyForProvider('openai')
  if (!apiKey) throw new Error('OpenAI API key not configured')
  return createOpenAI({ apiKey })
}

export function getAnthropicProvider() {
  const apiKey = getApiKeyForProvider('anthropic')
  if (!apiKey) throw new Error('Anthropic API key not configured')
  return createAnthropic({ apiKey })
}

export function getGoogleProvider() {
  const apiKey = getApiKeyForProvider('google')
  if (!apiKey) throw new Error('Google API key not configured')
  return createGoogleGenerativeAI({ apiKey })
}

export function getMistralProvider() {
  const apiKey = getApiKeyForProvider('mistral')
  if (!apiKey) throw new Error('Mistral API key not configured')
  return createMistral({ apiKey })
}

export function getXaiProvider() {
  const apiKey = getApiKeyForProvider('xai')
  if (!apiKey) throw new Error('xAI API key not configured')
  return createXai({ apiKey })
}

export function getDeepSeekProvider() {
  const apiKey = getApiKeyForProvider('deepseek')
  if (!apiKey) throw new Error('DeepSeek API key not configured')
  return createDeepSeek({ apiKey })
}

export function getQwenProvider() {
  const apiKey = getApiKeyForProvider('qwen')
  if (!apiKey) throw new Error('Qwen API key not configured')
  return createOpenAICompatible({
    name: 'qwen',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    headers: { Authorization: `Bearer ${apiKey}` }
  })
}

export function getPerplexityProvider() {
  const apiKey = getApiKeyForProvider('perplexity')
  if (!apiKey) throw new Error('Perplexity API key not configured')
  return createOpenAICompatible({
    name: 'perplexity',
    baseURL: 'https://api.perplexity.ai',
    headers: { Authorization: `Bearer ${apiKey}` }
  })
}

export function getOpenRouterProvider() {
  const apiKey = getApiKeyForProvider('openrouter')
  if (!apiKey) throw new Error('OpenRouter API key not configured')
  return createOpenRouter({ apiKey })
}

export function getLmStudioProvider() {
  const baseUrl = getLmStudioBaseUrl()
  return createOpenAICompatible({
    name: 'lmstudio',
    baseURL: `${baseUrl}/v1`
  })
}

export function getOllamaProvider() {
  const baseUrl = getOllamaBaseUrl()
  return createOpenAICompatible({
    name: 'ollama',
    baseURL: `${baseUrl}/v1`
  })
}
