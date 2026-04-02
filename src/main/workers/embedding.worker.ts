// src/main/workers/embedding.worker.ts
import { parentPort } from 'node:worker_threads'
import path from 'node:path'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const EMBEDDING_DIM = 384

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

interface WorkerMessage {
  type: 'init' | 'embed' | 'embedBatch' | 'shutdown'
  id: number
  payload?: {
    text?: string
    texts?: string[]
    isPackaged?: boolean
    resourcesPath?: string
  }
}

interface WorkerResponse {
  type: 'result' | 'error'
  id: number
  data?: number[] | number[][]
  error?: string
}

function respond(msg: WorkerResponse): void {
  parentPort?.postMessage(msg)
}

async function handleInit(msg: WorkerMessage): Promise<void> {
  if (extractor) {
    respond({ type: 'result', id: msg.id })
    return
  }

  const transformers = await import('@huggingface/transformers')
  const { pipeline, env } = transformers

  if (msg.payload?.isPackaged) {
    env.localModelPath = path.join(msg.payload.resourcesPath!, 'models')
    env.allowRemoteModels = false
  } else {
    env.allowRemoteModels = true
  }

  extractor = await pipeline('feature-extraction', MODEL_NAME, {
    quantized: true,
    dtype: 'fp32',
    device: 'cpu'
  })

  // Verify
  const testOutput = await extractor('test', { pooling: 'mean', normalize: true })
  if (!testOutput.data || testOutput.data.length < EMBEDDING_DIM) {
    throw new Error(`Embedding test: got ${testOutput.data?.length ?? 0} dims, expected ${EMBEDDING_DIM}`)
  }

  respond({ type: 'result', id: msg.id })
}

async function handleEmbed(msg: WorkerMessage): Promise<void> {
  if (!extractor) throw new Error('Model not loaded')
  const output = await extractor(msg.payload!.text!, { pooling: 'mean', normalize: true })
  const vector = Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM)
  respond({ type: 'result', id: msg.id, data: vector })
}

async function handleEmbedBatch(msg: WorkerMessage): Promise<void> {
  if (!extractor) throw new Error('Model not loaded')
  const texts = msg.payload!.texts!
  if (texts.length === 0) {
    respond({ type: 'result', id: msg.id, data: [] })
    return
  }

  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  const data = output.data as Float32Array
  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(data.slice(i * EMBEDDING_DIM, (i + 1) * EMBEDDING_DIM)))
  }
  respond({ type: 'result', id: msg.id, data: vectors })
}

parentPort?.on('message', async (msg: WorkerMessage) => {
  try {
    switch (msg.type) {
      case 'init':
        await handleInit(msg)
        break
      case 'embed':
        await handleEmbed(msg)
        break
      case 'embedBatch':
        await handleEmbedBatch(msg)
        break
      case 'shutdown':
        respond({ type: 'result', id: msg.id })
        process.exit(0)
        break
    }
  } catch (err) {
    respond({
      type: 'error',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err)
    })
  }
})
