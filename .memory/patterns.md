# Patterns — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-11 (session 18 — bash tool + writeFile + MCP spec)

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
- **PAS de `onFinish`** — sauvegarde DB apres `await result.text` + `await result.usage`
- `result.usage` retourne `{ inputTokens, outputTokens }` — **PAS `promptTokens`/`completionTokens`** (AI SDK v6)
- `abortSignal` pour annulation
- `providerOptions` pour features specifiques (thinking, reasoning)
- `await result.text` pour consommer le stream — attraper `NoOutputGeneratedError` pour les modeles reasoning
- **`stopWhen: stepCountIs(N)`** obligatoire pour le multi-step tools — AI SDK v6 default `stopWhen: stepCountIs(1)` ne fait qu'1 step
- **`tool-call` et `tool-result`** chunks dans `onChunk` — accumules dans `accumulatedToolCalls[]`, persistes dans `contentData.toolCalls`
- `console.error('[Chat] Stream error:', error)` pour le debug

### Thinking / Reasoning Pattern
- `supportsThinking: boolean` sur `ModelDefinition`, `ModelInfo`, `Model`
- 14 modeles thinking : Opus, Sonnet (Anthropic), GPT-5.4, GPT-5.3 Codex (OpenAI), Gemini 3.1 Pro, Gemini 3 Flash (Google), Grok 4.1 Fast Reasoning (xAI), Magistral Medium (Mistral), DeepSeek Chat, DeepSeek Reasoner, Qwen3 Max, Qwen3.5 Plus, Qwen3.5 Flash, QwQ Plus
- `thinking.ts` : `buildThinkingProviderOptions(providerId, effort)` — mapping unifie 4 niveaux → providerOptions specifiques
- Anthropic : `thinking: { type: 'disabled' | 'enabled' | 'adaptive' }` avec `budgetTokens`
- OpenAI : `reasoningEffort: 'none' | 'low' | 'medium' | 'high'`
- Google : `thinkingConfig: { thinkingBudget: number }`
- xAI : `reasoningEffort: 'low' | 'high'` (Chat API, pas de 'medium' ni 'none')
- DeepSeek : `thinking: { type: 'enabled' }` — binaire, pas de budget (off → undefined, low/medium/high → enabled)
- Qwen : pas de providerOptions (thinking decoratif, built-in comme Magistral)
- Reasoning accumule dans closure `accumulatedReasoning` pendant `onChunk`, persiste dans `contentData.reasoning` dans `onFinish`
- Au chargement historique (ChatView), `contentData.reasoning` mappe vers `message.reasoning`
- ThinkingSelector visible uniquement si `selectedModel.supportsThinking && !isImageMode`
- Setting global `thinkingEffort` dans settings.store (Zustand persist)

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
- **PAS de `bypassCSP: true`** — utiliser `img-src 'self' local-image:` dans la CSP a la place
- `protocol.handle('local-image', ...)` avec **allowlist de repertoires** (`userData/images`, `userData/attachments`)
- Path validation : `path.resolve()` + `startsWith(dir + path.sep)` — bloque traversal
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
- Boutons edit/delete en position **absolue** avec degrade (`bg-gradient-to-l from-sidebar`) — apparaissent au hover
- ConversationList utilise `overflow-y-auto overflow-x-hidden` (PAS Radix ScrollArea — cf gotchas)
- Titre auto-genere tronque a 35 chars (pas 60)

### Conversation — Persistance modele (session 6)
- `conversation.modelId` stocke au format `providerId::modelId` (meme format que projets)
- Sauve par `chat.ipc.ts` via `updateConversationModel()` apres chaque message
- Store Zustand mis a jour par InputZone (optimistic update)
- Restaure par `ChatView.tsx` au switch de conversation : `getState().conversations.find()` puis `selectModel()`
- `useConversationsStore.getState()` (pas de hook) pour eviter re-renders inutiles dans l'effect

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

