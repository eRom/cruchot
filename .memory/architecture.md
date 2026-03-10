# Architecture — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 12)

## Vue d'ensemble

Application desktop locale de chat multi-LLM. Clone de Claude Desktop avec support multi-provider (7 cloud + OpenRouter + 2 locaux), generation d'images, recherche web, voix TTS cloud multi-provider (OpenAI/Google) + STT, statistiques de couts avancees (par provider, modele, projet, TTS), workspace co-work (LLM context-aware sur fichiers projet). Aucun serveur backend — tout local.

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
    ipc/              # Handlers IPC par domaine (chat, conversations, projects, prompts, roles, workspace, etc.)
    llm/              # Routeur AI SDK + cost-calculator + image generation + file-operations parser
    db/
      schema.ts       # 12 tables Drizzle (providers, models, projects, conversations, messages, tts_usage, etc.)
      queries/        # Queries par domaine
    services/         # Credential, backup, export, updater, network, notification, workspace, file-watcher, tts
  preload/
    index.ts          # contextBridge — expose window.api (~62 methodes)
    types.ts          # Types partages ElectronAPI + tous les DTO
  renderer/src/
    App.tsx            # Composant racine — routing par ViewMode
    stores/            # Zustand: conversations, providers, projects, messages, settings, ui, roles, workspace
    components/
      chat/            # ChatView, InputZone, MessageList, MessageItem, ModelSelector, etc.
      layout/          # Sidebar, AppLayout
      projects/        # ProjectsView (grille + form inline), ProjectSelector (dropdown sidebar)
      prompts/         # PromptsView (grille + form inline), bibliotheque de prompts
      roles/           # RolesView (grille + form inline), RoleSelector (pill dans InputZone)
      settings/        # SettingsView (8 tabs), ApiKeysSection, AppearanceSettings, ModelSettings, AudioSettings, etc.
      statistics/      # StatsView
      images/          # ImagesView, ImageGrid
      conversations/   # ConversationList, ConversationItem (rename/delete inline)
      workspace/       # WorkspacePanel, FileTree, FilePanel, FileReference, FileOperationCard
      common/          # ThemeProvider, ErrorBoundary, UpdateNotification, OfflineIndicator, CommandPalette
      onboarding/      # OnboardingWizard
    hooks/             # useStreaming, useInitApp, useKeyboardShortcuts, useContextWindow, etc.
