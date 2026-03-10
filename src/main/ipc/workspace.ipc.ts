import { ipcMain, dialog, BrowserWindow } from 'electron'
import { z } from 'zod'
import { WorkspaceService } from '../services/workspace.service'
import { FileWatcherService } from '../services/file-watcher.service'

// ── Module-level state ────────────────────────────────────
let activeWorkspace: WorkspaceService | null = null
let activeWatcher: FileWatcherService | null = null

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

    // Close previous workspace if any
    if (activeWatcher) {
      await activeWatcher.stop()
      activeWatcher = null
    }

    activeWorkspace = new WorkspaceService(rootPath)

    // Start file watcher
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      activeWatcher = new FileWatcherService(
        rootPath,
        ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache'],
        FileWatcherService.forwardToWindow(win)
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