### Roles Pattern (session 9)
- **RolesView** : meme pattern que PromptsView/ProjectsView — `subView` state ('grid' | 'create' | 'edit'), formulaire inline
- **Role** : nom, systemPrompt, isBuiltin, category (masque), tags[], variables[] (avec name + description)
- **Description/icone/categorie masques** du formulaire ET des cartes (Romain les veut caches)
- **RoleSelector** : pill dans InputZone, utilise shadcn `Select`/`SelectTrigger` (meme structure que ThinkingSelector)
- **Accent couleur** : emerald (vert) quand un role est actif (`bg-emerald-500/10 text-emerald-700`)
- **Sections Select** : "Aucun role" → "Role projet" (si projet a systemPrompt) → "Integres" → "Personnalises"
- **Headers de section** : `<div>` simple (PAS `<SelectLabel>` — Radix exige SelectGroup autour)
- **Role projet** : ID virtuel `__project__`, utilise `project.systemPrompt`, pre-selectionne pour nouvelles convs
- **Variables** : `{{varName}}` dans systemPrompt, popover overlay pour les remplir, `resolveVariables()` regex replace
- **Verrouillage** : `isRoleLocked = conversationMessages.length > 0` → `disabled` prop sur RoleSelector
- **Persistance** : `roleId` sauve via `updateConversationRole()` dans chat.ipc.ts apres le 1er message
- **Restauration** : ChatView fetch role via `window.api.getRole(roleId)`, set `activeRole` + `activeSystemPrompt` dans roles.store
- **FK cleanup** : `deleteRole()` dans queries met a null `roleId` des conversations avant suppression
- **Store** : `roles.store.ts` — `activeRoleId`, `activeSystemPrompt` + setter, `roles[]`, `setRoles`

### Favorite Models Pattern (session 7)
- `favoriteModelIds: string[]` dans settings.store (Zustand persist)
- `toggleFavoriteModel(modelId)` ajoute/retire
- ModelSelector filtre : `hasFavs && !favoriteModelIds.includes(model.id)` → skip
- `favoriteModelIds.length === 0` → tous les modeles affiches (retrocompatible)
- Etoiles dans ModelTableLLM / ModelTableImages (Settings > Modele)
- ProjectForm n'est PAS filtre par favoris (affiche tous les modeles)

### ModelSelector Pattern (session 7)
- Liste plate avec 2 sections : "Generation de textes" et "Generation d'images"
- Plus de groupement par provider (simplifie)
- Filtre par favoris integre dans le useMemo

### Settings Navigation Pattern (session 7)
- `settingsTab: SettingsTab | null` dans ui.store
- CommandPalette et Cmd+M : `setSettingsTab('model')` puis `setCurrentView('settings')`
- SettingsView consomme `settingsTab` au mount, puis le clear (`setSettingsTab(null)`)
- Permet de naviguer directement vers un onglet specifique des settings

### ModelSettings Sub-tabs Pattern (session 7)
- `useState<'llm' | 'images' | 'params'>('llm')` pour la navigation interne
- 3 sous-onglets : Modeles LLM (table), Modeles Images (table), Parametres (sliders/presets)
- Meme style pills que les presets (`border-primary bg-primary/5` actif)

### CommandPalette Pattern
- Ouvre via Cmd+K
- Fetch TOUTES les conversations a l'ouverture (`window.api.getConversations()` sans arg)
- Le store `conversations` ne contient que celles du projet actif (filtre sidebar)
- Quand on selectionne une conv d'un autre projet : switch `activeProjectId` + `activeConversationId`
- Les callbacks (onNewConversation, onOpenSettings, etc.) sont passes en props depuis App.tsx
- Quick action "Liste des modeles" : navigue vers Settings > onglet Modele via settingsTab

### Model Params Pattern
- temperature, maxTokens, topP, thinkingEffort sont globaux (pas par modele)
- Persistes dans `settings.store.ts` (Zustand persist → localStorage)
- Configures dans Settings > Modele (presets Creatif/Equilibre/Precis)
- InputZone lit directement depuis le settings store (plus de state local)

### MessageItem Footer Pattern (session 5+6)
- Footer integre en bas de la bulle assistant (pas une colonne separee)
- Separe par `border-t border-border/30`
- Gauche : AudioPlayer (si pas image) + bouton Copier — apparaissent au hover (`opacity-0 group-hover:opacity-100`)
- Droite : label provider-model + temps de reponse + tokens + **cout** — toujours visible en `text-[10px] text-muted-foreground/40`
- Cout affiche si `message.cost != null && message.cost > 0` — formatCost() avec precision adaptative
- Messages user : bouton copier en position absolue `-bottom-3 right-2` (inchange)

### Title Bar Pattern (macOS)
- `titleBarStyle: 'hiddenInset'` dans BrowserWindow
- Zone drag 38px en haut de Sidebar ET AppLayout main
- `[-webkit-app-region:drag]` pour les zones draggables
- Traffic lights positiones a `{ x: 15, y: 10 }`

