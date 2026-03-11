# Architecture — Multi-LLM Desktop

## Vue d'ensemble

App desktop locale de chat multi-LLM (Electron). 11 providers (9 cloud + OpenRouter + 2 locaux), generation d'images, TTS cloud (OpenAI/Google), statistiques de couts, workspace co-work (LLM context-aware sur fichiers), taches planifiees. Zero serveur backend.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + **Vercel AI SDK 6** (`ai@^6.0.116`)

## Architecture 2 processus

```
Renderer (React UI) → contextBridge IPC → Preload (bridge) → ipcMain → Main (Node.js — DB, APIs, secrets)
```

- **Main** : cles API (safeStorage), appels LLM, DB SQLite, services
- **Preload** : `window.api` via contextBridge (~71 methodes typees)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence

```
src/
  main/
    index.ts              # Lifecycle, auto-updater, custom protocol local-image://
    ipc/                  # Handlers IPC par domaine
    llm/                  # Router AI SDK, cost-calculator, image gen, workspace-tools, errors, thinking
    db/schema.ts          # 13 tables Drizzle
    db/queries/           # Queries par domaine
    services/             # Credential, backup, workspace, file-watcher, tts, scheduler, task-executor
  preload/
    index.ts              # contextBridge
    types.ts              # Types partages + DTOs
  renderer/src/
    App.tsx               # Routing par ViewMode
    stores/               # Zustand (conversations, providers, projects, messages, settings, ui, roles, workspace, tasks)
    components/           # chat/, layout/, projects/, prompts/, roles/, tasks/, settings/, statistics/, images/, conversations/, workspace/, common/
    hooks/                # useStreaming, useInitApp, useKeyboardShortcuts, useAudioPlayer, useContextWindow
```

## Navigation (ViewMode)

`App.tsx` route via `useUiStore.currentView` : chat, projects, prompts, settings (8 tabs dont Audio), images, roles, tasks, statistics

## Flux principal — Chat

```
InputZone → IPC "chat:send" → Main: streamText() → forward chunks IPC → useStreaming() token par token
→ await result.text + result.usage → save message + cost DB + updateConversationModel
```

## Donnees

- SQLite WAL + FTS5, 13 tables
- Cles API chiffrees via safeStorage (Keychain macOS)
- Settings UI via Zustand persist (localStorage)
- Images/attachments sur filesystem, servis via `local-image://` protocol

## GitHub

Repo prive `eRom/app-desktop-llmx` — HTTPS (pas SSH)
