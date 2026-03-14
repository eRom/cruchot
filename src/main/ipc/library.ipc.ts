import { ipcMain, dialog, BrowserWindow } from 'electron'
import { z } from 'zod'
import { libraryService } from '../services/library.service'
import { getAllLibraries, getLibrarySources, getLibrary, setConversationLibraryId, getConversationLibraryId } from '../db/queries/libraries'

// ── Zod Schemas ───────────────────────────────────────

const libraryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional(),
  projectId: z.string().optional(),
  embeddingModel: z.enum(['local', 'google']).optional()
})

const libraryUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional()
})

const addSourcesSchema = z.object({
  libraryId: z.string().min(1),
  filePaths: z.array(z.string().min(1).max(1000)).min(1).max(20)
})

const librarySearchSchema = z.object({
  libraryId: z.string().min(1),
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(20).default(5)
})

const attachSchema = z.object({
  conversationId: z.string().min(1),
  libraryId: z.string().min(1)
})

const detachSchema = z.object({
  conversationId: z.string().min(1)
})

// ── Supported file extensions for dialog filter ───────

const SUPPORTED_FILTERS = [
  { name: 'Documents', extensions: ['txt', 'md', 'pdf', 'docx', 'csv'] },
  { name: 'Code', extensions: ['ts', 'js', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'rb', 'php', 'swift', 'kt', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sql', 'sh'] },
  { name: 'Tous les fichiers', extensions: ['*'] }
]

// ── Registration ──────────────────────────────────────

export function registerLibraryIpc(): void {
  // ── CRUD Referentiels ─────────────────────────

  ipcMain.handle('library:list', async () => {
    return getAllLibraries()
  })

  ipcMain.handle('library:get', async (_, payload) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(payload)
    return getLibrary(id)
  })

  ipcMain.handle('library:create', async (_, payload) => {
    const data = libraryCreateSchema.parse(payload)
    return libraryService.create(data)
  })

  ipcMain.handle('library:update', async (_, payload) => {
    const { id, ...data } = libraryUpdateSchema.parse(payload)
    return libraryService.update(id, data)
  })

  ipcMain.handle('library:delete', async (_, payload) => {
    const { id } = z.object({ id: z.string().min(1) }).parse(payload)
    await libraryService.delete(id)
  })

  // ── Sources dans un referentiel ───────────────

  ipcMain.handle('library:add-sources', async (event, payload) => {
    const { libraryId, filePaths } = addSourcesSchema.parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    await libraryService.addSources(libraryId, filePaths, win)
    return getLibrarySources(libraryId)
  })

  ipcMain.handle('library:remove-source', async (_, payload) => {
    const { libraryId, sourceId } = z.object({
      libraryId: z.string().min(1),
      sourceId: z.string().min(1)
    }).parse(payload)
    await libraryService.removeSource(libraryId, sourceId)
  })

  ipcMain.handle('library:get-sources', async (_, payload) => {
    const { libraryId } = z.object({ libraryId: z.string().min(1) }).parse(payload)
    return getLibrarySources(libraryId)
  })

  ipcMain.handle('library:reindex-source', async (event, payload) => {
    const { libraryId, sourceId } = z.object({
      libraryId: z.string().min(1),
      sourceId: z.string().min(1)
    }).parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    await libraryService.reindexSource(libraryId, sourceId, win)
  })

  ipcMain.handle('library:reindex-all', async (event, payload) => {
    const { libraryId } = z.object({ libraryId: z.string().min(1) }).parse(payload)
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    await libraryService.reindexAll(libraryId, win)
  })

  // ── Recherche / Stats ─────────────────────────

  ipcMain.handle('library:search', async (_, payload) => {
    const { libraryId, query, topK } = librarySearchSchema.parse(payload)
    return libraryService.query(libraryId, query, { topK })
  })

  ipcMain.handle('library:stats', async (_, payload) => {
    const { libraryId } = z.object({ libraryId: z.string().min(1) }).parse(payload)
    const lib = getLibrary(libraryId)
    if (!lib) return null
    const qdrantStats = await libraryService.getStats(libraryId)
    return {
      ...lib,
      qdrantPoints: qdrantStats.totalPoints,
      collectionSizeMB: qdrantStats.collectionSizeMB
    }
  })

  // ── Dialog de selection fichiers ──────────────

  ipcMain.handle('library:pick-files', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Ajouter des sources au referentiel',
      properties: ['openFile', 'multiSelections'],
      filters: SUPPORTED_FILTERS
    })
    return result.canceled ? [] : result.filePaths
  })

  // ── Attach / Detach (sticky) ──────────────────

  ipcMain.handle('library:attach', async (_, payload) => {
    const { conversationId, libraryId } = attachSchema.parse(payload)
    setConversationLibraryId(conversationId, libraryId)
  })

  ipcMain.handle('library:detach', async (_, payload) => {
    const { conversationId } = detachSchema.parse(payload)
    setConversationLibraryId(conversationId, null)
  })

  ipcMain.handle('library:get-attached', async (_, payload) => {
    const { conversationId } = detachSchema.parse(payload)
    return getConversationLibraryId(conversationId)
  })

  console.log('[IPC] Library handlers registered')
}
