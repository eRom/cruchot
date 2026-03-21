import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { bardaParserService } from '../services/barda-parser.service'
import { bardaImportService } from '../services/barda-import.service'
import { getDatabase } from '../db/index'
import {
  listBardas,
  getBardaById,
  toggleBarda,
  deleteBarda,
  deleteResourcesByNamespace
} from '../db/queries/bardas'

const MAX_FILE_SIZE = 1 * 1024 * 1024 // 1 MB

const BLOCKED_ROOTS = ['/etc', '/var', '/usr', '/bin', '/sbin', '/System', '/Library', '/private']

const filePathSchema = z.object({
  filePath: z.string().min(1).max(1000)
})

function validateBardaPath(filePath: string): string {
  // Resolve symlinks
  let resolved: string
  try {
    resolved = fs.realpathSync(filePath)
  } catch {
    throw new Error('Fichier introuvable ou inaccessible')
  }

  // Must be .md
  if (path.extname(resolved).toLowerCase() !== '.md') {
    throw new Error('Seuls les fichiers .md sont acceptes')
  }

  // Block sensitive roots
  for (const root of BLOCKED_ROOTS) {
    if (resolved.startsWith(root + path.sep) || resolved === root) {
      throw new Error('Acces refuse a ce chemin')
    }
  }

  return resolved
}

const toggleSchema = z.object({
  id: z.string().min(1).max(100),
  isEnabled: z.boolean()
})

const uninstallSchema = z.object({
  id: z.string().min(1).max(100)
})

export function registerBardaHandlers(): void {
  // ── barda:import — parse + import en DB ──────────────────
  ipcMain.handle('barda:import', async (_event, payload: unknown) => {
    const parsed = filePathSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const resolvedPath = validateBardaPath(parsed.data.filePath)

    // Verifier taille
    const stat = fs.statSync(resolvedPath)
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`Fichier trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 1 MB)`)
    }

    // Lire et parser
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    const parseResult = bardaParserService.parse(content)

    if (!parseResult.success) {
      throw new Error(`Erreur de parsing ligne ${parseResult.error.line} : ${parseResult.error.message}`)
    }

    // Importer
    const report = await bardaImportService.import(parseResult.data)
    return report
  })

  // ── barda:preview — parse sans import ────────────────────
  ipcMain.handle('barda:preview', async (_event, payload: unknown) => {
    const parsed = filePathSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const resolvedPath = validateBardaPath(parsed.data.filePath)

    // Verifier taille
    const stat = fs.statSync(resolvedPath)
    if (stat.size > MAX_FILE_SIZE) {
      throw new Error(`Fichier trop volumineux (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 1 MB)`)
    }

    // Lire et parser
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    const parseResult = bardaParserService.parse(content)

    if (!parseResult.success) {
      return { success: false, error: parseResult.error }
    }

    return { success: true, data: parseResult.data }
  })

  // ── barda:list ───────────────────────────────────────────
  ipcMain.handle('barda:list', async () => {
    return listBardas()
  })

  // ── barda:toggle ─────────────────────────────────────────
  ipcMain.handle('barda:toggle', async (_event, payload: unknown) => {
    const parsed = toggleSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    toggleBarda(parsed.data.id, parsed.data.isEnabled)
  })

  // ── barda:uninstall ──────────────────────────────────────
  ipcMain.handle('barda:uninstall', async (_event, payload: unknown) => {
    const parsed = uninstallSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid payload')

    const barda = getBardaById(parsed.data.id)
    if (!barda) throw new Error('Barda introuvable')

    // Suppression atomique (transaction)
    const db = getDatabase()
    db.transaction(() => {
      deleteResourcesByNamespace(barda.namespace)
      deleteBarda(parsed.data.id)
    })
  })

  console.log('[IPC] Barda handlers registered')
}
