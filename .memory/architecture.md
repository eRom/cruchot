# Architecture — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 5)

## Vue d'ensemble

Application desktop locale de chat multi-LLM. Clone de Claude Desktop avec support multi-provider (7 cloud + OpenRouter + 2 locaux), generation d'images, recherche web, voix STT/TTS, statistiques de couts. Aucun serveur backend — tout local.

## Stack

Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + better-sqlite3 + Drizzle ORM + Zustand + **Vercel AI SDK 6** (`ai@^6.0.116` + `@ai-sdk/*`)

## Architecture 2 processus

```
Renderer (React UI)
    | contextBridge IPC
Preload (bridge securise)
    | ipcMain.handle / webContents.send
Main (Node.js — DB, APIs, secrets)
```

- **Main** : detient les cles API (safeStorage), fait les appels LLM, gere la DB SQLite
- **Preload** : expose `window.api` via contextBridge (fonctions typees, pas de canaux bruts)
- **Renderer** : UI React pure, aucun acces Node.js

## Arborescence cle

```
src/
  main/
    index.ts          # App lifecycle + auto-updater + custom protocol `local-image://`
    ipc/              # Handlers IPC par domaine (chat, conversations, projects, prompts, roles, etc.)
    llm/              # Routeur AI SDK + cost-calculator + image generation
    db/
      schema.ts       # 11 tables Drizzle (providers, models, projects, conversations, messages, etc.)
      queries/        # Queries par domaine
    services/         # Credential, backup, export, updater, network, notification
  preload/
    index.ts          # contextBridge — expose window.api (~50 methodes)
    types.ts          # Types partages ElectronAPI + tous les DTO
  renderer/src/
    App.tsx            # Composant racine — routing par ViewMode
    stores/            # Zustand: conversations, providers, projects, messages, settings, ui
    components/
      chat/            # ChatView, InputZone, MessageList, MessageItem, ModelSelector, etc.
      layout/          # Sidebar, AppLayout
      projects/        # ProjectsView (grille + form inline), ProjectSelector (dropdown sidebar)
      prompts/         # PromptsView (grille + form inline), bibliotheque de prompts
      settings/        # SettingsView (7 tabs), ApiKeysSection, AppearanceSettings, ModelSettings, etc.
      statistics/      # StatsView
      images/          # ImagesView, ImageGrid
      conversations/   # ConversationList, ConversationItem (rename/delete inline)
      common/          # ThemeProvider, ErrorBoundary, UpdateNotification, OfflineIndicator, CommandPalette
      onboarding/      # OnboardingWizard
    hooks/             # useStreaming, useInitApp, useKeyboardShortcuts, useContextWindow, etc.
```

## Navigation (ViewMode)

`App.tsx` route selon `useUiStore.currentView` :
- `chat` — ChatView (conversation active)
- `projects` — ProjectsView (grille de cartes / formulaire inline)
- `prompts` — PromptsView (bibliotheque de prompts, types complet/complement)
- `settings` — SettingsView (7 tabs)
- `images` — ImagesView
- `statistics` — StatsView

## Flux principal — Chat

```
User saisit message → InputZone → IPC invoke("chat:send")
→ Main: Router → AI SDK streamText() → API stream SSE
→ Main: forward chunks via webContents.send("chat:chunk")
→ Renderer: useStreaming() affiche token par token
→ Main: onFinish → sauvegarde message complet en DB + calcul cout
```

## Flux — Projets

- Un **projet** a : nom, description, systemPrompt, defaultModelId (format `providerId::modelId`), couleur
- Les **conversations** ont un `projectId` optionnel (FK vers projects)
- **Boite de reception** : conversations sans projet (`projectId = null`)
- Quand on selectionne un projet → filtre conversations sidebar + applique le modele par defaut
- Quand on cree une conversation → elle herite du `projectId` actif

## Flux — Generation d'images

```
User saisit prompt → InputZone (mode image) → IPC invoke("images:generate")
→ Main: image.ts route vers Google (Gemini) ou OpenAI (GPT Image)
→ Main: experimental_generateImage() → API
→ Main: sauve fichier PNG sur disk + record images table + messages user/assistant en DB
→ Main: retourne { id, path, base64 }
→ Renderer: ajoute message assistant avec contentData { type: 'image', path }
→ MessageItem: affiche via <img src="local-image://path">
```

- **Mode image** active quand `selectedModel.type === 'image'`
- AspectRatioSelector (chips 1:1, 16:9, 9:16, 4:3, 3:4) visible en mode image
- 3 modeles image : Gemini Flash Image, Gemini Pro Image, GPT Image 1.5
- Images servies via custom protocol `local-image://` (sandbox bloque `file://`)

## Flux — Thinking / Reasoning

```
InputZone: thinkingEffort (settings store) → IPC payload
→ Main: buildThinkingProviderOptions(providerId, effort) → providerOptions
→ Main: streamText({ providerOptions }) → API
→ Main: onChunk reasoning-delta → forward IPC + accumulate
→ Main: onFinish → save reasoning in contentData.reasoning
→ Renderer: useStreaming → appendReasoning() → ReasoningBlock (collapsible)
→ Reload: ChatView mappe contentData.reasoning → message.reasoning
```

- **ThinkingSelector** : dropdown pill (Brain icon) entre ModelSelector et PromptPicker
- Visible uniquement si `selectedModel.supportsThinking && !isImageMode`
- 4 niveaux unifies : off | low | medium | high
- Mapping par provider dans `thinking.ts` (Anthropic, OpenAI, Google, xAI)
- Setting global `thinkingEffort` dans `settings.store.ts` (default: 'medium')

## LLM — Vercel AI SDK

Providers : OpenAI, Anthropic, Google (+ images), Mistral, xAI, OpenRouter, Perplexity, LM Studio, Ollama.
Modeles : chaque modele a un `type: 'text' | 'image'` et `supportsThinking: boolean` dans `ModelDefinition`.
Couts : table `PRICING` par modele dans `cost-calculator.ts`.

## Donnees

- SQLite WAL + FTS5, 11 tables
- Fichiers binaires sur filesystem (images, attachments)
- Cles API chiffrees via Electron safeStorage (Keychain macOS)
- Settings UI persistees via Zustand `persist` middleware (localStorage)

## Fenetre

- `titleBarStyle: 'hiddenInset'` — traffic lights macOS natifs
- `trafficLightPosition: { x: 15, y: 10 }` — dans la zone drag
- Zones drag en haut de la sidebar (38px) et du panneau principal (38px)
- Sidebar header : bouton "Nouvelle discussion" (remplace l'ancien label "Multi-LLM")

## GitHub

- Repo prive : `eRom/app-desktop-llmx`
- Remote HTTPS (pas SSH — cle SSH non configuree)
