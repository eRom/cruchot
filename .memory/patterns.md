# Patterns — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 6)

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
- 6 modeles : Opus, Sonnet (Anthropic), GPT-5.4, GPT-5.3 Codex (OpenAI), Gemini 3.1 Pro, Gemini 3 Flash (Google), Grok 4.1 Fast Reasoning (xAI)
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

### CommandPalette Pattern
- Ouvre via Cmd+K
- Fetch TOUTES les conversations a l'ouverture (`window.api.getConversations()` sans arg)
- Le store `conversations` ne contient que celles du projet actif (filtre sidebar)
- Quand on selectionne une conv d'un autre projet : switch `activeProjectId` + `activeConversationId`
- Les callbacks (onNewConversation, onOpenSettings, etc.) sont passes en props depuis App.tsx

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