### Error Classification Pattern (session 14)
- **`errors.ts`** : `classifyError(error)` — unwrap cause chain puis classify par statusCode + message
- **`unwrapCause()`** : deroule `error.cause` recursivement (AI SDK wrape les erreurs API dans NoOutputGeneratedError)
- **Fatal** (401, 403, cle invalide dans message) → toast immediate, non-retryable
- **Actionable** (402, 429+quota epuise) → toast 10s "Credits epuises", non-retryable
- **Transient** (429 rate limit, 5xx, timeout) → retry backoff exponentiel + jitter, max 3
- **Detection cle invalide** : `isInvalidApiKey()` parse le message ("incorrect api key", "invalid x-api-key", etc.)
- **Detection quota** : `isQuotaExhausted()` parse le message ("insufficient_quota", "billing hard limit", etc.)
- **Toast** : `sonner` dans `useStreaming.ts`, duree adaptative (10s actionable, 6s sinon)
- **chat.ipc.ts** : `NoOutputGeneratedError` avec `cause` → rethrow la cause (plus de "No output generated" pour erreurs API)

### Statistics Pattern (session 8)
- Queries SQL directes sur la table `messages` (pas de table `statistics` pre-agregee)
- Toutes les fonctions acceptent un param `days?: number` (0 ou undefined = pas de filtre)
- Timestamps en secondes (Drizzle `mode: 'timestamp'`) — `date(createdAt, 'unixepoch')` sans diviser par 1000
- Parametres temporels : `Math.floor((Date.now() - days * 86400000) / 1000)` (entier, pas Date object)
- `buildWhereClause(days)` helper interne pour factoriser le filtre temporel
- `getProjectStats()` : JOIN messages → conversations → projects (LEFT JOIN, "Sans projet" pour projectId null)
- `getGlobalStats()` : totalCost, totalMessages, totalTokensIn, totalTokensOut, totalResponseTimeMs, totalConversations
- Store : `setSelectedPeriod()` declenche `loadStats()` automatiquement via `get().loadStats()`
- StatsView : 6 stat cards (grid 3x2), 4 graphiques Recharts (LineChart, 2x PieChart donut, BarChart horizontal)
- PieChart projet utilise `project.color` comme couleur de segment
- Formatage : `toLocaleString('fr-FR')` pour les nombres, `formatDuration(ms)` pour le temps

### Workspace Co-Work Pattern (session 11)
- **WorkspaceService** : classe avec `validatePath()` (anti path traversal), `isIgnored()` (.coworkignore), `isSensitive()` (blocklist), `scanTree()`, `readFile()`, `writeFile()`, `deleteFile()` (via `trash`)
- **FileWatcherService** : Chokidar wrapper, `start(rootPath)` / `stop()`, `forwardToWindow(mainWindow)` static
- **file-operations.ts** : regex parser pour blocs `` ```file:(create|modify|delete):path\ncontent``` `` → `ParsedFileOperation[]` avec nanoid IDs
- **WorkspacePanel** : panneau droit collapsible — `isPanelOpen` toggle (pas close), `w-80` expanded / `w-10` collapsed, CSS `transition-[width] duration-200`
- **ChatView** : auto-open workspace quand projet change (`useEffect` sur `activeProjectId`), file watcher sync avec debounce 300ms
- **WorkspacePanel toujours rendu** : condition `workspaceRootPath && <WorkspacePanel />` (pas `isPanelOpen`), le panel gere son propre etat collapsed
- **FileTree** : recursif, `matchesFilterDeep()` pour filtrage, right-click pour attacher, icones par extension
- **FileOperationCard** : couleurs par type (green create, yellow modify, red delete), approve → `workspaceWriteFile`/`workspaceDeleteFile`, reject → update `contentData.fileOperations[].status`
- **Injection contexte** : `fileContexts[]` envoyes depuis InputZone, injectes en system prompt comme `<workspace-files>` XML blocks dans `chat.ipc.ts`
- **Format operations** : instructions dans le system prompt demandent au LLM d'utiliser `` ```file:create:path``` `` format
- **Securite** : path traversal check (`..`), sensitive files blocklist (`.env`, credentials, etc.), 10MB file limit, binary detection
- **Deps** : `chokidar` (ESM, `external` dans electron.vite.config), `trash` pour deletion safe
- **Raccourci** : `Cmd+B` toggle workspace panel

