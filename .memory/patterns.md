# Patterns — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-09 (session 4)

## Conventions de nommage

- **Fichiers** : kebab-case (`credential.service.ts`, `openai.adapter.ts`)
- **Composants React** : PascalCase (`MessageItem.tsx`, `InputZone.tsx`)
- **Stores Zustand** : `[domaine].store.ts` (ex: `conversations.store.ts`)
- **IPC handlers** : `[domaine].ipc.ts` (ex: `chat.ipc.ts`)
- **DB queries** : `[domaine].ts` dans `db/queries/` (ex: `conversations.ts`)
- **LLM** : Vercel AI SDK (`router.ts`, `providers.ts`, `cost-calculator.ts`, `image.ts`)

## Patterns architecturaux

### IPC Pattern
- Main : `ipcMain.handle('domaine:action', handler)` — request/response
- Main : `webContents.send('domaine:event', data)` — streaming events
- Preload : `contextBridge.exposeInMainWorld('api', { ... })` — bridge type
- Renderer : `window.api.methodName(payload)` — appel type

### LLM — Vercel AI SDK Pattern
- `streamText()` pour le chat streaming
- `experimental_generateImage()` pour la generation d'images (multi-provider)
- `onChunk` callback pour forward IPC — **ATTENTION: `chunk.text` pas `chunk.textDelta`** (AI SDK v6)
- `onFinish` callback pour sauvegarde DB + calcul couts
- `abortSignal` pour annulation
- `providerOptions` pour features specifiques (ex: Anthropic thinking)

### Image Generation Pattern
- Modeles avec `type: 'image'` dans `ModelDefinition` et `registry.ts`
- `image.ts` route selon le modelId : `gemini-*` → Google, `gpt-image-*` → OpenAI
- Google : `providerOptions.google.aspectRatio` (string ratio "1:1")
- OpenAI : `size` param (string pixel "1024x1024") via `aspectRatioToSize()` helper
- `images.ipc.ts` sauvegarde : fichier PNG sur disk + record `images` table + messages user/assistant en DB
- InputZone : `isImageMode = selectedModel?.type === 'image'` → AspectRatioSelector + bouton Generer
- MessageItem : `contentData.type === 'image'` → `<img src="local-image://path">` au lieu de markdown
- TTS (AudioPlayer) masque sur les messages image

### Custom Protocol Pattern (local-image://)
- `protocol.registerSchemesAsPrivileged()` avant `app.whenReady()` dans `index.ts`
- `protocol.handle('local-image', ...)` dans `app.whenReady()` — sert les fichiers via `net.fetch(pathToFileURL(...))`
- Necessaire car `sandbox: true` bloque `file://` dans le renderer
- Utilise dans : ImageGrid, ImageLightbox, MessageItem

### Zustand Store Pattern
- Slices composables, middleware `persist` uniquement pour settings (localStorage)
- Pas d'immer, pas de subscribeWithSelector en pratique
- Pattern courant : `const value = useStore((s) => s.value)` — selecteurs atomiques

### Projet <-> Conversation Pattern
- `defaultModelId` stocke au format `providerId::modelId` (composite string)
- Quand on selectionne un projet : `split('::')` puis `selectModel(providerId, modelId)`
- Quand on cree une conversation : passe le `activeProjectId` courant
- Sidebar filtre conversations par `activeProjectId` (null = boite de reception sans projet)
- Rechargement backend quand le projet change : `getConversations(projectId)`

### Conversation CRUD Pattern (sidebar)
- Rename : inline input dans ConversationItem, Enter/Escape/blur pour valider
- Delete : confirmation inline "Supprimer ? Oui/Non"
- Callbacks remontent : ConversationItem -> ConversationList -> Sidebar -> window.api

### Vue Projets Pattern
- Navigation interne par `subView` state : 'grid' | 'create' | 'edit'
- Formulaire inline (remplace la grille), pas de dialog modal
- Bouton "Retour aux projets" pour revenir a la grille
- Modele par defaut obligatoire (validation `canSave`)

### Vue Prompts Pattern
- Meme pattern que ProjectsView : `subView` state ('grid' | 'create' | 'edit')
- Types : `complet` (prompt autonome) et `complement` (fragment) — pas de `system` (supprime par Romain)
- Filtres : par type (pills), recherche texte, tri (activite/nom/creation)
- Chaque prompt a : title, content, type, category, tags[], variables[]
- Copier le contenu en un clic depuis la carte

### CommandPalette Pattern
- Ouvre via Cmd+K
- Fetch TOUTES les conversations a l'ouverture (`window.api.getConversations()` sans arg)
- Le store `conversations` ne contient que celles du projet actif (filtre sidebar)
- Quand on selectionne une conv d'un autre projet : switch `activeProjectId` + `activeConversationId`
- Les callbacks (onNewConversation, onOpenSettings, etc.) sont passes en props depuis App.tsx

### Model Params Pattern
- temperature, maxTokens, topP sont globaux (pas par modele)
- Persistes dans `settings.store.ts` (Zustand persist → localStorage)
- Configures dans Settings > Modele (presets Creatif/Equilibre/Precis)
- InputZone lit directement depuis le settings store (plus de state local)

### Title Bar Pattern (macOS)
- `titleBarStyle: 'hiddenInset'` dans BrowserWindow
- Zone drag 38px en haut de Sidebar ET AppLayout main
- `[-webkit-app-region:drag]` pour les zones draggables
- Traffic lights positiones a `{ x: 15, y: 10 }`

### Error Classification Pattern
- **Transient** (429, 500, 503) → retry backoff exponentiel + jitter, max 3
- **Fatal** (401, 403) → notification immediate
- **Actionable** (402, deprecie) → notification avec action

### Data Pattern
- Drizzle ORM avec schema-first
- WAL mode + foreign_keys ON
- Stats pre-agregees par jour, a la volee pour aujourd'hui
- Fichiers binaires sur filesystem, reference en DB

## Conventions projet

- **Suppression** : toujours `trash` au lieu de `rm` (macOS)
- **Langue** : communication en francais, code en anglais
- **Commits** : pas de commit sans demande explicite de Romain
- **UI** : preference de Romain pour les vues inline plutot que les modals/dialogs
