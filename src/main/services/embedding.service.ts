/**
 * Embedding service — delegue au Worker thread.
 * L'inference ONNX tourne off-thread pour ne pas bloquer le main process.
 * API publique identique : embed(), embedBatch(), initEmbedding(), isEmbeddingReady().
 */
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { app } from 'electron'

const EMBEDDING_DIM = 384
const WORKER_TIMEOUT_MS = 30_000

let worker: Worker | null = null
let ready = false
let requestId = 0

// Pending requests — resolved by worker responses
const pending = new Map<number, {
  resolve: (data: unknown) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

function getWorkerPath(): string {
  // electron-vite outputs worker to same directory as main bundle
  return path.join(__dirname, 'embedding.worker.js')
}

function sendToWorker(type: string, payload?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Embedding worker not started'))
      return
    }

    const id = ++requestId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Embedding worker timeout (${WORKER_TIMEOUT_MS}ms) for ${type}`))
    }, WORKER_TIMEOUT_MS)

    pending.set(id, { resolve, reject, timer })
    worker.postMessage({ type, id, payload })
  })
}

export async function initEmbedding(): Promise<void> {
  if (ready) return

  console.log('[Embedding] Starting worker thread...')

  worker = new Worker(getWorkerPath())

  worker.on('message', (msg: { type: string; id: number; data?: unknown; error?: string }) => {
    const req = pending.get(msg.id)
    if (!req) return
    pending.delete(msg.id)
    clearTimeout(req.timer)

    if (msg.type === 'error') {
      req.reject(new Error(msg.error ?? 'Unknown worker error'))
    } else {
      req.resolve(msg.data)
    }
  })

  worker.on('error', (err) => {
    console.error('[Embedding] Worker error:', err)
    for (const [id, req] of pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Worker crashed: ' + err.message))
      pending.delete(id)
    }
    ready = false
  })

  worker.on('exit', (code) => {
    console.log('[Embedding] Worker exited with code', code)
    worker = null
    ready = false
    for (const [id, req] of pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Worker exited'))
      pending.delete(id)
    }
  })

  // Init model in worker
  await sendToWorker('init', {
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath
  })

  ready = true
  console.log('[Embedding] Worker ready (off-thread ONNX)')
}

export async function embed(text: string): Promise<number[]> {
  if (!ready) throw new Error('Embedding model not loaded')
  const result = await sendToWorker('embed', { text })
  return result as number[]
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!ready) throw new Error('Embedding model not loaded')
  if (texts.length === 0) return []
  const result = await sendToWorker('embedBatch', { texts })
  return result as number[][]
}

export function isEmbeddingReady(): boolean {
  return ready
}

export async function stopEmbedding(): Promise<void> {
  if (!worker) return
  try {
    await sendToWorker('shutdown')
  } catch {
    // Best effort
  }
  worker = null
  ready = false
}

export { EMBEDDING_DIM }
