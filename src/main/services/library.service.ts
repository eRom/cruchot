/**
 * LibraryService — Singleton pour les referentiels documentaires (Custom RAG).
 * CRUD, import sources, chunking adaptatif, indexation, retrieval.
 */
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash, randomUUID } from 'crypto'
import { app, BrowserWindow } from 'electron'
import { QDRANT_PORT_NUMBER } from './qdrant-process'
import { embedForLibrary, embedBatchForLibrary, getDimensions, type EmbeddingModelType } from './library-embedding.service'
import {
  getLibrary, createLibrary, updateLibrary, deleteLibrary as dbDeleteLibrary,
  updateLibraryStatus, updateLibraryStats,
  getLibrarySources, getLibrarySource, createLibrarySource,
  updateSourceStatus, deleteLibrarySource as dbDeleteSource,
  createLibraryChunks, deleteChunksBySource, getChunksBySource
} from '../db/queries/libraries'
import type { LibraryChunkForPrompt } from '../llm/library-prompt'

// ── Constants ─────────────────────────────────────────

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_SOURCES_PER_LIBRARY = 100
const MAX_EXTRACTED_LENGTH = 500_000

const SUPPORTED_EXTENSIONS = new Set([
  '.txt', '.md', '.pdf', '.docx',
  '.ts', '.js', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.rb', '.php', '.swift', '.kt',
  '.html', '.css', '.json', '.yaml', '.yml', '.xml', '.sql', '.sh',
  '.csv',
  // Images (requires Mistral OCR)
  '.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.webp'
])

const MIME_MAP: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.csv': 'text/csv', '.html': 'text/html', '.css': 'text/css',
  '.json': 'application/json', '.yaml': 'text/yaml', '.yml': 'text/yaml',
  '.xml': 'application/xml', '.sql': 'text/x-sql', '.sh': 'text/x-shellscript'
}

const IMAGE_MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.tiff': 'image/tiff', '.bmp': 'image/bmp', '.webp': 'image/webp'
}

// ── Chunking configs ──────────────────────────────────

interface ChunkingConfig {
  chunkSize: number
  chunkOverlap: number
  separators: string[]
  prependHeader?: boolean
}

const CHUNKING_CONFIGS: Record<EmbeddingModelType, Record<string, ChunkingConfig>> = {
  local: {
    markdown: { chunkSize: 1500, chunkOverlap: 200, separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' '] },
    code: { chunkSize: 2000, chunkOverlap: 200, separators: ['\nfunction ', '\nclass ', '\nexport ', '\n\n', '\n', ' '] },
    plaintext: { chunkSize: 1000, chunkOverlap: 200, separators: ['\n\n', '\n', '. ', ' '] },
    csv: { chunkSize: 1500, chunkOverlap: 100, separators: ['\n'], prependHeader: true }
  },
  google: {
    markdown: { chunkSize: 3000, chunkOverlap: 300, separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' '] },
    code: { chunkSize: 4000, chunkOverlap: 300, separators: ['\nfunction ', '\nclass ', '\nexport ', '\n\n', '\n', ' '] },
    plaintext: { chunkSize: 2500, chunkOverlap: 300, separators: ['\n\n', '\n', '. ', ' '] },
    csv: { chunkSize: 2500, chunkOverlap: 100, separators: ['\n'], prependHeader: true }
  }
}

// ── Retrieval result ──────────────────────────────────

export interface LibrarySearchResult {
  id: string
  score: number
  content: string
  contentPreview: string
  sourceId: string
  libraryId: string
  filename: string
  heading: string | null
  chunkIndex: number
  startChar: number
  endChar: number
  lineStart: number | null
  lineEnd: number | null
}

// ── Service ───────────────────────────────────────────

class LibraryService {
  private getLibrariesPath(): string {
    return path.join(app.getPath('userData'), 'libraries')
  }

