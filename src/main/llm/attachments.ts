/**
 * Attachment processing for chat messages.
 * Handles validation, text extraction, and base64 encoding of files.
 * All file I/O happens in the main process — the renderer never reads file contents.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// ── Constants ────────────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_FILES_PER_MESSAGE = 10

// ── Whitelist ────────────────────────────────────────────────────
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'])
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.csv'])
const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h',
  '.html', '.css', '.json', '.yaml', '.yml', '.toml', '.xml', '.sql', '.sh', '.rb',
  '.php', '.swift', '.kt'
])
const ALL_ALLOWED = new Set([...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...CODE_EXTENSIONS])

// ── MIME types ───────────────────────────────────────────────────
const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv'
}

// ── Types ────────────────────────────────────────────────────────
export interface AttachmentRef {
  path: string
  name: string
  size: number
  type: 'image' | 'document' | 'code'
  mimeType: string
}

export interface ProcessedAttachment {
  ref: AttachmentRef
  /** Base64 content for images (except SVG) */
  base64?: string
  /** Extracted text content for documents and code */
  textContent?: string
}

// ── Helpers ──────────────────────────────────────────────────────

function getFileCategory(ext: string): 'image' | 'document' | 'code' | null {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  return null
}

function getMimeType(ext: string): string {
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

// ── Validation ───────────────────────────────────────────────────

/**
 * Returns the list of directories from which attachments can be loaded.
 * Includes userData/attachments, userData/images, and the active workspace root if set.
 */
function getAttachmentAllowedDirs(workspaceRoot?: string | null): string[] {
  const dirs = [
    path.join(app.getPath('userData'), 'attachments') + path.sep,
    path.join(app.getPath('userData'), 'images') + path.sep
  ]
  if (workspaceRoot) {
    dirs.push(path.resolve(workspaceRoot) + path.sep)
  }
  return dirs
}

function isAttachmentPathAllowed(filePath: string, workspaceRoot?: string | null): boolean {
  const resolved = path.resolve(filePath)
  return getAttachmentAllowedDirs(workspaceRoot).some(
    (dir) => resolved.startsWith(dir) || resolved === dir.slice(0, -1)
  )
}

export function validateAttachment(filePath: string, workspaceRoot?: string | null): { valid: true; ref: AttachmentRef } | { valid: false; error: string } {
  const name = path.basename(filePath)

  // Hidden files
  if (name.startsWith('.')) {
    return { valid: false, error: `Fichier cache refuse : ${name}` }
  }

  // Extension whitelist
  const ext = path.extname(name).toLowerCase()
  if (!ALL_ALLOWED.has(ext)) {
    return { valid: false, error: `Extension non supportee : ${ext}` }
  }

  // Path confinement — must be within allowed directories
  if (!isAttachmentPathAllowed(filePath, workspaceRoot)) {
    return { valid: false, error: `Acces refuse : fichier en dehors des repertoires autorises` }
  }

  // File exists
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: `Fichier introuvable : ${name}` }
  }

  // File size
  const stats = fs.statSync(filePath)
  if (stats.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Fichier trop volumineux (${(stats.size / 1024 / 1024).toFixed(1)} MB > 10 MB) : ${name}` }
  }

  const category = getFileCategory(ext)!
  return {
    valid: true,
    ref: {
      path: filePath,
      name,
      size: stats.size,
      type: category,
      mimeType: getMimeType(ext)
    }
  }
}

// ── Text extraction ──────────────────────────────────────────────

async function extractPdfText(filePath: string): Promise<string> {
  // Import lib/pdf-parse directly to avoid index.js test code
  // (pdf-parse v1.1.1 runs a test file read when module.parent is null in bundled context)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse.js')
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  const text = data.text?.trim() ?? ''

  // Detect scanned PDF (text is empty or near-empty)
  if (text.length < 50) {
    throw new Error('PDF scanne detecte — extraction de texte impossible. Seuls les PDF textuels sont supportes.')
  }

  return text
}

async function extractDocxText(filePath: string): Promise<string> {
  // mammoth is CJS — require() works reliably in Electron main
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth')
  const buffer = fs.readFileSync(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return result.value?.trim() ?? ''
}

function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8')
}

// ── Process attachments ──────────────────────────────────────────

/**
 * Process a list of attachment references for sending to the LLM.
 * - Images: read as base64 (except SVG → treated as code)
 * - Documents: extract text (PDF via pdf-parse, DOCX via mammoth, others via readFile)
 * - Code: read as UTF-8 text
 */
export async function processAttachments(refs: AttachmentRef[]): Promise<ProcessedAttachment[]> {
  const results: ProcessedAttachment[] = []

  for (const ref of refs) {
    const ext = path.extname(ref.name).toLowerCase()

    if (ref.type === 'image' && ext !== '.svg') {
      // Image → base64
      const buffer = fs.readFileSync(ref.path)
      results.push({
        ref,
        base64: buffer.toString('base64')
      })
    } else if (ext === '.svg') {
      // SVG → treat as code/text (security: no image rendering)
      const text = readTextFile(ref.path)
      results.push({ ref, textContent: text })
    } else if (ext === '.pdf') {
      const text = await extractPdfText(ref.path)
      results.push({ ref, textContent: text })
    } else if (ext === '.docx') {
      const text = await extractDocxText(ref.path)
      results.push({ ref, textContent: text })
    } else {
      // .txt, .md, .csv, code files → read as UTF-8
      const text = readTextFile(ref.path)
      results.push({ ref, textContent: text })
    }
  }

  return results
}

/**
 * Build AI SDK content parts from processed attachments.
 * Returns: { userContentParts, inlineText }
 * - userContentParts: image parts for multi-part message
 * - inlineText: text to append after the user's message
 */
export function buildContentParts(
  processed: ProcessedAttachment[]
): {
  imageParts: Array<{ type: 'image'; image: string; mimeType: string }>
  inlineText: string
} {
  const imageParts: Array<{ type: 'image'; image: string; mimeType: string }> = []
  const textParts: string[] = []

  for (const p of processed) {
    if (p.base64 && p.ref.type === 'image') {
      imageParts.push({
        type: 'image',
        image: p.base64,
        mimeType: p.ref.mimeType
      })
    } else if (p.textContent) {
      const sizeLabel = formatSize(p.ref.size)
      textParts.push(`---\n📎 ${p.ref.name} (${sizeLabel})\n\`\`\`\n${p.textContent}\n\`\`\``)
    }
  }

  return {
    imageParts,
    inlineText: textParts.length > 0 ? '\n\n' + textParts.join('\n\n') : ''
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
