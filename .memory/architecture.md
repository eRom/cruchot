# Architecture — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11 (session 21 — distribution/packaging)

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 11 providers (9 cloud + OpenRouter + 2 locaux), generation d'images, TTS cloud (OpenAI/Google), statistiques de couts, workspace co-work (LLM context-aware sur fichiers), taches planifiees, **integration MCP** (serveurs externes), **memory fragments** (contexte utilisateur persistant). Zero serveur backend.

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
    ipc/                  # Handlers IPC par domaine (dont mcp.ipc.ts, memory-fragments.ipc.ts)
    llm/                  # Router AI SDK, cost-calculator, image gen, workspace-tools, errors, thinking
    db/schema.ts          # 15 tables Drizzle
    db/queries/           # Queries par domaine (dont mcp-servers.ts, memory-fragments.ts)
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor, mcp-manager
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand (conversations, providers, projects, messages, settings, ui, roles, workspace, tasks, mcp, memory)
    components/           # chat/, layout/, projects/, prompts/, roles/, tasks/, mcp/, memory/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings (8 tabs), images, roles, tasks, mcp, memory, statistics

Sidebar NavGroup "Personnalisation" regroupe : Prompts, Roles, MCP, Memoire

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

- Ordre injection : memory fragments → role → workspace files → tools prompt
- Stocke en DB (pas localStorage), charge via `memory.store.ts` au demarrage
- Max 50 fragments, 2000 chars/fragment, alerte UI > 5000 chars total
- Drag & drop HTML5 natif pour reordonner (`sortOrder`)

## Securite (audit session 20)

Couches de protection :
- **Renderer** : sandbox true, CSP stricte (connect-src 'self'), DOMPurify sur Shiki + Mermaid
- **Preload** : contextBridge uniquement, jamais ipcRenderer direct
- **IPC** : Zod validation sur tous les handlers (conversations, statistics, search inclus depuis S20)
- **Bash tool** : env minimal (PATH restreint, zero heritage process.env), blocklist ~30 patterns, timeout 30s
- **MCP** : env vars chiffrees, headers HTTP masques du renderer (`hasHeaders: boolean`), testConnection timeout 30s
- **Attachments** : path confine (userData + workspace uniquement)
- **Files** : path traversal (resolve + startsWith), SENSITIVE_PATTERNS case-insensitive, extension blocklist
- **Links** : shell.openExternal avec confirmation dialog pour domaines non-trusted (TRUSTED_DOMAINS allowlist)
- **Workspace** : rootPath valide (isDirectory + rejet paths systeme)
- **Import** : limite taille fichier 50MB

## Donnees

- SQLite WAL + FTS5, 15 tables (dont `mcp_servers`, `memory_fragments`)
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

## GitHub

Repo prive `eRom/app-desktop-llmx` — HTTPS (pas SSH)