  private getLibraryPath(libraryId: string): string {
    return path.join(this.getLibrariesPath(), libraryId, 'sources')
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  // ── CRUD ──────────────────────────────────────────

  list() {
    const { getAllLibraries } = require('../db/queries/libraries')
    return getAllLibraries()
  }

  get(id: string) {
    return getLibrary(id)
  }

  create(data: { name: string; description?: string; color?: string; icon?: string; projectId?: string; embeddingModel?: 'local' | 'google' }) {
    return createLibrary(data)
  }

  update(id: string, data: { name?: string; description?: string; color?: string; icon?: string }) {
    return updateLibrary(id, data)
  }

  async delete(id: string): Promise<void> {
    // 1. Delete Qdrant collection
    await this.deleteCollection(id).catch(() => {})
    // 2. Delete files
    const libPath = path.join(this.getLibrariesPath(), id)
    if (fs.existsSync(libPath)) {
      try {
        const { default: trash } = await import('trash')
        await trash(libPath)
      } catch {
        // Fallback: ignore if trash fails
      }
    }
    // 3. Delete from DB (cascade handles sources + chunks)
    dbDeleteLibrary(id)
  }

  // ── Import Sources ────────────────────────────────

  // ── Path confinement for addSources ─────────────────
  private static readonly BLOCKED_SOURCE_ROOTS = [
    '/etc', '/usr', '/System', '/Library', '/var', '/bin', '/sbin',
    '/private', '/opt', '/cores', '/dev', '/proc', '/sys',
    '/tmp', '/boot', '/root'
  ]

  private static readonly SENSITIVE_FILE_PATTERNS = [
    /^\.env$/i, /\.key$/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i,
    /^id_rsa/, /^id_ed25519/, /^id_ecdsa/, /^authorized_keys$/,
    /^known_hosts$/, /^credentials$/i, /^\.aws/, /^\.ssh/,
    /^\.gnupg/, /^\.netrc$/, /^\.npmrc$/
  ]

  private validateSourcePath(filePath: string): void {
    let resolved: string
    try {
      resolved = fs.realpathSync(filePath)
    } catch {
      resolved = path.resolve(filePath)
    }

    // Block system roots
    for (const root of LibraryService.BLOCKED_SOURCE_ROOTS) {
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        throw new Error(`Chemin systeme refuse : ${resolved}`)
      }
    }

    // Block sensitive files
    const filename = path.basename(resolved)
    for (const pattern of LibraryService.SENSITIVE_FILE_PATTERNS) {
      if (pattern.test(filename)) {
        throw new Error(`Fichier sensible refuse : ${filename}`)
      }
    }
  }

  async addSources(libraryId: string, filePaths: string[], win?: BrowserWindow): Promise<void> {
    const library = getLibrary(libraryId)
    if (!library) throw new Error('Library not found')

    // Validate all paths before processing
    for (const fp of filePaths) {
      this.validateSourcePath(fp)
    }

    const existingSources = getLibrarySources(libraryId)
    if (existingSources.length + filePaths.length > MAX_SOURCES_PER_LIBRARY) {
      throw new Error(`Maximum ${MAX_SOURCES_PER_LIBRARY} sources par referentiel`)
    }

    updateLibraryStatus(libraryId, 'indexing')

    const sourceDir = this.getLibraryPath(libraryId)
    this.ensureDir(sourceDir)

    for (const filePath of filePaths) {
      try {
        const ext = path.extname(filePath).toLowerCase()
        if (!SUPPORTED_EXTENSIONS.has(ext)) {
          console.warn(`[Library] Unsupported extension: ${ext}`)
          continue
        }

        const stat = await fsp.stat(filePath)
        if (stat.size > MAX_FILE_SIZE) {
          console.warn(`[Library] File too large: ${filePath} (${stat.size} bytes)`)
          continue
        }

        const filename = path.basename(filePath)
        const fileBuffer = await fsp.readFile(filePath)
        const contentHash = createHash('sha256').update(fileBuffer).digest('hex')

        // Check for duplicate by hash
        const duplicate = existingSources.find(s => s.contentHash === contentHash)
        if (duplicate) {
          console.log(`[Library] Duplicate file skipped: ${filename}`)
          continue
        }

        const mimeType = MIME_MAP[ext] || IMAGE_MIME_MAP[ext] || `text/x-${ext.slice(1)}`
        const storedFilename = `${Date.now()}-${filename}`
        const storedPath = path.join(sourceDir, storedFilename)
        await fsp.copyFile(filePath, storedPath)

        const source = createLibrarySource({
          libraryId,
          filename,
          originalPath: filePath,
          storedPath,
          mimeType,
          sizeBytes: stat.size,
          contentHash
        })

        // Index the source
        await this.indexSource(libraryId, source.id, library.embeddingModel as EmbeddingModelType, win)
      } catch (err) {
        console.error(`[Library] Failed to add source: ${filePath}`, err)
      }
    }

    updateLibraryStats(libraryId)

    // Set status based on sources
    const sources = getLibrarySources(libraryId)
    const allReady = sources.length > 0 && sources.every(s => s.status === 'ready')
    const hasError = sources.some(s => s.status === 'error')
    updateLibraryStatus(libraryId, allReady ? 'ready' : hasError ? 'error' : sources.length === 0 ? 'empty' : 'indexing')
  }

