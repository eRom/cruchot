# Patterns — Multi-LLM Desktop

## Conventions de nommage

- Fichiers : kebab-case — Composants : PascalCase — Stores : `[domaine].store.ts` — IPC : `[domaine].ipc.ts` — Queries : `[domaine].ts`

## IPC Pattern

- `ipcMain.handle` (request/response) + `webContents.send` (streaming)
- Preload : `contextBridge.exposeInMainWorld('api', { ... })`
- Renderer : `window.api.methodName(payload)`

## LLM — AI SDK v6 Pattern

- `streamText()` pour chat, `generateImage()` pour images
- `onChunk` forward IPC — `chunk.text` (pas `textDelta`)
- **Pas de `onFinish`** — save DB apres `await result.text` + `await result.usage`
- `result.usage` → `{ inputTokens, outputTokens }` (pas `promptTokens`/`completionTokens`)
- `NoOutputGeneratedError` : catch autour de `result.text`, verifier `.cause` (wrape souvent l'erreur API)
- `inputSchema` (pas `parameters`) pour definir les outils
- **`stopWhen: stepCountIs(N)`** obligatoire pour multi-step tools (default v6 = `stepCountIs(1)`)
- `tool-call` et `tool-result` chunks dans `onChunk` (pas `onStepFinish`)
- `abortSignal` pour annulation (cote client seulement)

## Thinking / Reasoning

- `supportsThinking: boolean` sur ModelDefinition
- `thinking.ts` : `buildThinkingProviderOptions(providerId, effort)` — 4 niveaux (off/low/medium/high)
- Anthropic : `thinking.type` disabled/enabled/adaptive + `budgetTokens`
- OpenAI : `reasoningEffort` none/low/medium/high
- Google : `thinkingConfig.thinkingBudget`
- xAI : `reasoningEffort` low/high (Chat API, pas medium/none)
- DeepSeek : binaire enabled/disabled. Reasoner raisonne toujours.
- Qwen/Magistral : decoratif (built-in, pas de providerOptions)
- ThinkingSelector visible si `supportsThinking && !isImageMode`

## Image Generation

- `type: 'image'` dans ModelDefinition → InputZone bascule en mode image (AspectRatioSelector)
- `image.ts` route : `gemini-*` → Google, `gpt-image-*` → OpenAI
- Save : fichier PNG + table images + messages DB
- Affichage : `<img src="local-image://path">` (sandbox bloque file://)

## Projet ↔ Conversation

- `defaultModelId` format `providerId::modelId` — toujours `split('::')` avant `selectModel()`
- Conversation herite `projectId` actif, sidebar filtre par projet (null = boite de reception)
- `conversation.modelId` sauve apres chaque message, restaure au switch

## Roles (System Prompts)

- RoleSelector pill dans InputZone (shadcn Select, meme pattern que ThinkingSelector)
- Sections : Aucun → Role projet (`__project__`) → Integres → Personnalises
- Variables `{{varName}}` resolues via popover
- Verrouillage si `messages.length > 0`, persistance `roleId` apres 1er message
- Description/icone/categorie masques dans l'UI (gardes en DB)

## Workspace Co-Work + Tools

- **WorkspaceService** : scan tree, read/write/delete, path traversal check, .coworkignore, sensitive files blocklist
- **FileWatcherService** : Chokidar (ESM, `external` dans electron.vite.config), forward events renderer
- **WorkspacePanel** : collapsible toggle (pas close), `Cmd+B`, auto-open quand projet change
- **4 outils AI SDK** (`workspace-tools.ts`) :
  - `bash` : shell exec async (child_process.exec), cwd=workspace, blocklist ~15 patterns, timeout 30s, ANSI off
  - `readFile` / `writeFile` (immediat) / `listFiles`
- **ToolCallBlock** : collapsible cyan, icones par outil (Terminal/FileText/Pencil/FolderSearch)
- Fichiers attaches injectes en system prompt (`<workspace-files>` XML)

## TTS Multi-Provider

- 3 providers : browser (Web Speech), openai (gpt-4o-mini-tts, Coral), google (gemini TTS, Aoede)
- Cloud : IPC → base64 → Blob → Audio.play(), cache Map par messageId
- Google retourne PCM brut → `pcmToWav()` ajoute header WAV 44 bytes
- `tts_usage` table, cout dans GlobalStats
- CSP : `media-src 'self' blob:` obligatoire

## Taches planifiees

- 4 types : manual, interval, daily, weekly
- SchedulerService singleton (Map timers), setTimeout-chain (pas setInterval)
- task-executor : cree conversation, streamText(), save messages + cost, Notification Electron
- Isolation streaming : chunks ont `conversationId`, useStreaming filtre si != active

## Favoris modeles

- `favoriteModelIds[]` dans settings store. Aucun favori → tous affiches. ProjectForm non filtre.

## Error Classification

- `classifyError()` : unwrap `error.cause` recursif → classify par statusCode + message
- fatal (401/403), actionable (402, 429+quota), transient (429 rate limit, 5xx)
- Toast sonner : 10s actionable, 6s sinon

## Security Hardening

- Path allowlist : `path.resolve()` + `startsWith(dir + path.sep)` (jamais sans `path.sep`)
- Extension blocklist (.app, .sh, .exe...) pour `shell.openPath()`
- CSP durcie : object-src/base-uri/form-action/frame-src 'none'
- Credential blocklist : settings:get/set bloque `multi-llm:apikey:*`
- Mermaid : `securityLevel: 'strict'` + DOMPurify sanitize SVG
- Suppression : toujours `trash` (jamais rm/unlink)
- DevTools : `!app.isPackaged` seulement

## Conventions UI

- Vues inline (formulaire remplace grille, pas de modal) — `subView` state ('grid'|'create'|'edit')
- Pills InputZone : toujours shadcn Select (copier pattern ThinkingSelector)
- Footer message : actions (audio/copier) hover a gauche, info (model/cout/temps) a droite
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea — display:table casse flex)
- Title bar macOS : `hiddenInset`, traffic lights `{x:15, y:10}`, drag zones 38px
