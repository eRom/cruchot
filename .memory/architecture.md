# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-14 (S35)

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 10 providers (8 cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, workspace co-work, integration Git, taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), referentiels RAG custom (documents), Remote Telegram, Remote Web, export/import securise (.mlx), slash commands, @mention fichiers. Zero serveur backend.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + Vercel AI SDK 6 (`ai@^6.0.116`) + `@ai-sdk/mcp` + Qdrant v1.17 (embedded) + `@huggingface/transformers` + `onnxruntime-node` + `@ai-sdk/google` (embeddings) + Vite standalone (remote-web SPA)

## Architecture 2 processus

```
Renderer (React UI) → contextBridge IPC → Preload (bridge) → ipcMain → Main (Node.js — DB, APIs, secrets)
```

- **Main** : cles API (safeStorage), appels LLM, DB SQLite, services
- **Preload** : `window.api` via contextBridge (~135 methodes typees)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence

```
src/
  main/
    index.ts              # Lifecycle, auto-updater, protocol local-image://
    ipc/                  # Handlers IPC par domaine
    commands/             # Builtin slash commands definitions
    llm/                  # Router AI SDK, cost-calculator, image gen, workspace-tools, errors, thinking, library-prompt
    db/schema.ts          # 22 tables Drizzle
    db/queries/           # Queries par domaine (dont libraries.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager, git, telegram-bot, remote-server, qdrant-memory, qdrant-process, embedding, library, library-embedding
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand stores
    components/           # chat/, layout/, projects/, prompts/, roles/, tasks/, mcp/, memory/, commands/, libraries/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow, useFileMention, useSlashCommands
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings (10 tabs), images, roles, tasks, mcp, memory, commands, statistics, libraries

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

## Modules principaux

- **MCP** : McpManagerService singleton, Map<serverId, MCPClient>, transport stdio/http/sse, prefixage `servername__toolname`, env vars chiffrees, scope par projet
- **Memory Fragments** : injectes dans system prompt (`<user-memory>` XML), max 50 fragments, 2000 chars/fragment, drag & drop pour reordonner
- **Git** : GitService standalone, `execFile` securise, env minimal, cache TTL 2s, AI Commit one-shot, UI ChangesPanel/DiffView
- **Remote Telegram** : TelegramBotService singleton, fetch() natif, triple securite (token chiffre + pairing + allowedUserId), conversation bridge, dual-forward, tool approval gate
- **Remote Web** : RemoteServerService, WebSocket ws://, SPA standalone `src/remote-web/`, calque visuel desktop
- **Summary** : generateText one-shot, transcript serialize, resultat → clipboard
- **Slash Commands** : resolution 100% renderer, 8 builtins, autocomplete SlashCommandPicker, scope projet, variables $ARGS/$1-$N/$MODEL etc.
- **@Mention Fichiers** : transparent overlay pattern (textarea invisible + overlay cyan), useFileMention hook, autocomplete FileMentionPopover, fichiers charges au send via workspaceReadFile, zero backend
- **Memoire Semantique** : QdrantMemoryService singleton, Qdrant embedded (binaire v1.17), embeddings all-MiniLM-L6-v2 (384d ONNX via @huggingface/transformers + onnxruntime-node CPU), ingestion fire-and-forget, recall silencieux injecte dans system prompt (`<semantic-memory>` XML), UI MemoryExplorer dans settings, badge discret retire (operation silencieuse)
- **Referentiels RAG Custom** : LibraryService singleton, import documents (PDF/DOCX/MD/code/CSV), dual embedding local (MiniLM 384d) ou Google (gemini-embedding-2-preview 768d), chunking adapte par type, collection Qdrant par referentiel (`library_{id}`), retrieval sticky par conversation (`activeLibraryId`), contexte injecte en premier (`<library-context>` XML), sources deterministes dans MessageItem, indicateur outil synthetique dans ToolCallBlock
- **Workspace Context** : `buildWorkspaceContextBlock()` auto-lit CLAUDE.md, README.md etc. → injecte dans system prompt

## Donnees

- SQLite WAL + FTS5, 22 tables (+ `libraries`, `library_sources`, `library_chunks` S35)
- Qdrant vector DB embedded (stockage `userData/qdrant-storage/`, config YAML `userData/qdrant-config/`)
- Collections Qdrant : `conversations_memory` (memoire semantique) + `library_{id}` (referentiels RAG)
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem, servis via `local-image://` protocol

## Securite (resume)

- Renderer : sandbox true, CSP stricte, DOMPurify sur Shiki + Mermaid
- IPC : Zod validation partout, settings whitelist `ALLOWED_SETTING_KEYS`
- Files : `isPathAllowed()`, SENSITIVE_PATTERNS, extension blocklist
- Bash tool : env minimal, blocklist ~36 patterns, timeout 30s
- MCP : env minimal stdio, env vars chiffrees, headers masques du renderer
- Git : `GIT_BASE_ENV` Readonly, `getEnv()` par appel, `validateGitPaths()`
- Remote : triple verrou Telegram, `validateSessionToken()` sur tous handlers WS, ecoute 127.0.0.1
- Factory reset : double confirmation (renderer + dialog natif main)
- Library RAG : Zod validation IPC, fichiers copies dans userData, XML sanitise, collections Qdrant isolees, cleanup FK cascade

## Distribution

- electron-builder v26.8.1, targets macOS DMG + ZIP (universal)
- Auto-updater electron-updater, publish GitHub Releases (`eRom/app-desktop-llmx`)
- CI/CD : `release.yml` (tag v*), `ci.yml` (typecheck + audit + build)
- Pas encore de certificat Apple Developer ID — ad-hoc pour dev local

## GitHub

Repo prive `eRom/app-desktop-llmx` — HTTPS (pas SSH)
