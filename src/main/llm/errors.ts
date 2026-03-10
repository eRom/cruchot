export type ErrorCategory = 'transient' | 'fatal' | 'actionable'

export interface ClassifiedError {
  category: ErrorCategory
  message: string
  statusCode?: number
  retryable: boolean
  suggestion?: string
}

/**
 * Classifies an LLM API error into transient, fatal, or actionable categories.
 */
export function classifyError(error: unknown): ClassifiedError {
  // Unwrap cause chain (NoOutputGeneratedError wraps the real error)
  const root = unwrapCause(error)
  const statusCode = extractStatusCode(root)
  const message = extractMessage(root)

  // API key errors (some providers return 401, others embed it in message)
  if (statusCode === 401 || isInvalidApiKey(message)) {
    return {
      category: 'fatal',
      message: 'Clé API invalide ou expirée',
      statusCode: statusCode ?? 401,
      retryable: false,
      suggestion: 'Vérifiez votre clé API dans Paramètres > Clés API'
    }
  }

  // 429 — distinguish quota exhaustion from rate limit
  if (statusCode === 429) {
    if (isQuotaExhausted(message)) {
      return {
        category: 'actionable',
        message: 'Crédits épuisés pour ce provider',
        statusCode,
        retryable: false,
        suggestion: 'Rechargez votre compte ou changez de modèle'
      }
    }
    return {
      category: 'transient',
      message: 'Rate limit atteint. Nouvelle tentative en cours...',
      statusCode,
      retryable: true,
      suggestion: 'Attendez quelques secondes'
    }
  }
  if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
    return {
      category: 'transient',
      message: `Erreur serveur (${statusCode}). Nouvelle tentative...`,
      statusCode,
      retryable: true
    }
  }

  // Fatal — don't retry
  if (statusCode === 403) {
    return {
      category: 'fatal',
      message: 'Accès refusé — permissions insuffisantes',
      statusCode,
      retryable: false,
      suggestion: 'Vérifiez les permissions de votre clé API'
    }
  }

  // Actionable — user can fix it
  if (statusCode === 402) {
    return {
      category: 'actionable',
      message: 'Crédits insuffisants',
      statusCode,
      retryable: false,
      suggestion: 'Rechargez votre compte sur le site du provider'
    }
  }
  if (statusCode === 408 || statusCode === 504) {
    return {
      category: 'transient',
      message: 'Timeout — la requête a pris trop de temps',
      statusCode,
      retryable: true
    }
  }

  // Network errors
  if (isNetworkError(error)) {
    return {
      category: 'transient',
      message: 'Erreur réseau — vérifiez votre connexion',
      retryable: true,
      suggestion: 'Vérifiez votre connexion internet'
    }
  }

  // Unknown
  return {
    category: 'fatal',
    message: message || 'Erreur inconnue',
    statusCode,
    retryable: false
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    if ('statusCode' in error && typeof (error as Record<string, unknown>).statusCode === 'number') {
      return (error as Record<string, unknown>).statusCode as number
    }
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      return (error as Record<string, unknown>).status as number
    }
  }
  return undefined
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Erreur inconnue'
}

function unwrapCause(error: unknown): unknown {
  if (error && typeof error === 'object' && 'cause' in error) {
    const cause = (error as { cause: unknown }).cause
    if (cause && cause !== error) return unwrapCause(cause)
  }
  return error
}

function isInvalidApiKey(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('incorrect api key') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication failed')
  )
}

function isQuotaExhausted(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('insufficient_quota') ||
    lower.includes('quota exceeded') ||
    lower.includes('billing hard limit') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('credit') ||
    lower.includes('plan limit')
  )
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('fetch failed') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('etimedout')
    )
  }
  return false
}

/**
 * Retry with exponential backoff + jitter.
 * Returns the result or throws after maxRetries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const classified = classifyError(error)
      if (!classified.retryable || attempt === maxRetries) {
        throw error
      }
      // Exponential backoff + jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw lastError
}
