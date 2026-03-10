import type { FSWatcher } from 'chokidar'
import type { BrowserWindow } from 'electron'

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export class FileWatcherService {
  private watcher: FSWatcher | null = null
  private rootPath: string
  private ignorePatterns: string[]
  private onChange: (event: FileChangeEvent) => void

  constructor(
    rootPath: string,
    ignorePatterns: string[],
    onChange: (event: FileChangeEvent) => void
  ) {
    this.rootPath = rootPath
    this.ignorePatterns = ignorePatterns
    this.onChange = onChange
  }

  async start(): Promise<void> {
    // Dynamic import — chokidar is an ESM-only package in v4
    const chokidar = await import('chokidar')

    this.watcher = chokidar.watch(this.rootPath, {
      ignoreInitial: true,
      ignored: this.ignorePatterns.map(p => `**/${p}/**`),
      awaitWriteFinish: { stabilityThreshold: 300 },
      depth: 20
    })

    const events: Array<FileChangeEvent['type']> = ['add', 'change', 'unlink', 'addDir', 'unlinkDir']
    for (const eventType of events) {
      this.watcher.on(eventType, (filePath: string) => {
        // Convert to relative path
        const relative = filePath.startsWith(this.rootPath)
          ? filePath.slice(this.rootPath.length + 1)
          : filePath
        this.onChange({ type: eventType, path: relative })
      })
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  static forwardToWindow(win: BrowserWindow): (event: FileChangeEvent) => void {
    return (event: FileChangeEvent) => {
      if (!win.isDestroyed()) {
        win.webContents.send('workspace:fileChanged', event)
      }
    }
  }
}
