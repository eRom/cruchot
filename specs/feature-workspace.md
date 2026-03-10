# Plan : Feature "Co-Work" — Workspace dans Multi-LLM Desktop

## Contexte

L'app Multi-LLM Desktop est un chat multi-provider (Electron + React + AI SDK 6). On ajoute un **workspace** (repertoire de travail) pour rendre le chat context-aware : le LLM peut lire les fichiers du projet, et proposer des modifications (create/modify/delete) que l'utilisateur valide.

### Decisions d'architecture

- **Layout** : Panneau workspace a **droite** du chat, toggleable (Cmd+B)
- **Scope** : Workspace **lie au Projet** (`workspacePath` sur la table `projects`)
- **Editeur** : Apercu **lecture seule** (Shiki) — pas d'editeur de code en Phase 1
- **File operations** : **Essentiel** des la Phase 1 — le LLM propose, l'utilisateur approuve/rejette
- **Dependance** : `chokidar` (file watcher) a installer

---

## Phase 1 : Backend Foundation

### 1.1 Installer chokidar

```bash
npm install chokidar
```

Ajouter `chokidar` a `external` dans `electron.vite.config.ts` (section main, comme `better-sqlite3`).

**Fichier** : `package.json`, `electron.vite.config.ts`

### 1.2 Migration DB — `workspacePath` sur `projects`

**Fichier** : `src/main/db/schema.ts` (ligne 42, apres `color`)

```typescript
workspacePath: text('workspace_path'),
```

**Fichier** : `src/main/db/migrate.ts` (apres les roleMigrations, ~ligne 151)

```typescript
const projectMigrations = [
  'ALTER TABLE projects ADD COLUMN workspace_path TEXT'
]
for (const sql of projectMigrations) {
  try { sqlite.exec(sql) } catch { /* Column already exists */ }
}
```

### 1.3 Mettre a jour les queries projets

**Fichier** : `src/main/db/queries/projects.ts`

- `createProject()` : accepter `workspacePath` dans le payload
- `updateProject()` : accepter `workspacePath` dans le payload

### 1.4 Service : `workspace.service.ts` (NOUVEAU)

**Fichier** : `src/main/services/workspace.service.ts`

Classe `WorkspaceService` — coeur de la logique workspace :

```
WorkspaceService
  constructor(rootPath: string)

  // Securite
  validatePath(relativePath: string): string    // retourne chemin absolu, throw si path traversal
  isIgnored(relativePath: string): boolean
  isSensitive(relativePath: string): boolean    // .env, *.key, *.pem, etc.

  // Arbre de fichiers
  scanTree(maxDepth?: number): FileNode         // recursif, respecte ignore
  scanDirectory(relativePath: string): FileNode[] // un seul niveau

  // Operations fichier
  readFile(relativePath: string): FileContent   // max 10MB, detect binaire
  writeFile(relativePath: string, content: string): void  // cree les dossiers parents
  deleteFile(relativePath: string): void        // utilise trash (pas rm)

  // Metadata
  getWorkspaceInfo(): WorkspaceInfo

  // Ignore patterns
  loadIgnorePatterns(): void                    // .coworkignore + defaults
```

**Securite critique** :
- `path.resolve(rootPath, relativePath)` → verifier `.startsWith(rootPath)` (anti path traversal)
- Fichiers sensibles (`.env`, `*.key`, `*.pem`, `credentials.json`) → bloques meme si pas dans .coworkignore
- Limite 10MB par fichier lu
- Detection binaire (null bytes dans les 512 premiers octets)

**Default ignore** : `node_modules`, `.git`, `.DS_Store`, `dist`, `build`, `.next`, `__pycache__`, `*.lock`, `*.sqlite*`

### 1.5 Service : `file-watcher.service.ts` (NOUVEAU)

**Fichier** : `src/main/services/file-watcher.service.ts`

```
FileWatcherService
  constructor(rootPath: string, ignorePatterns: string[], onChange: (event) => void)
  start(): void                  // demarre chokidar
  stop(): void                   // arrete chokidar
```

Chokidar config : `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 300 }`, `depth: 20`.
Forward les events au renderer via `win.webContents.send('workspace:fileChanged', event)`.

### 1.6 Handler IPC : `workspace.ipc.ts` (NOUVEAU)

**Fichier** : `src/main/ipc/workspace.ipc.ts`

Variables module-level :
```typescript
let activeWorkspace: WorkspaceService | null = null
let activeWatcher: FileWatcherService | null = null
```

8 handlers :

