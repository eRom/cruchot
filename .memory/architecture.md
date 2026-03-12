# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-12 (session 31 — Slash Commands)

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 10 providers (8 cloud + 2 locaux), generation d'images, TTS cloud (OpenAI/Google), statistiques de couts, workspace co-work (LLM context-aware sur fichiers), **integration Git** (branche, status, diff, AI commit), taches planifiees, **integration MCP** (serveurs externes), **memory fragments** (contexte utilisateur persistant), **Remote Telegram** (controle a distance via bot), **Remote Web** (controle a distance via navigateur/mobile), **export/import JSON** (prompts, roles & commandes), **slash commands** (`/command [args]` dans InputZone). Zero serveur backend.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + **Vercel AI SDK 6** (`ai@^6.0.116`) + **`@ai-sdk/mcp`** (MCP client) + **Vite standalone** (remote-web SPA)

## Architecture 2 processus

```
Renderer (React UI) → contextBridge IPC → Preload (bridge) → ipcMain → Main (Node.js — DB, APIs, secrets)
```

- **Main** : cles API (safeStorage), appels LLM, DB SQLite, services
- **Preload** : `window.api` via contextBridge (~115 methodes typees)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence

```
src/
  main/
    index.ts              # Lifecycle, auto-updater, custom protocol local-image://
    ipc/                  # Handlers IPC par domaine (dont mcp.ipc.ts, memory-fragments.ipc.ts, git.ipc.ts, remote.ipc.ts, data.ipc.ts, slash-commands.ipc.ts)
    commands/             # Builtin slash commands definitions
    llm/                  # Router AI SDK, cost-calculator, image gen, workspace-tools, errors, thinking
    db/schema.ts          # 18 tables Drizzle (dont slash_commands)
    db/queries/           # Queries par domaine (dont mcp-servers.ts, memory-fragments.ts, remote-sessions.ts, slash-commands.ts, cleanup.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager, git, telegram-bot
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand (conversations, providers, projects, messages, settings, ui, roles, workspace, tasks, mcp, memory, git, remote, slash-commands)
    components/           # chat/, layout/, projects/, prompts/, roles/, tasks/, mcp/, memory/, commands/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings (10 tabs), images, roles, tasks, mcp, memory, commands, statistics

Sidebar NavGroup "Personnalisation" regroupe : Prompts, Roles, MCP, Memoire, Commandes

## Flux principal — Chat

```
InputZone → IPC "chat:send" → Main: streamText() → forward chunks IPC → useStreaming() token par token
→ await result.text + result.usage → save message + cost DB + updateConversationModel
```

## MCP Integration

```
McpManagerService (singleton) → Map<serverId, MCPClient>
  ├── startServer() → createMCPClient() + transport (stdio/http/sse)
  ├── getToolsForChat(projectId?) → prefixed tools merged with workspace tools
  └── stopAll() → cleanup on app quit
```

- Transport stdio principal (subprocess), HTTP/SSE secondaire
- Env vars chiffrees via safeStorage (meme pattern que cles API)
- Prefixage `servername__toolname` pour eviter collisions
- Status push via IPC `mcp:status-changed`
- Scope par projet (global ou lie a un projectId)

## Memory Fragments

Fragments de contexte personnel injectes dans le system prompt de toutes les conversations :

```
buildMemoryBlock() → <user-memory> XML block
  ↓
chat.ipc.ts : memoryBlock + systemPrompt (role) + workspace-files + tools prompt
  ↓
streamText({ messages: [{ role: 'system', content: combined }] })
```

- Ordre injection : memory fragments → role → workspace files → workspace context (auto-read) → tools prompt
- Stocke en DB (pas localStorage), charge via `memory.store.ts` au demarrage
- Max 50 fragments, 2000 chars/fragment, alerte UI > 5000 chars total
- Drag & drop HTML5 natif pour reordonner (`sortOrder`)

## Git Integration

```
GitService (standalone, per workspace) → execFile('git', args, { env minimal })
  ├── getInfo() → branch, isDirty, modifiedCount (cache TTL 2s)
  ├── getStatus() → GitFileStatus[] (porcelain v1 parse)
  ├── getDiff(path?, staged?) → unified diff string
  ├── stageFiles/unstageFiles/stageAll/commit
  └── invalidateCache() ← called by FileWatcher on change
