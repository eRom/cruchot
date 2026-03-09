# Patterns — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-09 (session 2)

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
- `generateImage()` pour la generation d'images (Gemini uniquement)
- `onChunk` callback pour forward IPC — **ATTENTION: `chunk.text` pas `chunk.textDelta`** (AI SDK v6)
- `onFinish` callback pour sauvegarde DB + calcul couts
- `abortSignal` pour annulation
- `providerOptions` pour features specifiques (ex: Anthropic thinking)

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
