import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { WorkspaceService } from '../services/workspace.service'
import { FileWatcherService } from '../services/file-watcher.service'


// System paths that are ALWAYS blocked as workspace root (no override)
const HARD_BLOCKED_ROOTS = [
  '/', '/etc', '/usr', '/System', '/Library', '/var', '/bin', '/sbin', '/tmp',
  '/private', '/private/etc', '/private/var', '/private/tmp',
  '/opt', '/cores', '/dev', '/proc', '/sys'
]

// Sensitive paths that trigger an approval dialog (user can override)
const SENSITIVE_ROOTS = [
  '/Applications', '/Volumes', '/Users'
]

// ── Module-level state ────────────────────────────────────
let activeWorkspace: WorkspaceService | null = null
let activeWatcher: FileWatcherService | null = null

// Paths approved by the user during this session (persists until app restart)
const approvedSensitivePaths = new Set<string>()

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

    // Hard block: system paths that should NEVER be used as workspace
    if (HARD_BLOCKED_ROOTS.some(r => resolvedRoot === r || resolvedRoot.startsWith(r + path.sep))) {
      throw new Error(`Repertoire systeme refuse comme workspace : ${resolvedRoot}`)
    }

    // Soft block: sensitive paths require user approval via native dialog (once per path)
    const sensitiveMatch = SENSITIVE_ROOTS.find(r => resolvedRoot === r || resolvedRoot.startsWith(r + path.sep))
    if (sensitiveMatch && !approvedSensitivePaths.has(resolvedRoot)) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win) {
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Autoriser', 'Annuler'],
          defaultId: 1,
          cancelId: 1,
          title: 'Chemin sensible',
          message: `Le chemin "${resolvedRoot}" se trouve dans une zone sensible (${sensitiveMatch}).`,
          detail: 'Ouvrir ce repertoire comme workspace donne au LLM un acces en lecture/ecriture aux fichiers qu\'il contient.\n\nVoulez-vous continuer ?'
        })
        if (response !== 0) {
          throw new Error(`Acces au repertoire refuse par l'utilisateur : ${resolvedRoot}`)
        }
        approvedSensitivePaths.add(resolvedRoot)
      }
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

    activeWorkspace = new WorkspaceService(resolvedRoot)

    // Start file watcher
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const forwardToRenderer = FileWatcherService.forwardToWindow(win)
      activeWatcher = new FileWatcherService(
        rootPath,
        ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache'],
        (event) => {
          forwardToRenderer(event)
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
  })

  // ── Get file tree ──────────────────────────────────────
  ipcMain.handle('workspace:getTree', async (_event, relativePath?: unknown) => {
    if (!activeWorkspace) throw new Error('No workspace open')

    if (relativePath !== undefined && relativePath !== null) {
      const parsed = z.string().max(1000).safeParse(relativePath)
      if (!parsed.success) throw new Error('Invalid path')
      return activeWorkspace.scanDirectory(parsed.data)
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
      content: z.string().max(5_000_000)
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

  // ── Open workspace folder in OS file manager ──────────
  ipcMain.handle('workspace:openInFinder', async (_event, folderPath: unknown) => {
    const parsed = z.string().min(1).safeParse(folderPath)
    if (!parsed.success) throw new Error('Invalid folder path')
    const resolved = parsed.data.startsWith('~/')
      ? path.join(os.homedir(), parsed.data.slice(2))
      : path.resolve(parsed.data)
    await shell.openPath(resolved)
  })

  // ── Get workspace info ─────────────────────────────────
  ipcMain.handle('workspace:getInfo', async () => {
    if (!activeWorkspace) return null
    return activeWorkspace.getWorkspaceInfo()
  })
}