### Workspace Tools Pattern (session 17+18)
- **4 outils AI SDK** dans `workspace-tools.ts` :
  - `bash(command)` — execution shell reelle via `child_process.exec` (async, non-bloquant). cwd verrouille au workspace root. Blocklist ~15 patterns dangereux (sudo, rm -rf /, shutdown, curl|bash, etc.). Timeout 30s, output tronque 50KB, ANSI desactive (`FORCE_COLOR=0 NO_COLOR=1`). Retourne `{ stdout, stderr, exitCode }`.
  - `readFile(path)` — lecture fichier via WorkspaceService (path traversal + sensitive files protection)
  - `writeFile(path, content)` — ecriture immediate via WorkspaceService (dirs auto-crees). Remplace le format `file:create/modify` markdown.
  - `listFiles(path?)` — liste repertoire via WorkspaceService.scanDirectory()
- **`searchInFiles` supprime** (session 18) — le LLM utilise `bash("grep -rn 'pattern' src/")` a la place
- **`inputSchema`** (PAS `parameters`) — AI SDK v6 breaking change
- **`stopWhen: stepCountIs(10)`** obligatoire dans `streamText()` — sans ca, default `stepCountIs(1)` empeche le multi-step
- **System prompt** : `WORKSPACE_TOOLS_PROMPT` injecte quand workspace actif, instructions pour bash (npm, git, grep, tests), writeFile (contenu complet), enchainement d'outils
- **Bash security** : `isCommandAllowed()` avec `BLOCKED_PATTERNS[]` (regex). `truncateOutput()` pour limiter la taille. `execAsync = promisify(exec)` pour ne pas bloquer le main process.
- **Tool Call UI** : `ToolCallBlock` dans MessageItem (collapsible, accent cyan `bg-cyan-500/10 text-cyan-700`)
  - Icones par outil : Terminal (bash), FileText (readFile), Pencil (writeFile), FolderSearch (listFiles)
  - Detail affiche : `command` pour bash, `path` pour readFile/writeFile/listFiles
  - Header : "Utilisation d'outils..." (running) ou "N outil(s) utilise(s)" (done) avec icone globale
- **TOOL_LABELS** dans `useStreaming.ts` : bash → "Commande shell", writeFile → "Ecriture du fichier"
- **TOOL_CONFIG** dans `MessageItem.tsx` : mapping icone + label par nom d'outil
- **Streaming** : `useStreaming` gere `tool-call` (addToolCall avec status 'running') + `tool-result` (updateLastToolCallStatus)
- **Persistance** : `contentData.toolCalls` sur le message assistant, restaure au chargement historique (ChatView)
- **Store** : `ToolCallDisplay` type + `addToolCall()` + `updateLastToolCallStatus()` dans messages.store

### TTS Multi-Provider Pattern (session 12)
- **3 providers** : `'browser'` (Web Speech, gratuit), `'openai'` (gpt-4o-mini-tts, Coral), `'google'` (gemini-2.5-flash-preview-tts, Aoede)
- **Mistral n'a PAS de TTS** — seulement STT (Voxtral transcription)
- **tts.service.ts** : `synthesizeSpeech({ provider, text, speed })` → `{ audio: base64, mimeType, cost }`
- **OpenAI** : POST `/v1/audio/speech` → MP3 direct
- **Google** : POST Gemini `generateContent` avec `responseModalities: ['AUDIO']` → retourne PCM brut (`audio/L16;codec=pcm;rate=24000`) → `pcmToWav()` ajoute header WAV 44 bytes
- **tts.ipc.ts** : `tts:synthesize` (Zod validated) + `tts:getAvailableProviders` (check cles API existantes)
- **useAudioPlayer hook** : lit `ttsProvider` depuis settings store, dual-mode browser/cloud
  - Cloud : IPC → decode base64 → `Blob` → `URL.createObjectURL()` → `new Audio(blobUrl).play()`
  - Cache module-level `Map<"messageId:provider", blobUrl>` — evite re-synthese
  - Erreur IPC catch separement de erreur playback (pas de fallback browser silencieux)
- **AudioPlayer** composant : prop `messageId` optionnelle pour le cache cloud
- **AudioSettings** : select provider dynamique (`ttsGetAvailableProviders`), bouton tester
- **tts_usage table** : id, messageId, provider, model, textLength, cost, createdAt — peuplee par tts.ipc.ts
- **Stats** : `totalTtsCost` sous-query dans `getGlobalStats()`, affiche dans StatCard "Cout total"
- **CSP** : `media-src 'self' blob:` dans `index.html` — obligatoire pour `<audio>` avec blob URLs
- **Settings store** : `ttsProvider: TtsProvider` (default `'browser'`, Zustand persist → `?? 'browser'`)