```

- **GitService** : `execFile` (pas `exec`), env minimal, timeout 10-30s, cache TTL 2s
- **git.ipc.ts** : 8 handlers + `git:changed` push event (debounce 500ms)
- **AI Commit Message** : `generateText()` one-shot, diff tronque 20K chars, pas de conversation DB
- **Couplage workspace** : FileWatcher → `onWorkspaceFileChanged()` → invalidateCache + push `git:changed`
- **UI** : GitBranchBadge (header), tab switcher Fichiers/Changes, ChangesPanel (staged/unstaged + commit), DiffView (colore)
- **FileTree** : indicateurs Git par fichier (M/A/D/?), dot colore sur dossiers

## Remote Telegram

```
TelegramBotService (singleton, EventEmitter) → fetch() Telegram Bot API
  ├── configure(token) → getMe + safeStorage encrypt
  ├── start(conversationId?) → pairing code 6 chiffres, 5min expiry
  ├── pollLoop() → getUpdates long polling (30s timeout, AbortController)
  ├── handleUpdate() → commands (/pair, /stop, /status, /model, /clear, /help) + forward text → chat handler
  ├── startStreaming/pushChunk/endStreaming → editMessageText (debounce 500ms, cursor ▍)
  ├── requestApproval() → inline keyboard [Approve][Deny], Promise<boolean>, 5min timeout
  └── stop/destroy → deactivateSession, goodbye message
```

- **Zero dependance** : `fetch()` natif Node.js, zero npm, zero serveur backend
- **Triple securite** : token bot chiffre safeStorage + code pairing (5min, 5 tentatives max) + `allowedUserId` verifie sur chaque message/callback
- **Conversation bridge** : continue la conversation desktop active (pas de conv separee)
- **Dual-forward** : `handleChatMessage()` exporte depuis chat.ipc.ts, source `'desktop' | 'telegram'`
- **Tool approval gate** : `wrapToolsWithApproval()` wrape les `execute` des outils avant `streamText()`, auto-approve configurable par type
- **MarkdownV2** : `formatForTelegram()` avec fallback texte brut sur erreur 400
- **Split** : messages > 4096 chars coupes intelligemment (paragraphe > ligne > hard cut, code blocks)
- **Sanitization** : SENSITIVE_PATTERNS masques avant envoi Telegram
- **Reconnexion** : backoff exponentiel 1s→60s, expiration 10min inactivite
- **Persistance** : session restauree au restart app si `isActive && chatId && allowedUserId` en DB
- **Securite renforcee (S24)** : `allowedUserId` obligatoire (plus optionnel) sur messages/callbacks/start/restore, off-by-one pairing corrige (`>=`), `crypto.randomInt()` pour entropie uniforme, callback chatId verifie, erreurs generiques vers Telegram, Zod sur `remote:start`
- **UI** : badge status dans ContextWindowIndicator (bottom InputZone), Settings > Remote (9e tab), RemoteIndicator sidebar
- **Toast + clipboard** : `/pair [code]` copie automatiquement au clipboard + toast sonner au demarrage pairing
- **IPC** : 8 handlers dans `remote.ipc.ts` + events `remote:status-changed`
- **DB** : table `remote_sessions` (16e table) — chatId, autoApprove x5, conversationId FK

## Summary (Resume de conversation)

```
SummaryButton (ContextWindowIndicator) → IPC "summary:generate" → Main: generateText() one-shot
  → serialize messages user/assistant en transcript texte
  → system prompt configurable (Settings > Resume, 10e tab)
  → result.text → clipboard + toast
