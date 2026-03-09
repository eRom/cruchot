# Architecture — Multi-LLM Desktop

**Dernière mise à jour** : 2026-03-09

## Vue d'ensemble

Application desktop locale de chat multi-LLM. Clone de Claude Desktop avec support multi-provider (7 cloud + OpenRouter + 2 locaux), génération d'images, recherche web, voix STT/TTS, statistiques de coûts. Aucun serveur backend — tout local.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + **Vercel AI SDK 5** (`ai` + `@ai-sdk/*`)

## Architecture 2 processus

```
Renderer (React UI)
    │ contextBridge IPC
Preload (bridge sécurisé)
    │ ipcMain.handle / webContents.send
Main (Node.js — DB, APIs, secrets)
```

- **Main** : détient les clés API (safeStorage), fait les appels LLM, gère la DB SQLite
- **Preload** : expose `window.api` via contextBridge (fonctions typées, pas de canaux bruts)
- **Renderer** : UI React pure, aucun accès Node.js

## Arborescence cible

```
src/
  main/           # Electron main process
    index.ts      # App lifecycle
    window.ts     # BrowserWindow
    ipc/          # Handlers IPC par domaine
    llm/          # Routeur + 9 adapters
    db/           # Schema Drizzle, queries, migrations
    services/     # Credential, backup, export, stats, voice
    utils/        # Logger, paths, tokens
  preload/        # Bridge IPC
    index.ts
    types.ts
  renderer/       # React UI
    src/
      stores/     # Zustand slices
      components/ # UI (chat, sidebar, settings, stats, etc.)
      hooks/      # useStreaming, useIPC, etc.
      lib/        # Markdown pipeline, i18n, utils
      locales/    # FR/EN
      styles/     # Tailwind globals
```

## Flux principal

```
User saisit message → Zone B → IPC invoke("chat:send")
→ Main: Router → Adapter provider → API stream SSE
→ Main: forward chunks via webContents.send("chat:chunk")
→ Renderer: affiche token par token
→ Main: sauvegarde message complet en DB après "done"
```

## LLM — Vercel AI SDK

**Décision** : adoption du Vercel AI SDK (`ai` + providers `@ai-sdk/*`) — supprime les 9 adapters custom.

Providers via AI SDK :
- `@ai-sdk/openai` — OpenAI (GPT-4o, o1, o3, o4-mini)
- `@ai-sdk/anthropic` — Anthropic (Claude Opus, Sonnet, Haiku + Extended Thinking)
- `@ai-sdk/google` — Gemini (chat + **image generation**)
- `@ai-sdk/mistral` — Mistral (Large, Small, Codestral)
- `@ai-sdk/xai` — xAI Grok
- `@ai-sdk/openrouter` — OpenRouter (400+ modèles)
- `createOpenAICompatible()` — Perplexity, LM Studio
- Community provider — Ollama

Image generation (2 modèles Gemini) :
- `gemini-3.1-flash-image-preview` (rapide/économique)
- `gemini-3-pro-image-preview` (qualité supérieure)

Coûts : table `PRICING` par modèle (input/output/search par token) — fournie par Romain.

Architecture simplifiée :
```
src/main/llm/
  router.ts           # getModel(provider, modelId) → LanguageModel
  providers.ts        # Config providers avec clés depuis safeStorage
  cost-calculator.ts  # Table PRICING + calcul coût par message
  image.ts            # generateImage() wrapper Gemini
```

## Données

- SQLite WAL + FTS5, 11 tables
- Fichiers binaires sur filesystem (images, attachments)
- Clés API chiffrées via Electron safeStorage (Keychain macOS)
- Stats pré-agrégées par jour + à la volée pour aujourd'hui
