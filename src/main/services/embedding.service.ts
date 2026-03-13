/**
 * Embedding service — local ONNX via @huggingface/transformers.
 * Modele : all-MiniLM-L6-v2 (384 dimensions, ~23 MB quantized).
 * WASM backend pour portabilite cross-platform.
 */
import path from 'node:path'
import { app } from 'electron'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIM = 384

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

export async function initEmbedding(): Promise<void> {
  console.log('[Embedding] Starting init...')

  // Step 1: Dynamic import of transformers
  let transformers: typeof import('@huggingface/transformers')
  try {
    transformers = await import('@huggingface/transformers')
    console.log('[Embedding] @huggingface/transformers imported OK')
  } catch (err) {
    console.error('[Embedding] Failed to import @huggingface/transformers:', err)
    throw err
  }

  const { pipeline, env } = transformers

  // Step 2: ONNX backend — in Node.js/Electron, onnxruntime-node with CPU is used
  // (WASM is only available in browser environments)

  // Step 3: Configure model path
  if (app.isPackaged) {
    env.localModelPath = path.join(process.resourcesPath, 'models')
    env.allowRemoteModels = false
    console.log('[Embedding] Packaged mode — local model path:', env.localModelPath)
  } else {
    env.allowRemoteModels = true
    console.log('[Embedding] Dev mode — remote models allowed')
  }

  // Step 4: Load pipeline
  console.log('[Embedding] Loading model:', MODEL_NAME, '...')
  try {
    extractor = await pipeline('feature-extraction', MODEL_NAME, {
      quantized: true,
      dtype: 'fp32',
      device: 'cpu'
    })
    console.log('[Embedding] Pipeline created')
  } catch (err) {
    console.error('[Embedding] Pipeline creation failed:', err)
    throw err
  }

  // Step 5: Verify with test
  try {
    const testOutput = await extractor('test', { pooling: 'mean', normalize: true })
    if (!testOutput.data || testOutput.data.length < EMBEDDING_DIM) {
      throw new Error(`Embedding test: got ${testOutput.data?.length ?? 0} dims, expected ${EMBEDDING_DIM}`)
    }
    console.log('[Embedding] Model loaded and verified:', MODEL_NAME, `(${EMBEDDING_DIM}d)`)
  } catch (err) {
    console.error('[Embedding] Model verification failed:', err)
    extractor = null
    throw err
  }
}

export async function embed(text: string): Promise<number[]> {
  if (!extractor) throw new Error('Embedding model not loaded')
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM)
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!extractor) throw new Error('Embedding model not loaded')
  if (texts.length === 0) return []

  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  const data = output.data as Float32Array
  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(data.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)))
  }
  return vectors
}

export function isEmbeddingReady(): boolean {
  return extractor !== null
}

export { EMBEDDING_DIM }