  async removeSource(libraryId: string, sourceId: string): Promise<void> {
    const source = getLibrarySource(sourceId)
    if (!source) return

    // Delete chunks from Qdrant
    const chunks = getChunksBySource(sourceId)
    if (chunks.length > 0) {
      const pointIds = chunks.map(c => c.pointId)
      await this.deletePoints(libraryId, pointIds).catch(() => {})
    }

    // Delete stored file
    if (fs.existsSync(source.storedPath)) {
      try {
        const { default: trash } = await import('trash')
        await trash(source.storedPath)
      } catch { /* ignore */ }
    }

    // Delete from DB (cascade handles chunks)
    dbDeleteSource(sourceId)
    updateLibraryStats(libraryId)

    // Update library status
    const remainingSources = getLibrarySources(libraryId)
    if (remainingSources.length === 0) {
      updateLibraryStatus(libraryId, 'empty')
    }
  }

  // ── Indexation ────────────────────────────────────

  async indexSource(libraryId: string, sourceId: string, modelType: EmbeddingModelType, win?: BrowserWindow): Promise<void> {
    const source = getLibrarySource(sourceId)
    if (!source) throw new Error('Source not found')

    const sendProgress = (percent: number, status: string) => {
      if (win) {
        win.webContents.send('library:indexing-progress', {
          libraryId, sourceId, percent, status
        })
      }
    }

    try {
      // 1. Extract text
      sendProgress(10, 'extracting')
      updateSourceStatus(sourceId, 'extracting')
      const extractedText = await this.extractText(source.storedPath, source.mimeType)
      const truncated = extractedText.slice(0, MAX_EXTRACTED_LENGTH)
      updateSourceStatus(sourceId, 'extracting', {
        extractedText: truncated,
        extractedLength: truncated.length
      })

      // 2. Chunk
      sendProgress(30, 'chunking')
      updateSourceStatus(sourceId, 'chunking')
      const contentType = this.getContentType(source.mimeType)
      const config = CHUNKING_CONFIGS[modelType][contentType]
      const textChunks = this.chunkText(truncated, config, contentType === 'csv' ? truncated : undefined)

      // Extract metadata for each chunk
      const chunkMeta = textChunks.map((chunk, i) => {
        const startChar = truncated.indexOf(chunk.text)
        const endChar = startChar + chunk.text.length
        return {
          text: chunk.text,
          chunkIndex: i,
          startChar: startChar >= 0 ? startChar : 0,
          endChar: endChar >= 0 ? endChar : chunk.text.length,
          heading: chunk.heading,
          lineStart: this.getLineNumber(truncated, startChar >= 0 ? startChar : 0),
          lineEnd: this.getLineNumber(truncated, endChar >= 0 ? endChar - 1 : chunk.text.length - 1)
        }
      })

      // 3. Ensure collection
      await this.ensureCollection(libraryId, modelType)

      // 4. Embed
      sendProgress(50, 'embedding')
      updateSourceStatus(sourceId, 'indexing')
      const texts = chunkMeta.map(c => c.text)
      const vectors = await embedBatchForLibrary(texts, modelType, true)

      // 5. Upsert to Qdrant
      sendProgress(80, 'upserting')
      const points = vectors.map((vector, i) => ({
        id: randomUUID(),
        vector,
        payload: {
          sourceId,
          libraryId,
          filename: source.filename,
          heading: chunkMeta[i].heading,
          chunkIndex: chunkMeta[i].chunkIndex,
          startChar: chunkMeta[i].startChar,
          endChar: chunkMeta[i].endChar,
          lineStart: chunkMeta[i].lineStart,
          lineEnd: chunkMeta[i].lineEnd,
          content: chunkMeta[i].text,
          contentPreview: chunkMeta[i].text.slice(0, 200)
        }
      }))

      if (points.length > 0) {
        await this.qdrantFetch(`/collections/library_${libraryId}/points`, {
          method: 'PUT',
          body: JSON.stringify({ points })
        })
      }

      // 6. Save chunk tracking in SQLite
      createLibraryChunks(points.map((p, i) => ({
        libraryId,
        sourceId,
        pointId: p.id,
        chunkIndex: chunkMeta[i].chunkIndex,
        startChar: chunkMeta[i].startChar,
        endChar: chunkMeta[i].endChar,
        heading: chunkMeta[i].heading ?? undefined,
        lineStart: chunkMeta[i].lineStart ?? undefined,
        lineEnd: chunkMeta[i].lineEnd ?? undefined
      })))

      // 7. Update status
      updateSourceStatus(sourceId, 'ready', { chunksCount: points.length })
      sendProgress(100, 'done')

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateSourceStatus(sourceId, 'error', { errorMessage: msg })
      sendProgress(0, 'error')
      throw err
    }
  }

