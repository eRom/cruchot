# Patterns — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11 (session 24 — Summary + audit secu Remote)

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
- **`stopWhen: stepCountIs(50)`** — limite haute (50 steps) car app locale. Default v6 = `stepCountIs(1)`
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
  - `bash` : shell exec async (child_process.exec), cwd=workspace, blocklist ~30 patterns, env minimal (PATH restreint, zero process.env), timeout 30s, ANSI off
  - `readFile` : **whitelist d'extensions textuelles** (~80 ext), blocklist fichiers sensibles (.env*, .pem, .key), blocklist segments gitignore (node_modules, .git, dist, build, .cache, .venv...)
  - `writeFile` (immediat) / `listFiles`
- **Auto-injection contexte** : `buildWorkspaceContextBlock()` lit CLAUDE.md, AGENTS.md, GEMINI.md, README.md etc. a la racine et les injecte dans le system prompt → le LLM n'a pas besoin de tool calls pour decouvrir le projet
- **ToolCallBlock** : collapsible cyan, icones par outil (Terminal/FileText/Pencil/FolderSearch), **auto-collapse quand stream finit** (useRef + useEffect sur isStreaming transition)
- **ReasoningBlock** : idem auto-collapse a la fin du stream
- Fichiers attaches injectes en system prompt (`<workspace-files>` XML)

## Git Integration

- **GitService** : standalone (pas dans WorkspaceService), `execFile` (pas `exec` → zero injection shell)
- **Env minimal** : `PATH` restreint, `GIT_TERMINAL_PROMPT=0`, `NO_COLOR=1`, `LANG=en_US.UTF-8`
- **Cache** : `getStatus()` + `getInfo()` avec TTL 2s, invalide par `invalidateCache()` (appele par FileWatcher)
- **Parsing porcelain v1** : `XY path` → `{ path, staging: X, working: Y }`, gestion renommages (`R old -> new`)
- **Debounce** : `git:changed` push au renderer debounce 500ms apres file change
- **AI Commit** : `generateText()` one-shot (pas de conversation DB), diff tronque 20K chars, temperature 0.3
- **UI pattern** : tab switcher dans WorkspacePanel header (Fichiers/Changes), visible seulement si `isGitRepo`
- **FileTree** : `statusMap` (Map<path, GitFileStatus>) memoize pour lookup O(1), `dirHasGitStatus()` pour dot colore sur dossiers
- **FilePanel** : toggle Diff (icone GitCompare) visible si fichier a un statut Git modifie

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

## Security Hardening (renforce session 20)

- Path allowlist : `path.resolve()` + `startsWith(dir + path.sep)` (jamais sans `path.sep`)
- Extension blocklist (.app, .sh, .exe...) pour `shell.openPath()` et `files:save`
- CSP durcie : script-src/connect-src 'self', object-src/base-uri/form-action/frame-src 'none'
- Credential blocklist : settings:get/set bloque `multi-llm:apikey:*`
- Mermaid : `securityLevel: 'strict'` + DOMPurify sanitize SVG
- Shiki : DOMPurify sanitize HTML (`MarkdownRenderer.tsx`)
- Suppression : toujours `trash` (jamais rm/unlink)
- DevTools : `!app.isPackaged` seulement
- **Bash tool** : env minimal (PATH=/usr/local/bin:/usr/bin:/bin, HOME=workspace), blocklist ~30 patterns (rm -rf ., bash -c, scp, rsync, nc, tee /, base64|bash, python -c, etc.)
- **Attachments** : path confine a userData/attachments + userData/images + workspace root
- **MCP** : headers HTTP masques du renderer (`hasHeaders: boolean`), testConnection timeout 30s via Promise.race
- **shell.openExternal** : confirmation dialog pour domaines hors TRUSTED_DOMAINS allowlist
- **Workspace** : rootPath valide (isDirectory + rejet paths systeme /, /etc, /usr, /System, /Library)
- **Import** : limite taille fichier 50MB avant JSON.parse
- **fileContexts** : sanitize path/language (suppression `"<>&`) avant injection XML system prompt
- **SENSITIVE_PATTERNS** : case-insensitive (`/i` flag) — couvre .ENV, .Key, Credentials.json sur HFS+
- **Zod partout** : conversations, statistics (days 1-3650), search (max 500 chars) — plus aucun handler sans validation

## MCP Integration

- **McpManagerService** : singleton, `Map<serverId, MCPClient>`, lifecycle (start/stop/restart)
- **Transport** : stdio principal (subprocess `Experimental_StdioMCPTransport`), HTTP/SSE secondaire
- **Prefixage outils** : `servername__toolname` (double underscore) pour eviter collisions inter-serveurs
- **Env vars chiffrees** : JSON.stringify → `safeStorage.encryptString()` → base64 (meme pattern que cles API)
- **Securite renderer** : `envEncrypted` + `headers` jamais exposes, remplaces par `hasEnvVars`/`hasHeaders: boolean` dans IPC
- **Status push** : `mcp:status-changed` IPC event → renderer met a jour le store
- **Scope projet** : `projectId` nullable — global si null, sinon lie a un projet
- **Chat integration** : MCP tools merges avec workspace tools dans `chat.ipc.ts`, fallback silencieux si erreur
- **Dynamic imports** : `await import('@ai-sdk/mcp')` et `@ai-sdk/mcp/mcp-stdio` (ESM dans Electron main)
- **Externals** : `@ai-sdk/mcp` et `@ai-sdk/mcp/mcp-stdio` dans rollup externals (comme chokidar)
- **UI** : vue standalone dans NavGroup "Personnalisation" (pas dans Settings tabs)
- **Tool label MCP** : regex `^([^_]+)__(.+)$` → `[serverName] toolName` dans useStreaming