| Handler | Description |
|---------|-------------|
| `workspace:selectFolder` | `dialog.showOpenDialog({ properties: ['openDirectory'] })` |
| `workspace:open` | Payload `{ rootPath, projectId? }` → cree WorkspaceService + FileWatcher |
| `workspace:close` | Stoppe le watcher, met a null |
| `workspace:getTree` | Retourne `scanTree()` ou `scanDirectory(path)` |
| `workspace:readFile` | Retourne le contenu du fichier (Zod: path string min 1) |
| `workspace:writeFile` | Ecrit un fichier (Zod: path + content) — utilise pour les file ops approuvees |
| `workspace:deleteFile` | Supprime via `trash` (Zod: path string min 1) |
| `workspace:getInfo` | Retourne metadata workspace |

### 1.7 Enregistrer dans le registre IPC

**Fichier** : `src/main/ipc/index.ts`

```typescript
import { registerWorkspaceIpc } from './workspace.ipc'
// Dans registerAllIpcHandlers() :
registerWorkspaceIpc()
```

### 1.8 Bridge Preload

**Fichier** : `src/preload/index.ts` — ajouter ~10 methodes workspace

```typescript
// Workspace
workspaceSelectFolder: () => ipcRenderer.invoke('workspace:selectFolder'),
workspaceOpen: (data: { rootPath: string; projectId?: string }) => ipcRenderer.invoke('workspace:open', data),
workspaceClose: () => ipcRenderer.invoke('workspace:close'),
workspaceGetTree: (relativePath?: string) => ipcRenderer.invoke('workspace:getTree', relativePath),
workspaceReadFile: (path: string) => ipcRenderer.invoke('workspace:readFile', path),
workspaceWriteFile: (data: { path: string; content: string }) => ipcRenderer.invoke('workspace:writeFile', data),
workspaceDeleteFile: (path: string) => ipcRenderer.invoke('workspace:deleteFile', path),
workspaceGetInfo: () => ipcRenderer.invoke('workspace:getInfo'),
onWorkspaceFileChanged: (cb: (event: FileChangeEvent) => void) => {
  ipcRenderer.on('workspace:fileChanged', (_, event) => cb(event))
},
offWorkspaceFileChanged: () => {
  ipcRenderer.removeAllListeners('workspace:fileChanged')
},
```

### 1.9 Types Preload

**Fichier** : `src/preload/types.ts`

Nouveaux types :

```typescript
export interface FileNode {
  name: string
  path: string              // relatif au workspace root
  type: 'file' | 'directory'
  size?: number
  extension?: string
  children?: FileNode[]
}

export interface WorkspaceInfo {
  rootPath: string
  name: string
  fileCount: number
  totalSize: number
}

export interface FileContent {
  path: string
  content: string
  language: string
  size: number
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export type FileOperationType = 'create' | 'modify' | 'delete'

export interface FileOperation {
  id: string
  type: FileOperationType
  path: string
  content?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface WorkspaceFileContext {
  path: string
  content: string
  language: string
}
```

Ajouter `workspacePath` a `ProjectInfo` (ligne 88) :
```typescript
workspacePath?: string | null
```

Ajouter `fileContexts` a `SendMessagePayload` (ligne 15) :
```typescript
fileContexts?: WorkspaceFileContext[]
```

Etendre `ElectronAPI` avec les 10 methodes workspace.

---

## Phase 2 : Integration Chat — Contexte fichier + File Operations

### 2.1 Parser de file operations (NOUVEAU)

**Fichier** : `src/main/llm/file-operations.ts`

Le LLM utilise un format structure dans ses reponses :

````
```file:create:src/utils/helper.ts
export function helper() { ... }
```

```file:modify:src/config.ts
// contenu modifie complet
```

```file:delete:src/old-file.ts
```
````

```typescript
import { nanoid } from 'nanoid'

export interface ParsedFileOperation {
  id: string
  type: 'create' | 'modify' | 'delete'
  path: string
  content?: string
}

export function parseFileOperations(text: string): ParsedFileOperation[] {
  const regex = /```file:(create|modify|delete):([^\n]+)\n([\s\S]*?)```/g
  const operations: ParsedFileOperation[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    operations.push({
      id: nanoid(),
      type: match[1] as 'create' | 'modify' | 'delete',
      path: match[2].trim(),
      content: match[1] !== 'delete' ? match[3] : undefined
    })
  }
  return operations
}
```

### 2.2 Modifier `chat.ipc.ts` — Injection contexte fichier

**Fichier** : `src/main/ipc/chat.ipc.ts`

**a)** Etendre le schema Zod (ligne 11-22) :

```typescript
fileContexts: z.array(z.object({
  path: z.string(),
  content: z.string(),
  language: z.string()
})).optional()
```