  async reindexSource(libraryId: string, sourceId: string, win?: BrowserWindow): Promise<void> {
    const library = getLibrary(libraryId)
    if (!library) throw new Error('Library not found')

    // Delete existing chunks
    const chunks = getChunksBySource(sourceId)
    if (chunks.length > 0) {
      await this.deletePoints(libraryId, chunks.map(c => c.pointId)).catch(() => {})
    }
    deleteChunksBySource(sourceId)

    // Re-index
    await this.indexSource(libraryId, sourceId, library.embeddingModel as EmbeddingModelType, win)
    updateLibraryStats(libraryId)
  }

  async reindexAll(libraryId: string, win?: BrowserWindow): Promise<void> {
    const library = getLibrary(libraryId)
    if (!library) throw new Error('Library not found')

    updateLibraryStatus(libraryId, 'indexing')

    // Delete entire collection and recreate
    await this.deleteCollection(libraryId).catch(() => {})

    const sources = getLibrarySources(libraryId)
    for (const source of sources) {
      try {
        deleteChunksBySource(source.id)
        await this.indexSource(libraryId, source.id, library.embeddingModel as EmbeddingModelType, win)
      } catch (err) {
        console.error(`[Library] Failed to reindex source ${source.id}:`, err)
      }
    }

    updateLibraryStats(libraryId)
    const updatedSources = getLibrarySources(libraryId)
    const allReady = updatedSources.length > 0 && updatedSources.every(s => s.status === 'ready')
    updateLibraryStatus(libraryId, allReady ? 'ready' : 'error')
  }

  // ── Retrieval ─────────────────────────────────────

  async query(libraryId: string, queryText: string, options?: {
    topK?: number
    scoreThreshold?: number
  }): Promise<LibrarySearchResult[]> {
    const library = getLibrary(libraryId)
    if (!library || library.status !== 'ready') return []

    const topK = options?.topK ?? 10
    const threshold = options?.scoreThreshold ?? 0.30

    const queryVector = await embedForLibrary(queryText, library.embeddingModel as EmbeddingModelType)

    const res = await this.qdrantFetch(`/collections/library_${libraryId}/points/search`, {
      method: 'POST',
      body: JSON.stringify({
        vector: queryVector,
        limit: topK,
        score_threshold: threshold,
        with_payload: true
      })
    })

    if (!res.ok) return []

    const data = await res.json() as {
      result: Array<{ id: string; score: number; payload: Record<string, unknown> }>
    }

    return (data.result || []).map(point => ({
      id: point.id,
      score: point.score,
      content: String(point.payload.content ?? ''),
      contentPreview: String(point.payload.contentPreview ?? ''),
      sourceId: String(point.payload.sourceId ?? ''),
      libraryId: String(point.payload.libraryId ?? ''),
      filename: String(point.payload.filename ?? ''),
      heading: point.payload.heading as string | null,
      chunkIndex: Number(point.payload.chunkIndex ?? 0),
      startChar: Number(point.payload.startChar ?? 0),
      endChar: Number(point.payload.endChar ?? 0),
      lineStart: point.payload.lineStart as number | null,
      lineEnd: point.payload.lineEnd as number | null
    }))
  }

