import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { WorkspaceService } from '../services/workspace.service'
import { FileWatcherService } from '../services/file-watcher.service'
import { onWorkspaceFileChanged, resetGitService } from './git.ipc'

// System paths that should never be used as workspace root
const BLOCKED_ROOTS = [
  '/', '/etc', '/usr', '/System', '/Library', '/var', '/bin', '/sbin', '/tmp',
  '/private', '/private/etc', '/private/var', '/private/tmp',
  '/opt', '/cores', '/dev', '/proc', '/sys',
  // macOS-specific
  '/Applications', '/Volumes',
  // User home root (too broad)
  process.env.HOME ?? '/Users'
]

// ── Module-level state ────────────────────────────────────
let activeWorkspace: WorkspaceService | null = null
let activeWatcher: FileWatcherService | null = null

/**
 * Returns the root path of the currently active workspace, or null.
 * Used by other IPC modules for path validation.
 */
export function getActiveWorkspaceRoot(): string | null {
  return activeWorkspace?.rootPath ?? null
}

/** Getter for other modules (e.g. chat tools) to access the active workspace */
export function getActiveWorkspace(): WorkspaceService | null {
  return activeWorkspace
}

export function registerWorkspaceIpc(): void {
  // ── Select folder (native dialog) ──────────────────────
  ipcMain.handle('workspace:selectFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Choisir un dossier workspace'
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // ── Open workspace ─────────────────────────────────────
  ipcMain.handle('workspace:open', async (event, payload: unknown) => {
    const schema = z.object({
      rootPath: z.string().min(1),
      projectId: z.string().optional()
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid workspace:open payload')

    const { rootPath } = parsed.data
    const resolvedRoot = path.resolve(rootPath)

    // Validate rootPath is a safe directory
    if (BLOCKED_ROOTS.some(r => resolvedRoot === r || resolvedRoot.startsWith(r + path.sep))) {
      throw new Error(`Repertoire systeme refuse comme workspace : ${resolvedRoot}`)
    }
    try {
      const stat = fs.statSync(resolvedRoot)
      if (!stat.isDirectory()) throw new Error(`Le chemin n'est pas un repertoire : ${resolvedRoot}`)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Repertoire introuvable : ${resolvedRoot}`)
      throw e
    }

    // Close previous workspace if any
    if (activeWatcher) {
      await activeWatcher.stop()
      activeWatcher = null
    }

    activeWorkspace = new WorkspaceService(rootPath)

    // Start file watcher
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const forwardToRenderer = FileWatcherService.forwardToWindow(win)
      activeWatcher = new FileWatcherService(
        rootPath,
        ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache'],
        (event) => {
          forwardToRenderer(event)
          // Notify git service of file changes (debounced push to renderer)
          onWorkspaceFileChanged(win)
        }
      )
      await activeWatcher.start()
    }

    return activeWorkspace.getWorkspaceInfo()
  })

  // ── Close workspace ────────────────────────────────────
  ipcMain.handle('workspace:close', async () => {
    if (activeWatcher) {
      await activeWatcher.stop()
      activeWatcher = null
    }
    activeWorkspace = null
    resetGitService()
  })

  // ── Get file tree ──────────────────────────────────────
  ipcMain.handle('workspace:getTree', async (_event, relativePath?: string) => {
    if (!activeWorkspace) throw new Error('No workspace open')

    if (relativePath) {
      return activeWorkspace.scanDirectory(relativePath)
    }
    return activeWorkspace.scanTree()
  })

  // ── Read file ──────────────────────────────────────────
  ipcMain.handle('workspace:readFile', async (_event, filePath: unknown) => {
    if (!activeWorkspace) throw new Error('No workspace open')

    const schema = z.string().min(1)
    const parsed = schema.safeParse(filePath)
    if (!parsed.success) throw new Error('Invalid file path')

    return activeWorkspace.readFile(parsed.data)
  })

  // ── Write file ─────────────────────────────────────────
  ipcMain.handle('workspace:writeFile', async (_event, payload: unknown) => {
    if (!activeWorkspace) throw new Error('No workspace open')

    const schema = z.object({
      path: z.string().min(1),
      content: z.string()
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid writeFile payload')

    activeWorkspace.writeFile(parsed.data.path, parsed.data.content)
  })

  // ── Delete file ────────────────────────────────────────
  ipcMain.handle('workspace:deleteFile', async (_event, filePath: unknown) => {
    if (!activeWorkspace) throw new Error('No workspace open')

    const schema = z.string().min(1)
    const parsed = schema.safeParse(filePath)
    if (!parsed.success) throw new Error('Invalid file path')

    await activeWorkspace.deleteFile(parsed.data)
  })

  // ── Get workspace info ─────────────────────────────────
  ipcMain.handle('workspace:getInfo', async () => {
    if (!activeWorkspace) return null
    return activeWorkspace.getWorkspaceInfo()
  })
}