```

## Navigation (ViewMode)

`App.tsx` route selon `useUiStore.currentView` :
- `chat` — ChatView (conversation active)
- `projects` — ProjectsView (grille de cartes / formulaire inline)
- `prompts` — PromptsView (bibliotheque de prompts, types complet/complement)
- `settings` — SettingsView (8 tabs, dont Audio)
- `images` — ImagesView
- `roles` — RolesView (bibliotheque de roles / system prompts)
- `statistics` — StatsView

## Flux principal — Chat

```
User saisit message → InputZone → IPC invoke("chat:send")
→ Main: Router → AI SDK streamText() → API stream SSE
→ Main: forward chunks via webContents.send("chat:chunk")
→ Renderer: useStreaming() affiche token par token
→ Main: await result.text + result.usage → sauvegarde message + cout en DB + updateConversationModel
```

## Flux — Projets

- Un **projet** a : nom, description, systemPrompt, defaultModelId (format `providerId::modelId`), couleur, workspacePath
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
- Mistral (Magistral) : reasoning built-in, pas de providerOptions — le ThinkingSelector est decoratif
- Setting global `thinkingEffort` dans `settings.store.ts` (default: 'medium')

## LLM — Vercel AI SDK

Providers : OpenAI, Anthropic, Google (+ images), Mistral, xAI, OpenRouter, Perplexity, LM Studio, Ollama.
Modeles : chaque modele a un `type: 'text' | 'image'` et `supportsThinking: boolean` dans `ModelDefinition`.
Couts : table `PRICING` par modele dans `cost-calculator.ts`. Footer message affiche cout + tokens + temps.
Cout total conversation affiche dans ContextWindowIndicator (bas droite de InputZone).

## Flux — Statistiques (session 8)

```
StatsView mount → loadStats() → IPC invoke("statistics:*") avec days param
→ Main: statistics.ts queries SQL sur messages table (JOIN conversations/projects pour stats projet)
→ Main: retourne DailyStat[], ProviderStat[], ModelStat[], ProjectStat[], GlobalStats
→ Renderer: stats.store.ts mappe les donnees, StatsView affiche 6 cards + 4 graphiques
```

- **6 stat cards** : Cout total, Messages, Conversations, Tokens entree, Tokens sortie, Temps total
- **4 graphiques** : Evolution couts (LineChart), Repartition provider (PieChart donut), Repartition projet (PieChart donut avec project.color), Top modeles (BarChart horizontal)
- **Selecteur de periode** : 7j / 30j / 90j / Tout — re-query serveur a chaque changement (pas de filtre client)
- `setSelectedPeriod()` declenche `loadStats()` automatiquement
- `days = 0` signifie "pas de filtre temporel" (toutes les donnees)
- `getProjectStats()` : JOIN messages → conversations → projects (LEFT JOIN pour "Sans projet")
- `getGlobalStats()` : remplace `getTotalCost()`, ajoute `totalResponseTimeMs` + `totalConversations`

## Systeme de favoris (session 7)

- `favoriteModelIds: string[]` dans `settings.store.ts` (persiste localStorage)
- `toggleFavoriteModel(modelId)` ajoute/retire un modele
- Si aucun favori → tous les modeles affiches dans ModelSelector (retrocompatible)
- Si au moins 1 favori → seuls les favoris apparaissent dans le dropdown du chat
- Gestion des favoris dans Settings > Modele > sous-onglet "Modeles LLM" / "Modeles Images" (etoile cliquable)
- ProjectForm (modele par defaut projet) affiche TOUS les modeles, pas filtre par favoris

## Flux — Roles (System Prompts) (session 9)

```
RolesView: CRUD roles (grille + form inline) → IPC invoke("roles:*")
→ Main: roles.ts queries — create/update/delete/getAll/getById
→ DB: table roles (id, name, systemPrompt, isBuiltin, category, tags, variables)
```

- **RoleSelector** : pill button dans InputZone (apres ThinkingSelector), shadcn Select identique a ThinkingSelector
- **Sections dropdown** : "Aucun role", "Role projet" (virtuel, si projet a systemPrompt), "Integres", "Personnalises"
- **Variables** : `{{varName}}` dans le systemPrompt, resolues via mini-formulaire popover
- **Verrouillage** : `disabled` si la conversation a deja des messages (`messages.length > 0`)
- **Persistance** : `conversation.roleId` sauve via `updateConversationRole()` apres le 1er message
- **Restauration** : ChatView fetch le role via `getRole(roleId)` au switch de conversation, restaure activeSystemPrompt
- **Role projet** : ID virtuel `__project__`, utilise `project.systemPrompt` — pre-selectionne pour les nouvelles convs dans un projet avec systemPrompt
- **FK cleanup** : `deleteRole()` met a null le `roleId` des conversations avant suppression
- **Formulaire** : nom + prompt systeme + variables + tags (description/icone/categorie masques)

## Flux — Workspace Co-Work (session 11)

```
Projet avec workspacePath → ChatView auto-open workspace → WorkspaceService scan tree
→ Chokidar watch → IPC events → debounced refreshTree()
→ User attache fichiers (FileTree right-click / FilePanel bouton)
→ InputZone envoie fileContexts[] avec le message
→ Main: chat.ipc.ts injecte fichiers en system prompt (<workspace-files> XML)
→ Main: instructions format file:create/modify/delete dans le prompt
→ LLM repond avec blocs ```file:create:path``` dans le texte
→ Main: parseFileOperations() extrait les operations (nanoid IDs)
→ Renderer: FileOperationCard par operation (approve/reject)
→ Approve: workspaceWriteFile/workspaceDeleteFile via IPC
→ Reject: update status dans contentData
```

- **WorkspaceService** : scan tree, read/write/delete, securite (path traversal, sensitive files), `.coworkignore`
- **FileWatcherService** : Chokidar wrapper, forward events vers renderer via IPC
- **WorkspacePanel** : panneau droit collapsible (w-80 expanded, w-10 collapsed), toggle PanelRightClose/PanelRightOpen
- **FileTree** : arbre recursif avec recherche, expand/collapse, right-click pour attacher
- **FilePanel** : preview read-only avec breadcrumb, langage, taille
- **FileOperationCard** : carte par operation (create=vert, modify=jaune, delete=rouge), approve/reject
- **FileReference** : chip cyan dans InputZone pour les fichiers attaches
- Auto-open workspace quand projet change (ChatView useEffect)
- `Cmd+B` : toggle workspace panel

## Flux — TTS Multi-Provider (session 12)

```
AudioPlayer click Play → useAudioPlayer hook lit ttsProvider depuis settings store
→ browser : SpeechSynthesisUtterance (Web Speech API, gratuit)
→ cloud (openai/google) : IPC invoke("tts:synthesize")
  → Main: tts.service.ts fetch REST API (OpenAI MP3 / Google Gemini PCM→WAV)
  → Main: retourne { audio: base64, mimeType, cost }
  → Main: persiste dans tts_usage table (si messageId fourni)
  → Renderer: decode base64 → Blob → URL.createObjectURL → new Audio(blobUrl).play()
  → Cache module-level Map<"messageId:provider", blobUrl> (pas de re-synthese)