**b)** Apres la construction de `aiMessages` (ligne 91), injecter le contexte fichier dans le system prompt :

```typescript
// Augment system prompt with file context
if (fileContexts && fileContexts.length > 0) {
  const fileBlock = fileContexts.map(f =>
    `<file path="${f.path}" language="${f.language}">\n${f.content}\n</file>`
  ).join('\n\n')

  const workspaceInstruction = `\n\n<workspace-files>\n${fileBlock}\n</workspace-files>\n\nQuand tu proposes des modifications de fichiers, utilise ce format :\n\`\`\`file:create:chemin/fichier.ext\ncontenu\n\`\`\`\n\`\`\`file:modify:chemin/fichier.ext\ncontenu complet modifie\n\`\`\`\n\`\`\`file:delete:chemin/fichier.ext\n\`\`\``

  // Inject into existing system prompt or create one
  if (aiMessages.length > 0 && aiMessages[0].role === 'system') {
    aiMessages[0].content += workspaceInstruction
  } else {
    aiMessages.unshift({ role: 'system', content: workspaceInstruction })
  }
}
```

**c)** Apres `fullText = await result.text` (ligne 128-133), parser les file operations :

```typescript
import { parseFileOperations } from '../llm/file-operations'

// Parse file operations from assistant response
const fileOps = parseFileOperations(fullText)

// Build contentData
const contentData: Record<string, unknown> = {}
if (accumulatedReasoning) contentData.reasoning = accumulatedReasoning
if (fileOps.length > 0) contentData.fileOperations = fileOps
```

Remplacer le `contentData` existant (ligne 151-153) par ce nouveau.

---

## Phase 3 : UI — Store Workspace + Panneau fichier

### 3.1 Store Zustand : `workspace.store.ts` (NOUVEAU)

**Fichier** : `src/renderer/src/stores/workspace.store.ts`

```
State :
  rootPath: string | null
  tree: FileNode | null
  selectedFilePath: string | null
  filePreview: FileContent | null
  isPanelOpen: boolean
  isLoading: boolean
  attachedFiles: string[]          // chemins relatifs des fichiers attaches au message courant

Actions :
  openWorkspace(rootPath, projectId?) → appelle window.api.workspaceOpen()
  closeWorkspace() → appelle window.api.workspaceClose()
  refreshTree() → appelle window.api.workspaceGetTree()
  selectFile(path) → appelle window.api.workspaceReadFile(), set filePreview
  clearFilePreview()
  togglePanel()
  attachFile(path)                 // ajoute a attachedFiles + charge le contenu
  detachFile(path)                 // retire de attachedFiles
  clearAttachedFiles()
  getAttachedFileContexts() → WorkspaceFileContext[]
```

### 3.2 Composant : `FileTree.tsx` (NOUVEAU)

**Fichier** : `src/renderer/src/components/workspace/FileTree.tsx`

- Arbre recursif avec expand/collapse (click sur dossier)
- Icones Lucide : `File`, `Folder`, `FolderOpen`, + icones par extension
- Click fichier → selectFile() → preview dans FilePanel
- Menu contextuel (clic droit) : "Attacher au chat", "Copier le chemin"
- Input de recherche/filtre en haut
- Indent via `paddingLeft: depth * 16px`

### 3.3 Composant : `FilePanel.tsx` (NOUVEAU)

**Fichier** : `src/renderer/src/components/workspace/FilePanel.tsx`

- Breadcrumb chemin en haut
- Contenu fichier avec coloration syntaxique Shiki (reutiliser le meme Shiki que `MarkdownRenderer.tsx`)
- Footer : taille, langage
- Bouton "Attacher au chat"

### 3.4 Composant : `WorkspacePanel.tsx` (NOUVEAU)

**Fichier** : `src/renderer/src/components/workspace/WorkspacePanel.tsx`

Conteneur qui wrap FileTree + FilePanel :

```
+-----------------------------+
| Workspace: mon-projet  [x]  |  <- header (nom + bouton fermer)
+-----------------------------+
| [Rechercher...]             |  <- input filtre
+-----------------------------+
| > src/                      |
|   > components/             |  <- FileTree (flex-1, scroll)
|     - App.tsx               |
|   - index.ts                |
+-----------------------------+
| FilePanel (si fichier actif) |  <- preview coloration syntaxique
| [Attacher au chat]          |
+-----------------------------+
```

Largeur : ~320px, resizable via drag handle.
Split vertical : FileTree en haut (50%), FilePanel en bas (50%).

### 3.5 Modifier `ChatView.tsx` — Layout avec panneau

**Fichier** : `src/renderer/src/components/chat/ChatView.tsx`

Le layout passe de :

```
<div>
  <MessageList />
  <InputZone />
