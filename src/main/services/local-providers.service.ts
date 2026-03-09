/**
 * Local providers service — detection and model listing for Ollama & LM Studio.
 * Uses native fetch with short timeouts (local servers respond fast or not at all).
 */

const OLLAMA_BASE_URL = 'http://localhost:11434'
const LMSTUDIO_BASE_URL = 'http://localhost:1234'
const DETECT_TIMEOUT_MS = 3_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocalProviderStatus {
  ollama: boolean
  lmstudio: boolean
}

export interface OllamaModel {
  name: string
  model: string
  modified_at: string
  size: number
  digest: string
  details: {
    parent_model: string
    format: string
    family: string
    families: string[] | null
    parameter_size: string
    quantization_level: string
  }
}

interface OllamaTagsResponse {
  models: OllamaModel[]
}

export interface LMStudioModel {
  id: string
  object: string
  owned_by: string
}

interface LMStudioModelsResponse {
  data: LMStudioModel[]
  object: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number = DETECT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Local provider request timed out after ${timeoutMs}ms`)
    }
    throw new Error(
      `Local provider unreachable: ${error instanceof Error ? error.message : 'connection refused'}`,
    )
  } finally {
    clearTimeout(timer)
  }
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url)
    return response.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects which local LLM providers are currently running.
 * Both checks run in parallel for speed.
 */
export async function detectLocalProviders(): Promise<LocalProviderStatus> {
  const [ollama, lmstudio] = await Promise.all([
    isReachable(`${OLLAMA_BASE_URL}/api/tags`),
    isReachable(`${LMSTUDIO_BASE_URL}/v1/models`),
  ])

  return { ollama, lmstudio }
}

/**
 * Fetches the list of models available in a local Ollama instance.
 * Throws if Ollama is not running or unreachable.
 */
export async function getOllamaModels(): Promise<OllamaModel[]> {
  const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Ollama /api/tags failed (${response.status}): ${body}`)
  }

  const json = (await response.json()) as OllamaTagsResponse
  return json.models ?? []
}

/**
 * Fetches the list of models available in a local LM Studio instance.
 * Throws if LM Studio is not running or unreachable.
 */
export async function getLMStudioModels(): Promise<LMStudioModel[]> {
  const response = await fetchWithTimeout(`${LMSTUDIO_BASE_URL}/v1/models`)

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`LM Studio /v1/models failed (${response.status}): ${body}`)
  }

  const json = (await response.json()) as LMStudioModelsResponse
  return json.data ?? []
}