  /**
   * Retrieval for chat — selects best chunks within token budget.
   */
  async retrieveForChat(libraryId: string, queryText: string): Promise<LibraryChunkForPrompt[]> {
    const library = getLibrary(libraryId)
    if (!library) return []

    const results = await this.query(libraryId, queryText, {
      topK: 10,
      scoreThreshold: 0.30
    })

    return this.selectBestChunks(results, library.name, {
      maxChunks: 10,
      maxTokens: 3000
    })
  }

  private selectBestChunks(
    results: LibrarySearchResult[],
    libraryName: string,
    budget: { maxChunks: number; maxTokens: number }
  ): LibraryChunkForPrompt[] {
    const selected: LibraryChunkForPrompt[] = []
    let totalTokens = 0

    // Already sorted by score desc from Qdrant
    for (let i = 0; i < results.length && selected.length < budget.maxChunks; i++) {
      const r = results[i]
      const chunkTokens = Math.ceil(r.content.length / 4) // ~4 chars per token
      if (totalTokens + chunkTokens > budget.maxTokens) continue

      selected.push({
        id: selected.length + 1,
        sourceId: r.sourceId,
        libraryId: r.libraryId,
        libraryName,
        filename: r.filename,
        heading: r.heading,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        content: r.content,
        contentPreview: r.contentPreview,
        score: r.score
      })
      totalTokens += chunkTokens
    }

    return selected
  }

  // ── Text Extraction ───────────────────────────────

