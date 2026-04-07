import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { checkForUpdates } from './services/updater.service'

/**
 * Available menu actions sent from the main process to the renderer
 * via the `menu:action` IPC channel. The renderer routes each action
 * to its existing handler (createConversation, openCustomize, backup,
 * import/export bulk, etc.) — see App.tsx::useEffect[onMenuAction].
 *
 * Keeping a single channel + a discriminated string keeps the preload
 * surface minimal (one on/off pair instead of one per action) and
 * lets us add new menu items without touching the snapshot allowlist.
 *
 * MIRROR: this union must stay in sync with `MenuAction` in
 * src/preload/types.ts (the renderer-side type). If you add an action,
 * update both files — TS will catch a mismatch as soon as App.tsx
 * tries to handle the new value.
 */
export type MenuAction =
  | 'customize'
  | 'settings'
  | 'new-conversation'
  | 'backup-now'
  | 'import-bulk'
  | 'export-bulk'

/**
 * Resolves the window that should receive a menu action.
 * Prefers the focused window, falls back to the first one. On macOS the
 * app can stay alive with no windows; in that rare case the action is
 * dropped silently (the user can re-open via the Dock).
 */
function targetWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function send(action: MenuAction): void {
  const win = targetWindow()
  if (!win) return
  win.webContents.send('menu:action', action)
}

/**
 * Builds the application menu template. Customises only the macOS app
 * menu (`Cruchot`) and the `Fichier` menu — Édition / Affichage /
 * Fenêtre / Aide use Electron's built-in roles which are localised
 * automatically by macOS.
 */
export function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'
  const appName = app.getName() // 'Cruchot' (from electron-builder.yml productName)

  const template: MenuItemConstructorOptions[] = []

  // ── App menu (macOS only) ─────────────────────────────
  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about', label: `À propos de ${appName}` },
        { type: 'separator' },
        {
          label: 'Paramètres…',
          accelerator: 'Cmd+,',
          click: () => send('settings')
        },
        {
          label: 'Personnaliser…',
          accelerator: 'Cmd+U',
          click: () => send('customize')
        },
        { type: 'separator' },
        {
          label: 'Rechercher des mises à jour…',
          click: () => checkForUpdates()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Masquer ${appName}` },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Tout afficher' },
        { type: 'separator' },
        { role: 'quit', label: `Quitter ${appName}` }
      ]
    })
  }

  // ── Fichier ───────────────────────────────────────────
  template.push({
    label: 'Fichier',
    submenu: [
      {
        label: 'Nouvelle conversation',
        accelerator: 'CmdOrCtrl+N',
        click: () => send('new-conversation')
      },
      { type: 'separator' },
      {
        label: 'Sauvegarder',
        click: () => send('backup-now')
      },
      { type: 'separator' },
      {
        label: 'Importer (.mlx)…',
        click: () => send('import-bulk')
      },
      {
        label: 'Exporter toutes les données…',
        click: () => send('export-bulk')
      },
      ...(isMac
        ? []
        : [
            { type: 'separator' as const },
            { role: 'quit' as const, label: 'Quitter' }
          ])
    ]
  })

  // ── Édition ───────────────────────────────────────────
  template.push({
    label: 'Édition',
    submenu: [
      { role: 'undo', label: 'Annuler' },
      { role: 'redo', label: 'Rétablir' },
      { type: 'separator' },
      { role: 'cut', label: 'Couper' },
      { role: 'copy', label: 'Copier' },
      { role: 'paste', label: 'Coller' },
      { role: 'pasteAndMatchStyle', label: 'Coller et adapter le style' },
      { role: 'delete', label: 'Supprimer' },
      { role: 'selectAll', label: 'Tout sélectionner' }
    ]
  })

  // ── Affichage ─────────────────────────────────────────
  template.push({
    label: 'Affichage',
    submenu: [
      { role: 'reload', label: 'Recharger' },
      { role: 'forceReload', label: 'Forcer le rechargement' },
      { role: 'toggleDevTools', label: 'Outils de développement' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' },
      { role: 'zoomIn', label: 'Augmenter le zoom' },
      { role: 'zoomOut', label: 'Réduire le zoom' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Plein écran' }
    ]
  })

  // ── Fenêtre ───────────────────────────────────────────
  template.push({
    label: 'Fenêtre',
    submenu: [
      { role: 'minimize', label: 'Réduire' },
      { role: 'zoom', label: 'Zoom' },
      ...(isMac
        ? ([
            { type: 'separator' },
            { role: 'front', label: 'Tout ramener au premier plan' }
          ] as MenuItemConstructorOptions[])
        : ([{ role: 'close', label: 'Fermer' }] as MenuItemConstructorOptions[]))
    ]
  })

  // ── Aide ──────────────────────────────────────────────
  template.push({
    role: 'help',
    label: 'Aide',
    submenu: [
      {
        label: 'Documentation Cruchot',
        click: () => {
          shell.openExternal('https://github.com/eRom/cruchot')
        }
      },
      {
        label: 'Signaler un problème',
        click: () => {
          shell.openExternal('https://github.com/eRom/cruchot/issues/new')
        }
      },
      { type: 'separator' },
      {
        label: 'Mentions légales',
        click: () => {
          shell.openExternal('https://cruchot.romain-ecarnot.com/mentions-legales.html')
        }
      },
      {
        label: 'Politique de confidentialité',
        click: () => {
          shell.openExternal('https://cruchot.romain-ecarnot.com/confidentialite.html')
        }
      },
      {
        label: 'Conditions d\'utilisation',
        click: () => {
          shell.openExternal('https://cruchot.romain-ecarnot.com/conditions.html')
        }
      },


    ]
  })

  return Menu.buildFromTemplate(template)
}
