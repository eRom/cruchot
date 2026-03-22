import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'

// Trusted domains that can be opened without confirmation
const TRUSTED_DOMAINS = new Set([
  'github.com',
  'npmjs.com',
  'www.npmjs.com',
  'nodejs.org',
  'developer.mozilla.org',
  'stackoverflow.com',
  'docs.anthropic.com',
  'platform.openai.com',
  'ai.google.dev',
  'docs.mistral.ai',
  'console.x.ai'
])

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: !app.isPackaged
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Prevent external URLs from opening in the app — confirm untrusted domains
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { action: 'deny' }
      }

      if (TRUSTED_DOMAINS.has(parsed.hostname)) {
        // Reconstruct URL from parsed components to prevent URL manipulation
        const safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
        shell.openExternal(safeUrl)
      } else {
        // Ask confirmation for untrusted domains
        dialog.showMessageBox(win, {
          type: 'question',
          buttons: ['Ouvrir', 'Annuler'],
          defaultId: 1,
          cancelId: 1,
          title: 'Ouvrir un lien externe',
          message: `Ouvrir ce lien dans le navigateur ?`,
          detail: url
        }).then(({ response }) => {
          if (response === 0) shell.openExternal(url)
        })
      }
    } catch {
      // Invalid URL — deny
    }
    return { action: 'deny' }
  })

  // Prevent navigation away from the app (XSS → full renderer takeover)
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'] ?? ''
    const isLocal = url.startsWith('file://') || (devUrl && url.startsWith(devUrl))
    if (!isLocal) {
      event.preventDefault()
      console.warn('[Security] Blocked navigation to:', url)
    }
  })

  // Load renderer
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