  private async extractText(filePath: string, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js')
      const buffer = await fsp.readFile(filePath)
      const result = await pdfParse(buffer)
      const text = result.text?.trim() ?? ''

      // Scanned PDF detection — fallback to OCR
      if (text.length < 50) {
        const { ocrService } = await import('./ocr.service')
        if (ocrService.isAvailable()) {
          const ocrResult = await ocrService.processFile(filePath, { tableFormat: 'html' })
          return ocrResult.text
        }
        throw new Error('PDF scanne detecte — configurez une cle API Mistral pour l\'OCR')
      }

      return text
    }

    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth')
      const result = await mammoth.convertToMarkdown({ path: filePath })
      return result.value
    }

    // Image files — require OCR
    if (mimeType.startsWith('image/')) {
      const { ocrService } = await import('./ocr.service')
      if (!ocrService.isAvailable()) {
        throw new Error('L\'indexation d\'images necessite une cle API Mistral pour l\'OCR')
      }
      const buffer = await fsp.readFile(filePath)
      const ocrResult = await ocrService.processImage(buffer, mimeType)
      return ocrResult.text
    }

    // All other formats: read as text
    return fsp.readFile(filePath, 'utf-8')
  }

  // ── Chunking ──────────────────────────────────────

  private getContentType(mimeType: string): string {
    if (mimeType === 'text/markdown') return 'markdown'
    if (mimeType === 'text/csv') return 'csv'
    if (mimeType.startsWith('image/')) return 'markdown'  // OCR output is markdown
    if (mimeType.startsWith('text/x-') || ['application/json', 'application/xml'].includes(mimeType)) return 'code'
    return 'plaintext'
  }

  private chunkText(
    text: string,
    config: ChunkingConfig,
    rawText?: string // For CSV: original text to extract header
  ): Array<{ text: string; heading: string | null }> {
    if (text.length <= config.chunkSize) {
      return [{ text, heading: this.findLastHeading(text, 0) }]
    }

    // CSV header extraction
    let csvHeader = ''
    if (config.prependHeader && rawText) {
      const firstNewline = rawText.indexOf('\n')
      if (firstNewline > 0) {
        csvHeader = rawText.slice(0, firstNewline + 1)
      }
    }

    const chunks: Array<{ text: string; heading: string | null }> = []
    let start = 0

    while (start < text.length) {
      let end = Math.min(start + config.chunkSize, text.length)

      // Try to cut at a separator boundary
      if (end < text.length) {
        const slice = text.slice(start, end)
        let bestCut = -1

        for (const sep of config.separators) {
          const idx = slice.lastIndexOf(sep)
          if (idx > config.chunkSize * 0.5) {
            bestCut = start + idx + sep.length
            break
          }
        }

        if (bestCut > start) {
          end = bestCut
        }
      }

      let chunkText = text.slice(start, end)
      // Prepend CSV header if not the first chunk
      if (csvHeader && start > 0) {
        chunkText = csvHeader + chunkText
      }

      const heading = this.findLastHeading(text, start)
      chunks.push({ text: chunkText, heading })

      if (end >= text.length) break

      const nextStart = end - config.chunkOverlap
      start = Math.max(nextStart, start + 1) // Guard anti-boucle infinie
    }

    return chunks
  }

  private findLastHeading(text: string, position: number): string | null {
    const before = text.slice(0, position)
    // Match Markdown headings
    const matches = before.match(/^#{1,6}\s+.+$/gm)
    if (matches && matches.length > 0) {
      return matches[matches.length - 1].replace(/^#+\s+/, '')
    }
    return null
  }

  private getLineNumber(text: string, charPos: number): number | null {
    if (charPos < 0 || charPos >= text.length) return null
    let line = 1
    for (let i = 0; i < charPos; i++) {
      if (text[i] === '\n') line++
    }
    return line
  }

  // ── Qdrant helpers ────────────────────────────────

  private async qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `http://127.0.0.1:${QDRANT_PORT_NUMBER}${path}`
    return fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers }
    })
  }

  private async ensureCollection(libraryId: string, modelType: EmbeddingModelType): Promise<void> {
    const collectionName = `library_${libraryId}`
    const res = await this.qdrantFetch(`/collections/${collectionName}`)
    if (res.ok) return

    const dimensions = getDimensions(modelType)
    await this.qdrantFetch(`/collections/${collectionName}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: { size: dimensions, distance: 'Cosine' }
      })
    })
    console.log(`[Library] Collection created: ${collectionName} (${dimensions}d)`)
  }

  private async deleteCollection(libraryId: string): Promise<void> {
    await this.qdrantFetch(`/collections/library_${libraryId}`, { method: 'DELETE' })
  }

  private async deletePoints(libraryId: string, pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) return
    await this.qdrantFetch(`/collections/library_${libraryId}/points/delete`, {
      method: 'POST',
      body: JSON.stringify({ points: pointIds })
    })
  }

  /**
   * Delete all library_* collections from Qdrant (for cleanup/factory reset).
   */
  async deleteAllCollections(): Promise<void> {
    try {
      const res = await this.qdrantFetch('/collections')
      if (!res.ok) return
      const data = await res.json() as { result: { collections: Array<{ name: string }> } }
      const libCollections = (data.result?.collections ?? [])
        .filter(c => c.name.startsWith('library_'))
      for (const col of libCollections) {
        await this.qdrantFetch(`/collections/${col.name}`, { method: 'DELETE' }).catch(() => {})
      }
    } catch {
      // Best effort
    }
  }

  /**
   * Get stats for a library from Qdrant collection.
   */
  async getStats(libraryId: string): Promise<{ totalPoints: number; collectionSizeMB: string }> {
    try {
      const res = await this.qdrantFetch(`/collections/library_${libraryId}`)
      if (!res.ok) return { totalPoints: 0, collectionSizeMB: '0' }
      const data = await res.json() as {
        result: { points_count: number; disk_data_size: number; ram_data_size: number }
      }
      const totalBytes = (data.result?.disk_data_size ?? 0) + (data.result?.ram_data_size ?? 0)
      return {
        totalPoints: data.result?.points_count ?? 0,
        collectionSizeMB: (totalBytes / (1024 * 1024)).toFixed(1)
      }
    } catch {
      return { totalPoints: 0, collectionSizeMB: '0' }
    }
  }
}

export const libraryService = new LibraryService()
