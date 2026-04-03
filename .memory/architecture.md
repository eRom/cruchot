# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-04-03 (S54)

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 10 providers (8 cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), memoire episodique (auto-extraction LLM), referentiels RAG custom, Remote Telegram/Web, export/import .mlx, slash commands, @mention fichiers, prompt optimizer, drag & drop, conversations favorites, Arena (LLM vs LLM), Bardas (packs thematiques), conversation tools (8 tools LLM + pipeline securite + permissions + YOLO mode), Skills, Right Panel (7 sections), VCR Recording (NDJSON + HTML export). Zero serveur backend.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + Vercel AI SDK 6 (`ai@^6.0.116`) + `@ai-sdk/mcp` + Qdrant v1.17 (embedded) + `@huggingface/transformers` + `onnxruntime-node` + `@ai-sdk/google` (embeddings) + Vite standalone (remote-web SPA)

## Architecture 2 processus

```
Renderer (React UI) → contextBridge IPC → Preload (bridge) → ipcMain → Main (Node.js — DB, APIs, secrets)
```

- **Main** : cles API (safeStorage), appels LLM, DB SQLite, services
- **Preload** : `window.api` via contextBridge (~150 methodes typees)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence

```
src/
  main/
    index.ts              # Lifecycle, auto-updater, protocol local-image://
    ipc/                  # Handlers IPC par domaine
    commands/             # Builtin slash commands definitions
    llm/                  # Router AI SDK, cost-calculator, image gen, errors, thinking, library-prompt, bash-security, permission-engine
    llm/tools/            # 8 tools LLM modulaires (bash, file-read, file-write, file-edit, list-files, grep, glob, web-fetch) + shared + context + index (pipeline)
    db/schema.ts          # 27 tables Drizzle
    db/queries/           # Queries par domaine (dont libraries.ts, arena.ts, bardas.ts, permissions.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager, telegram-bot, remote-server, qdrant-memory, qdrant-process, embedding, library, library-embedding, barda-parser, barda-import, seatbelt
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand stores
    components/           # chat/, chat/right-panel/, layout/, projects/, prompts/, roles/, tasks/, mcp/, memory/, commands/, libraries/, arena/, brigade/, settings/, statistics/, images/, conversations/, workspace/, customize/, common/
    hooks/                # useStreaming, useArenaStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow, useFileMention, useSlashCommands
```

## Navigation (ViewMode) — S45

`App.tsx` route via `useUiStore.currentView` : chat, settings, customize, statistics, images, projects, tasks, arena, search. 8 vues non-chat lazy-loaded (React.lazy + Suspense).

**CustomizeView** (S45) : regroupe 7 anciens ViewMode (prompts, roles, mcp, memory, commands, libraries, brigade) en onglets dans une vue unique avec sidebar navigation (meme layout que SettingsView). `CustomizeTab` dans ui.store.

**TopBar** (S45) : barre 38px pleine largeur avec drag region macOS + 2 boutons toggle (sidebar, right panel) a droite. Remplace les drag regions separees sidebar/main et les toggles integres dans les panneaux.

**Right Panel** : toujours visible (collapsed 40px / expanded 300px), toggle via TopBar. Sections `bg-sidebar`.

**Raccourcis** : Cmd+B sidebar, Opt+Cmd+B right panel, Cmd+U personnaliser, Cmd+, parametres, Cmd+K palette, Cmd+F recherche plein texte.

**SearchView** (S53) : vue dediee FTS5, ViewMode `search`, CMD+F, filtres role/projet, prefix matching (`arti` → `article`), resultats groupes par conversation avec snippet surligne. Composant : `components/search/SearchView.tsx`.

**VCR Recording** (S53) : enregistrement session complet via `VcrRecorderService` (NDJSON temps-reel) + anonymisation PII (`VcrAnonymizerService`) + export HTML standalone (`VcrHtmlExporterService`). Section 7 du Right Panel, badge REC dans ContextWindowIndicator. IPC : `vcr:start`, `vcr:stop`, `vcr:status`.

## Flux principal — Chat

```
InputZone → IPC "chat:send" → Main: streamText() → forward chunks IPC → useStreaming() token par token
→ await result.text + result.usage → save message + cost DB + updateConversationModel
```

### Injection system prompt (ordre)
```
1. <library-context> (referentiel RAG sticky, si attache)
2. <semantic-memory> (recall Qdrant conversations)
3. <user-profile> (memoire episodique auto-extraite)
4. <user-memory> (memory fragments manuels)
5. Role system prompt
```

### Memoire — 3 couches
- **Semantique** : Qdrant RAG, ingestion fire-and-forget, recall par similarite embeddings
- **Episodique** : SQLite, extraction LLM automatique (EpisodeExtractorService), triggers : switch conversation / idle 5min / quit
- **Fragments** : notes manuelles utilisateur (table `memory_fragments`)

`EpisodeTriggerService` : 3 declencheurs (switch conv, idle 5min, quit), guard < 4 messages
`EpisodeExtractorService` : `generateText()` → JSON `[{action: create|reinforce|update, ...}]`, modele configurable

## Conversation Tools (S48)

- 8 tools AI SDK : bash, readFile, writeFile, FileEdit, listFiles, GrepTool, GlobTool, WebFetchTool
- Pipeline securite 5 etages : Security Checks (hard) → Deny Rules → READONLY_COMMANDS → Allow Rules → Approval/YOLO → Sandbox Execution
- 22 bash security checks (`bash-security.ts`), checks #3/#7 strippent les quotes, check #6 supprime (newlines legit)
- Permission engine (`permission-engine.ts`) : deny → READONLY_COMMANDS (~60 cmds auto-allow) → allow → ask → fallback
- **Mode YOLO** : switch dans WorkspaceSection, bypass `onAskApproval` (security checks hard restent actifs), passe via sendMessage payload
- Seatbelt macOS : profil `(allow default)` + `(deny file-write*)` cible (sandbox dir, /tmp, /dev). cd explicite dans wrapCommand
- `workspacePath` NOT NULL DEFAULT `~/.cruchot/sandbox/` sur chaque conversation
- Heritage projet : nouvelle conversation herite workspacePath de son projet
- Tool limit : `stepCountIs(200)` (etait 50)
- UI : ToolApprovalBanner (toast 60s dans chat) + PermissionsSettings (onglet Settings)

## Donnees

- SQLite WAL + FTS5, 27 tables, ~25 index de performance
- Qdrant vector DB embedded (`userData/qdrant-storage/`)
- Collections Qdrant : `conversations_memory` + `library_{id}`
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem via `local-image://` protocol

## Securite (score 97/100 apres audit S36)

- Renderer : sandbox true, CSP stricte, DOMPurify, `will-navigate` guard
- IPC : Zod validation partout, settings whitelist
- Files : `isPathAllowed()` + `realpathSync()`, SENSITIVE_PATTERNS, 23 ext dangereuses
- Bash : 22 security checks + Seatbelt macOS (allow default + deny file-write cible) + READONLY_COMMANDS + YOLO mode (S48)
- Permissions : pipeline deny > allow > ask > fallback, table permission_rules, approval banner
- MCP : env minimal stdio, env vars chiffrees
- Remote : triple verrou Telegram, `validateSessionToken()` WS, ecoute 127.0.0.1
- Library RAG : `validateSourcePath()` (BLOCKED_SOURCE_ROOTS + SENSITIVE_FILE_PATTERNS)
- Sourcemaps : desactives partout
- Distribution : macOS ad-hoc signing (pas de certificat Apple)

## GitHub

Repo public `eRom/cruchot` — HTTPS (pas SSH)
