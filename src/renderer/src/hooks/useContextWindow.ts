import { useMemo } from 'react'
import type { Message } from '@/stores/messages.store'

interface ContextWindowResult {
  currentTokens: number
  maxTokens: number
  percentage: number
  isWarning: boolean
}

/**
 * Estimate the token usage for the current conversation context.
 * Approximation: 1 token ~ 4 characters.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function useContextWindow(
  messages: Message[],
  currentInput: string,
  maxTokens: number
): ContextWindowResult {
  return useMemo(() => {
    const messagesTokens = messages.reduce(
      (acc, msg) => acc + estimateTokens(msg.content),
      0
    )
    const inputTokens = estimateTokens(currentInput)
    const currentTokens = messagesTokens + inputTokens

    const safeMax = maxTokens > 0 ? maxTokens : 1
    const percentage = Math.min((currentTokens / safeMax) * 100, 100)
    const isWarning = percentage > 80

    return { currentTokens, maxTokens, percentage, isWarning }
  }, [messages, currentInput, maxTokens])
}
