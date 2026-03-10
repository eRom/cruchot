# Patterns — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 9)

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
- `console.error('[Chat] Stream error:', error)` pour le debug

### Thinking / Reasoning Pattern
- `supportsThinking: boolean` sur `ModelDefinition`, `ModelInfo`, `Model`
- 8 modeles thinking : Opus, Sonnet (Anthropic), GPT-5.4, GPT-5.3 Codex (OpenAI), Gemini 3.1 Pro, Gemini 3 Flash (Google), Grok 4.1 Fast Reasoning (xAI), Magistral Medium (Mistral)
- `thinking.ts` : `buildThinkingProviderOptions(providerId, effort)` — mapping unifie 4 niveaux → providerOptions specifiques
- Anthropic : `thinking: { type: 'disabled' | 'enabled' | 'adaptive' }` avec `budgetTokens`
- OpenAI : `reasoningEffort: 'none' | 'low' | 'medium' | 'high'`
- Google : `thinkingConfig: { thinkingBudget: number }`
- xAI : `reasoningEffort: 'low' | 'high'` (Chat API, pas de 'medium' ni 'none')
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

### Error Classification Pattern
- **Transient** (429, 500, 503) → retry backoff exponentiel + jitter, max 3
- **Fatal** (401, 403) → notification immediate
- **Actionable** (402, deprecie) → notification avec action

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

### Data Pattern
- Drizzle ORM avec schema-first
- WAL mode + foreign_keys ON
- Stats calculees a la volee depuis la table messages (pas de pre-agregation)
- Fichiers binaires sur filesystem, reference en DB

## Conventions projet

- **Suppression** : toujours `trash` au lieu de `rm` (macOS)
- **Langue** : communication en francais, code en anglais
- **Commits** : pas de commit sans demande explicite de Romain
- **UI** : preference de Romain pour les vues inline plutot que les modals/dialogs
