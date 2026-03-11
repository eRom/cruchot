# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 11 providers (9 cloud + OpenRouter + 2 locaux), generation d'images, TTS cloud (OpenAI/Google), statistiques de couts, workspace co-work (LLM context-aware sur fichiers), taches planifiees, **integration MCP** (serveurs externes). Zero serveur backend.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + **Vercel AI SDK 6** (`ai@^6.0.116`) + **`@ai-sdk/mcp`** (MCP client)

## Architecture 2 processus

```
Renderer (React UI) → contextBridge IPC → Preload (bridge) → ipcMain → Main (Node.js — DB, APIs, secrets)
```

- **Main** : cles API (safeStorage), appels LLM, DB SQLite, services
- **Preload** : `window.api` via contextBridge (~84 methodes typees)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence

```
src/
  main/
    index.ts              # Lifecycle, auto-updater, custom protocol local-image://
    ipc/                  # Handlers IPC par domaine (dont mcp.ipc.ts)
    llm/                  # Router AI SDK, cost-calculator, image gen, workspace-tools, errors, thinking
    db/schema.ts          # 14 tables Drizzle
    db/queries/           # Queries par domaine (dont mcp-servers.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand (conversations, providers, projects, messages, settings, ui, roles, workspace, tasks, mcp)
    components/           # chat/, layout/, projects/, prompts/, roles/, tasks/, mcp/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings (8 tabs), images, roles, tasks, mcp, statistics

Sidebar NavGroup "Personnalisation" regroupe : Prompts, Roles, MCP

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

## Donnees

- SQLite WAL + FTS5, 14 tables (dont `mcp_servers`)
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem, servis via `local-image://` protocol

## GitHub

Repo prive `eRom/app-desktop-llmx` — HTTPS (pas SSH)