</div>
```

A :

```
<div className="flex h-full">
  <div className="flex-1 flex flex-col">
    <MessageList />
    <InputZone />
  </div>
  {isPanelOpen && <WorkspacePanel />}
</div>
```

Le panneau s'ouvre automatiquement quand on switch vers un projet avec `workspacePath`.

### 3.6 Modifier `ProjectForm.tsx` — Champ workspace

**Fichier** : `src/renderer/src/components/projects/ProjectForm.tsx`

Ajouter un champ "Dossier workspace" :
- Input readonly + bouton "Parcourir" → `window.api.workspaceSelectFolder()`
- Bouton clear (X) pour retirer le chemin
- Description : "Associez un dossier pour que le LLM puisse lire et modifier vos fichiers."

### 3.7 Auto-ouverture du workspace au switch de projet

**Fichier** : `src/renderer/src/components/chat/ChatView.tsx`

Dans le useEffect qui restaure le modele au switch de conversation :
- Si le projet actif a un `workspacePath`, appeler `workspaceStore.openWorkspace(path, projectId)`
- Si le projet n'a pas de workspace, appeler `workspaceStore.closeWorkspace()`

---

## Phase 4 : UI Chat — Attachements + File Operations

### 4.1 Composant : `FileReference.tsx` (NOUVEAU)

**Fichier** : `src/renderer/src/components/workspace/FileReference.tsx`

Chip compact affiche au-dessus de la textarea dans InputZone :

```
[icon] filename.ts  [x]
```

Style : `bg-cyan-500/10 text-cyan-700 dark:text-cyan-400`, icone Lucide `FileCode`, bouton X pour retirer.

### 4.2 Composant : `FileOperationCard.tsx` (NOUVEAU)

**Fichier** : `src/renderer/src/components/workspace/FileOperationCard.tsx`

Carte dans le MessageItem pour chaque operation fichier proposee par le LLM :

```
+---------------------------------------------+
| [CREATE] src/utils/helper.ts    [Rejeter] [Appliquer] |
| > Voir le contenu                            |
| +-------------------------------------------+ |
| | export function helper() { ... }           | |
| +-------------------------------------------+ |
+---------------------------------------------+
```

- Badge couleur par type : vert (create), jaune (modify), rouge (delete)
- Contenu collapsible (ferme par defaut pour les gros fichiers)
- Coloration syntaxique (detecter le langage depuis l'extension)
- Boutons Appliquer / Rejeter (seulement si status = pending)
- Indicateur de statut : check vert (approved), X rouge (rejected)

### 4.3 Modifier `InputZone.tsx` — Bouton attachement

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx`

- Importer `useWorkspaceStore`
- Ajouter un bouton Paperclip (Lucide `Paperclip`) dans la barre d'outils, visible uniquement si un workspace est actif
- Clic → ouvre un mini-select avec les fichiers du workspace (ou ouvre le panneau)
- Zone au-dessus de la textarea : chips `FileReference` pour les fichiers attaches
- Dans `handleSendText()` : ajouter `fileContexts` au payload si des fichiers sont attaches
- Apres envoi : `workspaceStore.clearAttachedFiles()`

### 4.4 Modifier `MessageItem.tsx` — Rendu file operations

**Fichier** : `src/renderer/src/components/chat/MessageItem.tsx`

- Verifier `message.contentData?.fileOperations`
- Si present, rendre un `FileOperationCard` pour chaque operation
- Callbacks approve/reject :
  - Approve → `window.api.workspaceWriteFile({ path, content })` ou `window.api.workspaceDeleteFile(path)`
  - Puis mettre a jour le status dans le message (via messages store ou contentData)
- Les cartes s'affichent entre le contenu markdown et le footer

### 4.5 Modifier `useStreaming.ts` — Forward file operations

**Fichier** : `src/renderer/src/hooks/useStreaming.ts`

Dans le handler `finish`, copier `fileOperations` depuis le chunk dans le message store.

---

## Phase 5 : Polish

### 5.1 File watcher sync

- Hook `useWorkspaceWatcher` dans `ChatView` : ecoute `onWorkspaceFileChanged`, appelle `refreshTree()` avec debounce (300ms)
- Cleanup dans le return du useEffect

### 5.2 Raccourci clavier `Cmd+B`

**Fichier** : `src/renderer/src/hooks/useKeyboardShortcuts.ts`

Ajouter `Cmd+B` → `workspaceStore.togglePanel()`