```

- **Backend** : `summary.ipc.ts` — Zod validation, whitelist providers, verification conversation existe, transcript tronque 100K, temperature 0.3, maxTokens 4096
- **Settings** : `summaryModelId` + `summaryPrompt` persistes dans settings.store.ts (localStorage), prompt cap 10K chars
- **UI** : bouton `SummaryButton` dans ContextWindowIndicator (a cote de RemoteBadge), tooltip dynamique, loading pulse, disabled si non configure ou < 2 messages
- **Securite** : pas de streaming (one-shot), pas de cost tracking, pas de save DB. Resultat copie au clipboard uniquement.

## Workspace Context Auto-Injection

```
buildWorkspaceContextBlock(rootPath) → <workspace-context> XML block
  ↓
chat.ipc.ts : contextBlock + WORKSPACE_TOOLS_PROMPT → system prompt
```

- Fichiers auto-lus a la racine : CLAUDE.md, AGENTS.md, GEMINI.md, COPILOT.md, .cursorrules, README.md, CONTRIBUTING.md, CHANGELOG.md
- Max 50KB/fichier, 200KB total
- Le LLM recoit le contexte projet sans utiliser d'outils → zero tool calls pour decouvrir le projet

## Securite (audits sessions 20, 24, 29)

Couches de protection :
- **Renderer** : sandbox true, CSP stricte (connect-src 'self', img-src data:, worker-src blob:, font-src data:), DOMPurify sur Shiki + Mermaid
- **Preload** : contextBridge uniquement, jamais ipcRenderer direct
- **IPC** : Zod validation sur tous les handlers (conversations, statistics, search inclus depuis S20)
- **Settings** : whitelist de cles autorisees (`ALLOWED_SETTING_KEYS`) + blocage `multi-llm:apikey:*` + validation longueur 10K max (S29)
- **Files** : `files:read` confine via `isPathAllowed()` (S29), path traversal (resolve + startsWith), SENSITIVE_PATTERNS case-insensitive, extension blocklist
- **Bash tool** : env minimal (PATH restreint, zero heritage process.env, TMPDIR=os.tmpdir()), blocklist ~30 patterns, timeout 30s
- **MCP** : env vars chiffrees, headers HTTP masques du renderer (`hasHeaders: boolean`), testConnection timeout 30s, **env minimal pour stdio** (plus de process.env complet, S29)
- **Git** : env immutable `GIT_BASE_ENV` (Readonly), `getEnv()` construit par appel (plus de mutation globale, S29)
- **Markdown** : href valide (https/http/mailto/# uniquement, S29) + DOMPurify
- **Attachments** : path confine (userData + workspace uniquement)
- **Links** : shell.openExternal avec confirmation dialog pour domaines non-trusted (TRUSTED_DOMAINS allowlist)
- **Workspace** : rootPath valide (isDirectory + rejet paths systeme), XML prompt injection sanitize (S29)
- **Import** : limite taille fichier 50MB
- **Remote Telegram** : triple verrou (token chiffre + pairing code + allowedUserId), sanitization avant envoi, tool approval gate inline keyboards
- **Remote Web** : `get-conversations` + `cancel-stream` exigent sessionToken (S29), ecoute 127.0.0.1 uniquement
- **Factory reset** : double confirmation — renderer (input "DELETE") + main process (dialog.showMessageBox natif, S29)

## Slash Commands

```
InputZone → useSlashCommands() → SlashCommandPicker (autocomplete)
  → resolve(commandName, rawText) → variable substitution ($ARGS, $1-$N, $MODEL, $PROJECT, $WORKSPACE, $DATE)
  → resolved prompt sent as normal content via IPC "chat:send"
  → slashCommand metadata stored in contentData → violet badge in MessageItem