```

- **3 providers** : Browser (Web Speech, gratuit), OpenAI (gpt-4o-mini-tts, voix Coral, $2.40/1M chars), Google (gemini-2.5-flash-preview-tts, voix Aoede, preview gratuit)
- **Mistral** : pas de TTS API (seulement STT/transcription via Voxtral) — retire
- **Settings** : `ttsProvider` dans settings.store (Zustand persist, default 'browser')
- **Onglet Audio** : Settings > Audio (AudioSettings.tsx) — select provider + bouton tester
- **Stats** : `totalTtsCost` dans GlobalStats, affiche "dont $X.XX TTS" dans StatCard cout total
- **CSP** : `media-src 'self' blob:` obligatoire dans index.html pour les blob URLs audio
- **Google PCM→WAV** : Gemini TTS retourne `audio/L16;codec=pcm;rate=24000` — converti en WAV avec header 44 bytes cote main

## Flux — Persistance modele par conversation

- Quand on envoie un message → `chat.ipc.ts` appelle `updateConversationModel(convId, 'providerId::modelId')`
- InputZone met a jour le store Zustand `conversations` immediatement (optimistic)
- Quand on switch de conversation → ChatView lit `conv.modelId`, `split('::')`, appelle `selectModel()`
- Format composite `providerId::modelId` — meme format que `defaultModelId` des projets

## Donnees

- SQLite WAL + FTS5, 12 tables (dont tts_usage)
- Fichiers binaires sur filesystem (images, attachments)
- Cles API chiffrees via Electron safeStorage (Keychain macOS)
- Settings UI persistees via Zustand `persist` middleware (localStorage)

## Fenetre

- `titleBarStyle: 'hiddenInset'` — traffic lights macOS natifs
- `trafficLightPosition: { x: 15, y: 10 }` — dans la zone drag
- Zones drag en haut de la sidebar (38px) et du panneau principal (38px)
- Sidebar header : bouton "Nouvelle discussion" (remplace l'ancien label "Multi-LLM")

## Specifications

- `specs/phase-setup/` — Specs initiales archivees (ARCH, FEATURES, PLAN, PRICING, STACK, TASKS, TEAM)
- `specs/` — Nouvelles specs de fonctionnalites (un fichier par feature)

## GitHub

- Repo prive : `eRom/app-desktop-llmx`
- Remote HTTPS (pas SSH — cle SSH non configuree)
