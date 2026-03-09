import type { ModelPricing } from './types'
import { MODELS } from './registry'

/**
 * Static pricing table — USD per million tokens.
 * Fallback for models not in the registry.
 */
const PRICING_OVERRIDE: Record<string, ModelPricing> = {
  // Add custom overrides here if needed
}

/**
 * Get pricing for a model.
 * Looks up registry first, then override table.
 */
export function getModelPricing(modelId: string): ModelPricing | null {
  // Check override table first
  if (PRICING_OVERRIDE[modelId]) {
    return PRICING_OVERRIDE[modelId]
  }

  // Look up in registry
  const model = MODELS.find(m => m.id === modelId || m.name === modelId)
  if (model) {
    return {
      input: model.inputPrice,
      output: model.outputPrice
    }
  }

  return null
}

/**
 * Calculate the cost of a single message based on token usage.
 * Returns cost in USD.
 */
export function calculateMessageCost(
  modelId: string,
  tokensIn: number,
  tokensOut: number
): number {
  const pricing = getModelPricing(modelId)
  if (!pricing) return 0

  // Pricing is per million tokens
  const inputCost = (tokensIn / 1_000_000) * pricing.input
  const outputCost = (tokensOut / 1_000_000) * pricing.output

  return inputCost + outputCost
}

/**
 * Format a cost value for display.
 * Shows 4-6 decimal places for small amounts, 2 for larger.
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}
