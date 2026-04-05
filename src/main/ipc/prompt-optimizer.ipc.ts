import { ipcMain } from 'electron'
import { z } from 'zod'
import { generateText } from 'ai'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { createLlmCost } from '../db/queries/llm-costs'

const VALID_PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'xai', 'deepseek', 'qwen', 'perplexity', 'lmstudio', 'ollama', 'openrouter'] as const

const optimizeSchema = z.object({
  text: z.string().min(1).max(50_000),
  modelId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\-.:\/]+$/)
})

const OPTIMIZER_SYSTEM_PROMPT = `Tu es un expert en prompt engineering. Reformule et ameliore le prompt suivant pour obtenir de meilleurs resultats. Garde la meme intention mais rends-le plus clair, precis et efficace. Reponds UNIQUEMENT avec le prompt ameliore, sans explication.`

export function registerPromptOptimizerIpc(): void {
  ipcMain.handle('prompt:optimize', async (_event, payload: unknown) => {
    const parsed = optimizeSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid prompt:optimize payload')

    const { text, modelId } = parsed.data

    // Split "providerId::modelId" + validate provider
    const parts = modelId.split('::')
    if (parts.length !== 2) throw new Error('Invalid modelId format — expected "providerId::modelId"')
    const [providerId, actualModelId] = parts

    if (!VALID_PROVIDERS.includes(providerId as (typeof VALID_PROVIDERS)[number])) {
      throw new Error('Invalid provider')
    }

    const model = getModel(providerId, actualModelId)

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: OPTIMIZER_SYSTEM_PROMPT },
        { role: 'user', content: text }
      ],
      maxTokens: 4096,
      temperature: 0.3
    })

    const usage = result.usage
    const tokensIn = usage?.inputTokens ?? 0
    const tokensOut = usage?.outputTokens ?? 0
    const cost = calculateMessageCost(actualModelId, tokensIn, tokensOut)

    if (tokensIn > 0 || tokensOut > 0) {
      createLlmCost({
        type: 'optimizer',
        modelId: actualModelId,
        providerId,
        tokensIn,
        tokensOut,
        cost
      })
    }

    return {
      optimizedText: result.text.trim(),
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      cost
    }
  })

  console.log('[IPC] Prompt Optimizer handlers registered')
}
