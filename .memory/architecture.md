# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-23 (S44)

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 10 providers (8 cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), referentiels RAG custom, Remote Telegram/Web, export/import .mlx, slash commands, @mention fichiers, prompt optimizer, drag & drop, conversations favorites, Arena (LLM vs LLM), Bardas (packs thematiques), conversation tools (bash Seatbelt + fichiers), Right Panel (6 sections). Zero serveur backend.

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
    llm/                  # Router AI SDK, cost-calculator, image gen, conversation-tools, errors, thinking, library-prompt
    db/schema.ts          # 25 tables Drizzle
    db/queries/           # Queries par domaine (dont libraries.ts, arena.ts, bardas.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager, telegram-bot, remote-server, qdrant-memory, qdrant-process, embedding, library, library-embedding, barda-parser, barda-import, seatbelt
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand stores
    components/           # chat/, chat/right-panel/, layout/, projects/, prompts/, roles/, tasks/, mcp/, memory/, commands/, libraries/, arena/, brigade/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useArenaStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow, useFileMention, useSlashCommands
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings, images, roles, tasks, mcp, memory, commands, statistics, libraries, arena, brigade. 13 vues non-chat lazy-loaded (React.lazy + Suspense). Right Panel lazy-loaded dans ChatView.

## Flux principal — Chat

```
InputZone → IPC "chat:send" → Main: streamText() → forward chunks IPC → useStreaming() token par token
→ await result.text + result.usage → save message + cost DB + updateConversationModel
```

### Injection system prompt (ordre)
```
1. <library-context> (referentiel RAG sticky, si attache)
2. <semantic-memory> (recall Qdrant conversations)
3. <user-memory> (memory fragments)
4. Role system prompt
```

## Conversation Tools (S44)

- 4 tools AI SDK toujours actifs : bash (Seatbelt macOS, libre — pas de blocklist applicative), readFile, writeFile, listFiles
- `workspacePath` NOT NULL DEFAULT `~/.cruchot/sandbox/` sur chaque conversation
- Heritage projet : nouvelle conversation herite workspacePath de son projet
- Bash confine au workspacePath via profil Seatbelt

## Donnees

- SQLite WAL + FTS5, 25 tables, ~24 index de performance
- Qdrant vector DB embedded (`userData/qdrant-storage/`)
- Collections Qdrant : `conversations_memory` + `library_{id}`
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem via `local-image://` protocol

## Securite (score 97/100 apres audit S36)

- Renderer : sandbox true, CSP stricte, DOMPurify, `will-navigate` guard
- IPC : Zod validation partout, settings whitelist
- Files : `isPathAllowed()` + `realpathSync()`, SENSITIVE_PATTERNS, 23 ext dangereuses
- Bash : Seatbelt macOS confine au workspacePath (S44)
- MCP : env minimal stdio, env vars chiffrees
- Remote : triple verrou Telegram, `validateSessionToken()` WS, ecoute 127.0.0.1
- Library RAG : `validateSourcePath()` (BLOCKED_SOURCE_ROOTS + SENSITIVE_FILE_PATTERNS)
- Sourcemaps : desactives partout
- Distribution : macOS ad-hoc signing (pas de certificat Apple)

## GitHub

Repo public `eRom/cruchot` — HTTPS (pas SSH)