```

- **Resolution 100% renderer** : le main process recoit le prompt resolu, pas la commande brute
- **8 builtins** : resume, explain, refactor, debug, translate, commit-msg, review, test
- **Seed** : `seedBuiltinCommands()` au startup (upsert — ne pas ecraser les builtins personnalises)
- **Noms reserves** : help, clear, settings, quit, exit (blacklist dans validation)
- **Scope projet** : `projectId` nullable — global si null, sinon lie a un projet. Priorite : projet > global > builtin
- **CRUD** : CommandsView (grille + formulaire inline, meme pattern que PromptsView)
- **Export/Import JSON** : meme pattern que Prompts & Roles
- **Autocomplete** : SlashCommandPicker popover, keyboard nav (ArrowUp/Down, Tab, Enter, Escape)
- **DB** : table `slash_commands` (18e table) — name, description, prompt, category, projectId FK, isBuiltin, sortOrder
- **IPC** : 8 handlers dans `slash-commands.ipc.ts` (list, get, create, update, delete, reset, reorder, seed) — Zod, regex `/^[a-z][a-z0-9-]*$/`

## Donnees

- SQLite WAL + FTS5, 18 tables (dont `mcp_servers`, `memory_fragments`, `remote_sessions`, `slash_commands`)
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem, servis via `local-image://` protocol

## Distribution / Packaging

- **electron-builder** v26.8.1 (devDependency) — config dans `electron-builder.yml`
- **Targets macOS** : DMG + ZIP (universal = Intel + Apple Silicon), ~200 MB
- **Auto-updater** : `electron-updater` → `updater.service.ts` wired dans `index.ts` (production only)
- **Publish** : GitHub Releases (`eRom/app-desktop-llmx`), manifeste `latest-mac.yml`
- **CI/CD** : workflow `release.yml` — trigger sur tag `v*`, build + signe + notarise + publie
- **Bundling** : `externalizeDepsPlugin` avec exclude list (deps JS pures bundlees), seuls `better-sqlite3`, `chokidar`, `@ai-sdk/mcp`, `electron-updater`, `trash` restent en node_modules
- **Signature** : pas encore de certificat Apple Developer ID — ad-hoc + `codesign --force --deep` pour dev local
- **Scripts** : `dist:mac`, `dist:win`, `dist:linux`, `dist:publish`, `release`

## Remote Web

```
RemoteServerService (singleton, EventEmitter) → ws (npm) WebSocket server
  ├── start(port) → WebSocket.Server on localhost:port (default 9877)
  ├── generatePairingCode(conversationId?) → 6 digits, 5min expiry, QR code, wsUrl
  ├── handleConnection() → auth via pairing code → sessionToken → paired client
  ├── handleMessage() → route: pair, user-message, tool-approval-response, cancel-stream, get-history
  ├── dual-forward → chat chunks pushed to WS client + desktop renderer
  └── CloudFlare tunnel support (optional cfHostname → wss:// URL)
```

- **SPA standalone** : `src/remote-web/` — Vite + React + Tailwind CSS 4, build separee dans `out/remote-web/`
- **WebSocket** : `ws` npm module, serveur localhost:9877 (configurable), pairing 6 chiffres
- **Protocol** : JSON messages via WebSocket (pair, user-message, tool-approval-response, cancel-stream, get-history, stream-start/text-delta/reasoning-delta/end, tool-approval-request, session-expired)
- **Conversation bridge** : meme pattern que Telegram — continue la conv desktop active
- **Dual-forward** : `handleChatMessage()` reutilisee, source `'desktop' | 'web'`
- **UI Web** : calque exact du desktop (meme palette OKLCH, memes composants, memes patterns CSS)
- **Composants** : App.tsx (useReducer state), PairingScreen, ChatView, StatusBar, ToolCallCard, ReasoningBlock, Markdown
- **Hooks** : useWebSocket (reconnexion, dispatch actions)
- **Auto-pair** : URL params `?ws=...&pair=...` pour QR code scan direct
- **Backend** : `remote-server.service.ts` (~960 lignes), `remote-server.ipc.ts`, `remote-server.store.ts`
- **DB** : table `remote_server_sessions` (17e table)
- **Branche** : `feature-remote-web`

## GitHub

Repo prive `eRom/app-desktop-llmx` — HTTPS (pas SSH)
