import type { ThinkingEffort } from '../../preload/types'

/**
 * Build provider-specific providerOptions for thinking/reasoning control.
 * Returns undefined if effort is 'off' for providers that don't need explicit disable.
 */
export function buildThinkingProviderOptions(
  providerId: string,
  effort: ThinkingEffort
): Record<string, Record<string, unknown>> | undefined {
  switch (providerId) {
    case 'anthropic':
      return buildAnthropicThinking(effort)
    case 'openai':
      return buildOpenAIThinking(effort)
    case 'google':
      return buildGoogleThinking(effort)
    case 'xai':
      return buildXaiThinking(effort)
    default:
      return undefined
  }
}

function buildAnthropicThinking(
  effort: ThinkingEffort
): Record<string, Record<string, unknown>> | undefined {
  switch (effort) {
    case 'off':
      return { anthropic: { thinking: { type: 'disabled' } } }
    case 'low':
      return { anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } } }
    case 'medium':
      return { anthropic: { thinking: { type: 'adaptive' } } }
    case 'high':
      return { anthropic: { thinking: { type: 'enabled', budgetTokens: 32768 } } }
  }
}

function buildOpenAIThinking(
  effort: ThinkingEffort
): Record<string, Record<string, unknown>> | undefined {
  switch (effort) {
    case 'off':
      return { openai: { reasoningEffort: 'none' } }
    case 'low':
      return { openai: { reasoningEffort: 'low' } }
    case 'medium':
      return { openai: { reasoningEffort: 'medium' } }
    case 'high':
      return { openai: { reasoningEffort: 'high' } }
  }
}

function buildXaiThinking(
  effort: ThinkingEffort
): Record<string, Record<string, unknown>> | undefined {
  // xAI Chat API supports reasoningEffort: 'low' | 'high' only
  switch (effort) {
    case 'off':
      return undefined
    case 'low':
      return { xai: { reasoningEffort: 'low' } }
    case 'medium':
      return { xai: { reasoningEffort: 'high' } }
    case 'high':
      return { xai: { reasoningEffort: 'high' } }
  }
}

function buildGoogleThinking(
  effort: ThinkingEffort
): Record<string, Record<string, unknown>> | undefined {
  switch (effort) {
    case 'off':
      return undefined
    case 'low':
      return { google: { thinkingConfig: { thinkingBudget: 1024 } } }
    case 'medium':
      return { google: { thinkingConfig: { thinkingBudget: 8192 } } }
    case 'high':
      return { google: { thinkingConfig: { thinkingBudget: 24576 } } }
  }
}