### 5.3 CommandPalette

**Fichier** : `src/renderer/src/components/common/CommandPalette.tsx`

Ajouter action "Ouvrir/Fermer workspace" (visible si un projet avec workspace est actif).

### 5.4 Sidebar indicator

**Fichier** : `src/renderer/src/components/layout/Sidebar.tsx`

Petit badge vert sur le ProjectSelector quand un workspace est actif.

### 5.5 .coworkignore

Fichier optionnel dans le workspace root. Syntaxe gitignore-like (lignes, commentaires #).
Lu par `WorkspaceService.loadIgnorePatterns()` au `workspace:open`.

### 5.6 Drag-and-drop

Drag un fichier du FileTree vers l'InputZone → l'attache au message.

---

## Fichiers a creer

| # | Fichier | Description |
|---|---------|-------------|
| 1 | `src/main/services/workspace.service.ts` | Gestion workspace : arbre, lecture, ecriture, securite, ignore |
| 2 | `src/main/services/file-watcher.service.ts` | Wrapper chokidar pour watch temps reel |
| 3 | `src/main/ipc/workspace.ipc.ts` | 8 handlers IPC workspace |
| 4 | `src/main/llm/file-operations.ts` | Parser `file:create/modify/delete` dans les reponses LLM |
| 5 | `src/renderer/src/stores/workspace.store.ts` | Store Zustand workspace |
| 6 | `src/renderer/src/components/workspace/FileTree.tsx` | Arbre de fichiers recursif |
| 7 | `src/renderer/src/components/workspace/FilePanel.tsx` | Preview fichier lecture seule |
| 8 | `src/renderer/src/components/workspace/WorkspacePanel.tsx` | Conteneur panneau workspace |
| 9 | `src/renderer/src/components/workspace/FileReference.tsx` | Chip fichier attache |
| 10 | `src/renderer/src/components/workspace/FileOperationCard.tsx` | Carte approve/reject operation |

## Fichiers a modifier

| # | Fichier | Changements |
|---|---------|-------------|
| 11 | `package.json` | `npm install chokidar` |
| 12 | `electron.vite.config.ts` | Ajouter `chokidar` dans `external` (main) |
| 13 | `src/main/db/schema.ts` | `workspacePath` sur `projects` |
| 14 | `src/main/db/migrate.ts` | ALTER TABLE projects ADD workspace_path |
| 15 | `src/main/db/queries/projects.ts` | Accepter `workspacePath` dans create/update |
| 16 | `src/main/ipc/index.ts` | Importer + enregistrer `registerWorkspaceIpc()` |
| 17 | `src/main/ipc/chat.ipc.ts` | Schema `fileContexts`, injection system prompt, parse file ops |
| 18 | `src/preload/index.ts` | 10 methodes workspace + 2 listeners |
| 19 | `src/preload/types.ts` | Types FileNode, WorkspaceInfo, FileContent, FileOperation, FileChangeEvent + extensions ElectronAPI + SendMessagePayload + ProjectInfo |
| 20 | `src/renderer/src/components/chat/ChatView.tsx` | Layout flex avec WorkspacePanel conditionnel, auto-open workspace |
| 21 | `src/renderer/src/components/chat/InputZone.tsx` | Bouton Paperclip, FileReference chips, passer fileContexts |
| 22 | `src/renderer/src/components/chat/MessageItem.tsx` | Rendre FileOperationCard si contentData.fileOperations |
| 23 | `src/renderer/src/hooks/useStreaming.ts` | Forward fileOperations dans le message au finish |
| 24 | `src/renderer/src/components/projects/ProjectForm.tsx` | Champ workspace folder picker |
| 25 | `src/renderer/src/hooks/useKeyboardShortcuts.ts` | Cmd+B toggle workspace panel |
| 26 | `src/renderer/src/components/common/CommandPalette.tsx` | Action "Workspace" |
| 27 | `src/renderer/src/components/layout/Sidebar.tsx` | Badge workspace actif |

## Verification

1. **Backend** : Ouvrir un workspace via IPC, scanner l'arbre, lire un fichier, verifier le path traversal
2. **Chat** : Envoyer un message avec des fichiers attaches, verifier que le LLM recoit le contexte
3. **File ops** : Verifier que les blocs `file:create/modify/delete` sont parses et affiches
4. **Approve** : Cliquer "Appliquer" → le fichier est cree/modifie sur disk
5. **Watcher** : Modifier un fichier externement → l'arbre se rafraichit
6. **Securite** : Tenter `../../etc/passwd` → erreur, `.env` → erreur
7. **Build** : `npm run build` passe sans erreur TypeScript
