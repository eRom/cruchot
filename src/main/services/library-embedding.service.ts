/**
 * Library Embedding Service — abstraction multi-modele.
 * Unifie local (all-MiniLM-L6-v2) et Google (Gemini Embedding 2).
 */
import { embed as localEmbed, embedBatch as localEmbedBatch } from './embedding.service'

export type EmbeddingModelType = 'local' | 'google'

const GOOGLE_BATCH_SIZE = 100

export function getDimensions(modelType: EmbeddingModelType): number {
  return modelType === 'google' ? 768 : 384
}

export async function embedForLibrary(
  text: string,
  modelType: EmbeddingModelType
): Promise<number[]> {
  switch (modelType) {
    case 'local':
      return localEmbed(text)

    case 'google': {
      const { embed } = await import('ai')
      const google = await getGoogleEmbeddingProvider()
      const { embedding } = await embed({
        model: google.embedding('gemini-embedding-2-preview', {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY'
        }),
        value: text
      })
      return embedding
    }
  }
}

export async function embedBatchForLibrary(
  texts: string[],
  modelType: EmbeddingModelType,
  isDocument: boolean = true
): Promise<number[][]> {
  if (texts.length === 0) return []

  switch (modelType) {
    case 'local':
      return localEmbedBatch(texts)

    case 'google': {
      const { embedMany } = await import('ai')
      const google = await getGoogleEmbeddingProvider()
      const allEmbeddings: number[][] = []

      // Batch by GOOGLE_BATCH_SIZE (max 100 per API call)
      for (let i = 0; i < texts.length; i += GOOGLE_BATCH_SIZE) {
        const batch = texts.slice(i, i + GOOGLE_BATCH_SIZE)
        const { embeddings } = await embedMany({
          model: google.embedding('gemini-embedding-2-preview', {
            outputDimensionality: 768,
            taskType: isDocument ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY'
          }),
          values: batch
        })
        allEmbeddings.push(...embeddings)
      }

      return allEmbeddings
    }
  }
}

async function getGoogleEmbeddingProvider() {
  const { getApiKeyForProvider } = await import('../ipc/providers.ipc')
  const apiKey = getApiKeyForProvider('google')
  if (!apiKey) {
    throw new Error('Cle API Google requise. Configurez-la dans Reglages > Fournisseurs > Google.')
  }
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
  return createGoogleGenerativeAI({ apiKey })
}