## Remote Telegram

- **TelegramBotService** : singleton extends `EventEmitter`, meme pattern que McpManagerService
- **Token** : chiffre via `safeStorage` (meme pattern que cles API), stocke dans table `settings` cle `multi-llm:remote:telegram-token`
- **allowedUserId** : stocke en clair dans `settings` cle `multi-llm:remote:allowed-user-id` (entier, pas un secret)
- **Pairing** : `crypto.randomInt(0, 1_000_000)` → 6 chiffres uniformes, expiry 5min, max 5 tentatives (>=, pas >)
- **Long polling** : boucle async `pollLoop()` avec `getUpdates(offset, timeout:30)`, AbortController pour cancellation
- **Streaming Telegram** : `sendMessage('▍')` → `editMessageText(buffer + ' ▍')` debounce 500ms → `editMessage(finalText)` ou split si > 4096
- **Tool approval** : `wrapToolsWithApproval()` wrape `execute` des outils AVANT `streamText()`. Auto-approve configurable par type (read, list, write, bash, mcp). Inline keyboard [Approve][Deny] → `Promise<boolean>` (timeout 5min = deny)
- **handleChatMessage()** : fonction exportee depuis `chat.ipc.ts`, source `'desktop' | 'telegram'`. IPC handler = thin wrapper. Telegram forward via `telegramBotService.on('message')` dans `remote.ipc.ts`
- **Dual-forward** : apres chaque `win.webContents.send('chat:chunk')`, push vers `telegramBotService.pushChunk()` si connected
- **Conversation bridge** : `start(conversationId)` passe l'ID de la conv active → continue la meme conversation (pas de conv separee)
- **UI badge** : `RemoteBadge` dans `ContextWindowIndicator.tsx` (bottom InputZone), pas dans la toolbar
- **Formulaire unifie** : token + userId dans un seul bloc, un seul bouton "Valider", les deux champs obligatoires
- **Toast + clipboard** : au demarrage pairing, `/pair [code]` copie au clipboard + toast sonner 8s
- **Securite renforcee S24** : `allowedUserId` obligatoire (pas optionnel) — `!this.allowedUserId` = reject sur messages, callbacks, start(), restore session. Erreurs generiques vers Telegram (pas de raw error messages). Callback queries verifiees contre `this.chatId`. Zod sur `remote:start` conversationId.

## Summary (Resume de conversation)

- **Pattern one-shot** : meme pattern que AI Commit (generateText, pas streamText, pas de conversation DB)
- **Serialization** : messages user/assistant serialises en transcript texte `[Utilisateur]/[Assistant]` dans un seul message user (evite "assistant message prefill" error sur certains providers)
- **Truncation** : transcript tronque a 100K chars pour eviter l'explosion de tokens
- **Resultat** : copie directe au clipboard via `navigator.clipboard.writeText()`, jamais rendu en HTML (zero risque XSS)
- **Config** : `summaryModelId` (format `providerId::modelId`) + `summaryPrompt` dans settings.store.ts, cap 10K chars cote store ET Zod backend
- **UI** : `SummaryButton` interne a `ContextWindowIndicator.tsx`, meme pattern visuel que `RemoteBadge` (icone + label, tooltip dynamique)
- **Securite backend** : whitelist providers `VALID_PROVIDERS`, regex modelId, verification `getConversation()` avant chargement messages

## Conventions UI

- Vues inline (formulaire remplace grille, pas de modal) — `subView` state ('grid'|'create'|'edit')
- Pills InputZone : toujours shadcn Select (copier pattern ThinkingSelector)
- Footer message : actions (audio/copier) hover a gauche, info (model/cout/temps) a droite
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea — display:table casse flex)
- Title bar macOS : `hiddenInset`, traffic lights `{x:15, y:10}`, drag zones 38px

## Distribution / Packaging

- **externalizeDepsPlugin** : externalise tout par defaut, `exclude` liste les deps JS pures a bundler (ai, drizzle-orm, zod, nanoid, etc.)
- **Modules natifs/ESM** restent external : `better-sqlite3`, `chokidar`, `@ai-sdk/mcp`, `electron-updater`, `trash` → inclus via `files` dans electron-builder.yml
- **electron-builder.yml** : `files` whitelist node_modules specifiques (pas `!node_modules` global puis re-include)
- **Build universal** macOS : `arch: [universal]` — Intel + Apple Silicon en un binaire, rebuild better-sqlite3 pour les 2 arches
- **Auto-updater** : `autoDownload: false`, broadcast IPC vers renderer, check toutes les 4h, `app.isPackaged` guard
- **Release workflow** : tag `v*` → CI build + `--publish always` → GitHub Release auto avec manifeste `latest-mac.yml`