### Scheduled Tasks Pattern (session 15)
- **4 types de schedule** : `manual` (execution manuelle uniquement), `interval` (toutes les X s/min/h), `daily` (chaque jour a HH:MM), `weekly` (jours choisis + HH:MM)
- **SchedulerService** : singleton avec `Map<taskId, NodeJS.Timeout>`, `init(mainWindow)` appele apres creation fenetre, `stopAll()` dans `will-quit`
- **setTimeout pour daily/weekly** : calcule le delai jusqu'a la prochaine occurrence, re-schedule apres execution
- **setTimeout-chain pour interval** : setTimeout recursivement (pas setInterval) pour pouvoir annuler proprement
- **task-executor.ts** : execution programmatique isolee du chat interactif — `executeScheduledTask(taskId, mainWindow)`
  - Resolve modelId (`split('::')` → `getModel()`), cree conversation, charge role optionnel, sauve user message (prompt)
  - `streamText()` avec memes options que chat.ipc.ts (temperature, maxTokens, topP, providerOptions thinking)
  - Forward chunks avec `conversationId` pour filtrage renderer
  - Sauve assistant message + cout en DB, update conversation model
  - `Notification` Electron native a la fin
- **Isolation streaming** : chunks de tache background ont `conversationId` — `useStreaming` ignore si `!= activeConversationId`
- **IPC** : Zod `discriminatedUnion` pour `scheduleConfig` (4 schemas par type) → conversion en objet plat pour DB (JSON)
- **TasksView** : meme pattern que RolesView — `subView` ('grid' | 'create' | 'edit'), ecoute `task:executed` event pour refresh
- **TaskCard** : barre couleur par type (manual=blue, interval=emerald, daily=orange, weekly=violet), toggle custom (pas de Switch shadcn)
- **TaskForm** : config conditionnelle — pills pour scheduleType, champs dynamiques (interval: nombre+unite, daily: heure, weekly: jours+heure)
- **FK cleanup** : `deleteRole()` met aussi a null `scheduledTasks.roleId`, `deleteScheduledTask()` possible meme si conversations existent
- **DB** : table `scheduledTasks` (17 colonnes), `scheduleConfig` stocke en JSON text, `lastRunStatus` enum ('success'|'error')
- **computeNextRunAt()** : calcule la prochaine date d'execution selon le type, gere le weekly avec recherche du prochain jour

### Data Pattern
- Drizzle ORM avec schema-first
- WAL mode + foreign_keys ON
- Stats calculees a la volee depuis la table messages (pas de pre-agregation)
- Fichiers binaires sur filesystem, reference en DB

### Security Hardening Pattern (session 16)
- **Path allowlist** : `path.resolve(filePath)` + `resolved.startsWith(dir + path.sep)` pour toute operation fichier
- **`assertPathInDir()`** : helper reutilisable par domaine (`assertPathInBackupsDir`, `isPathAllowed` dans files.ipc)
- **Dangerous extension blocklist** : `.app`, `.command`, `.sh`, `.bat`, `.exe`, `.msi`, `.scpt`, etc. — bloque `shell.openPath()` sur executables
- **Workspace root dynamique** : `getActiveWorkspaceRoot()` exporte depuis `workspace.ipc.ts` pour inclusion dans l'allowlist de `files.ipc.ts`
- **CSP durcie** : `object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'` dans `index.html`
- **DevTools gating** : `devTools: !app.isPackaged` dans BrowserWindow webPreferences
- **Credential key blocklist** : `settings:get/set` bloque les cles `multi-llm:apikey:*` — force l'utilisation des handlers dedies
- **DOMPurify** : sanitise le SVG Mermaid avant `dangerouslySetInnerHTML` avec `USE_PROFILES: { svg: true, svgFilters: true }`
- **Mermaid** : `securityLevel: 'strict'` (jamais `'loose'`)
- **Suppression** : toujours `trash` (ESM, `await import('trash')`) au lieu de `unlinkSync` — regle projet + securite
- **prefix + path.sep** : toujours verifier `startsWith(dir + path.sep)` et NON `startsWith(dir)` pour eviter la confusion `/foo/bar` vs `/foo/bar-evil`

## Conventions projet

- **Suppression** : toujours `trash` au lieu de `rm` (macOS)
- **Langue** : communication en francais, code en anglais
- **Commits** : pas de commit sans demande explicite de Romain
- **UI** : preference de Romain pour les vues inline plutot que les modals/dialogs
