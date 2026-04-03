// src/main/services/ocr.service.ts
/**
 * OcrService — OCR via Mistral OCR API.
 * Utilise la meme cle API que le provider Mistral chat.
 * Dynamic import car @mistralai/mistralai est ESM-only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getApiKeyForProvider } from '../ipc/providers.ipc'

// ── Types ────────────────────────────────────────────────
export interface OcrOptions {
  pages?: number[]
  tableFormat?: 'html' | 'markdown'
  onProgress?: (page: number, total: number) => void
}

export interface OcrPage {
  index: number
  markdown: string
  header?: string
  footer?: string
}

export interface OcrResult {
  text: string
  pages: OcrPage[]
  pagesProcessed: number
  fileSizeBytes: number
}

export type OcrErrorCode = 'NO_API_KEY' | 'FILE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'API_ERROR' | 'RATE_LIMIT'

export class OcrError extends Error {
  constructor(public code: OcrErrorCode, message: string) {
    super(message)
    this.name = 'OcrError'
  }
}

const MAX_OCR_FILE_SIZE = 50 * 1024 * 1024 // 50 MB (Mistral limit)

const OCR_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'image/avif'
])

const OCR_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])

// ── Service ──────────────────────────────────────────────

class OcrService {
  private clientPromise: Promise<any> | null = null

  /**
   * Lazy-init the Mistral client. Dynamic import because the SDK is ESM-only.
   * Caches the promise so repeated calls don't re-import.
   */
  private async getClient(): Promise<any> {
    if (this.clientPromise) return this.clientPromise

    const apiKey = getApiKeyForProvider('mistral')
    if (!apiKey) {
      throw new OcrError('NO_API_KEY', 'Cle API Mistral non configuree — impossible d\'utiliser l\'OCR')
    }

    this.clientPromise = (async () => {
      const { Mistral } = await import('@mistralai/mistralai')
      return new Mistral({ apiKey })
    })()

    return this.clientPromise
  }

  /** Invalidate cached client (call after API key change) */
  invalidate(): void {
    this.clientPromise = null
  }

  /** Check if OCR is available (Mistral API key configured) */
  isAvailable(): boolean {
    try {
      const apiKey = getApiKeyForProvider('mistral')
      return !!apiKey
    } catch {
      return false
    }
  }

  /**
   * OCR a local file (PDF, DOCX, PPTX).
   * Sends as base64 data URL — the Files API upload ID is NOT accepted by /v1/ocr.
   */
  async processFile(filePath: string, options?: OcrOptions): Promise<OcrResult> {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_OCR_FILE_SIZE) {
      throw new OcrError('FILE_TOO_LARGE', `Fichier trop volumineux pour l'OCR (${(stat.size / 1024 / 1024).toFixed(1)} MB > 50 MB)`)
    }

    const client = await this.getClient()

    // Send as base64 data URL (the OCR endpoint does not accept file IDs)
    const content = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeType = ext === '.pdf' ? 'application/pdf'
      : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === '.pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      : 'application/octet-stream'
    const base64 = content.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return this.callOcr(client, {
      type: 'document_url',
      documentUrl: dataUrl
    }, options)
  }

  /**
   * OCR an image from a buffer.
   * Sends as base64 data URL.
   */
  async processImage(imageBuffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!OCR_IMAGE_MIMES.has(mimeType)) {
      throw new OcrError('UNSUPPORTED_FORMAT', `Format image non supporte pour l'OCR : ${mimeType}`)
    }

    const client = await this.getClient()
    const base64 = imageBuffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64}`

    return this.callOcr(client, {
      type: 'image_url',
      imageUrl: dataUrl
    })
  }

  /** Check if a MIME type is OCR-processable */
  canProcess(mimeType: string): boolean {
    return OCR_IMAGE_MIMES.has(mimeType) || OCR_DOCUMENT_MIMES.has(mimeType)
  }

  // ── Private ──────────────────────────────────────────

  private async callOcr(
    client: any,
    document: { type: string; documentUrl?: string; imageUrl?: string },
    options?: OcrOptions
  ): Promise<OcrResult> {
    try {
      const params: Record<string, unknown> = {
        model: 'mistral-ocr-latest',
        document,
        includeImageBase64: false,
        extractHeader: true,
        extractFooter: true
      }

      if (options?.tableFormat) {
        params.tableFormat = options.tableFormat
      }
      if (options?.pages) {
        params.pages = options.pages
      }

      const response = await client.ocr.process(params)

      const pages: OcrPage[] = (response.pages || []).map((p: any) => ({
        index: p.index,
        markdown: p.markdown || '',
        header: p.header || undefined,
        footer: p.footer || undefined
      }))

      // Concatenate all pages markdown
      const text = pages.map(p => p.markdown).join('\n\n---\n\n')

      return {
        text,
        pages,
        pagesProcessed: response.usageInfo?.pagesProcessed ?? pages.length,
        fileSizeBytes: response.usageInfo?.docSizeBytes ?? 0
      }
    } catch (err: unknown) {
      // Don't re-wrap OcrErrors
      if (err instanceof OcrError) throw err

      const msg = err instanceof Error ? err.message : String(err)

      if (msg.includes('rate') || msg.includes('429')) {
        throw new OcrError('RATE_LIMIT', 'Limite OCR Mistral atteinte. Reessayez dans quelques minutes.')
      }

      throw new OcrError('API_ERROR', `Erreur OCR Mistral : ${msg}`)
    }
  }
}

export const ocrService = new OcrService()
