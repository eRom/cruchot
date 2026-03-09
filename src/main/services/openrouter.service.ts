/**
 * OpenRouter service — model listing & credits checking.
 * Uses native fetch, no external HTTP library.
 */

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const REQUEST_TIMEOUT_MS = 10_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenRouterModel {
  id: string
  name: string
  description: string
  context_length: number
  pricing: {
    prompt: string
    completion: string
    image: string
    request: string
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number | null
    is_moderated: boolean
  }
  architecture: {
    modality: string
    tokenizer: string
    instruct_type: string | null
  }
}

interface OpenRouterModelsResponse {
  data: OpenRouterModel[]
}

export interface OpenRouterCredits {
  remaining: number
  total: number
}

interface OpenRouterKeyResponse {
  data: {
    label: string
    usage: number
    limit: number | null
    is_free_tier: boolean
    rate_limit: {
      requests: number
      interval: string
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://multi-llm-desktop.local',
    'X-Title': 'Multi-LLM Desktop',
    'Content-Type': 'application/json',
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    return response
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`OpenRouter request timed out after ${timeoutMs}ms`)
    }
    throw new Error(
      `OpenRouter request failed: ${error instanceof Error ? error.message : 'network unreachable'}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches the list of available models from OpenRouter.
 */
export async function getOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const response = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/models`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter /models failed (${response.status}): ${body}`)
  }

  const json = (await response.json()) as OpenRouterModelsResponse
  return json.data
}

/**
 * Fetches the remaining and total credits for the provided API key.
 */
export async function getOpenRouterCredits(apiKey: string): Promise<OpenRouterCredits> {
  const response = await fetchWithTimeout(`${OPENROUTER_BASE_URL}/auth/key`, {
    method: 'GET',
    headers: buildHeaders(apiKey),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter /auth/key failed (${response.status}): ${body}`)
  }

  const json = (await response.json()) as OpenRouterKeyResponse

  const usage = json.data.usage ?? 0
  const limit = json.data.limit ?? 0

  return {
    remaining: limit - usage,
    total: limit,
  }
}
