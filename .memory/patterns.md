# Patterns — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-24 (S45)

## Conventions de nommage

- Fichiers : kebab-case — Composants : PascalCase — Stores : `[domaine].store.ts` — IPC : `[domaine].ipc.ts` — Queries : `[domaine].ts`

## IPC Pattern

- `ipcMain.handle` (request/response) + `webContents.send` (streaming)
- Preload : `contextBridge.exposeInMainWorld('api', { ... })`
- Renderer : `window.api.methodName(payload)`

## LLM — AI SDK v6

- `streamText()` pour chat, `generateImage()` pour images
- `onChunk` forward IPC — `chunk.text` (pas `textDelta`)
- **Pas de `onFinish`** — save DB apres `await result.text` + `await result.usage`
- `result.usage` → `{ inputTokens, outputTokens }` (pas `promptTokens`/`completionTokens`)
- `inputSchema` (pas `parameters`) pour outils, `stopWhen: stepCountIs(50)`
- `NoOutputGeneratedError` : verifier `.cause`
- `tool-call`/`tool-result` chunks dans `onChunk` (pas `onStepFinish`)

## Thinking / Reasoning

- `thinking.ts` : `buildThinkingProviderOptions(providerId, effort)` — 4 niveaux
- Anthropic : `thinking.type` + `budgetTokens` | OpenAI : `reasoningEffort` | Google : `thinkingConfig.thinkingBudget`
- xAI : low/high seulement | DeepSeek : binaire | Qwen/Magistral : decoratif

## Projet ↔ Conversation

- `defaultModelId` format `providerId::modelId` — `split('::')` avant `selectModel()`
- Conversation herite `projectId` actif + `workspacePath` du projet

## Conversation Tools (S44)

- 4 tools AI SDK dans `conversation-tools.ts` : bash (Seatbelt), readFile, writeFile, listFiles
- Toujours actifs — plus de toggle YOLO, plus de blocklist applicative
- Bash confine au `workspacePath` de la conversation via profil Seatbelt macOS
- `workspacePath` par defaut : `~/.cruchot/sandbox/` (cree au startup)
- `buildWorkspaceContextBlock()` auto-lit CLAUDE.md, README.md → system prompt

## @Mention Fichiers

- Textarea transparent + overlay cyan, regex tries par longueur desc + lookahead
- `Set<string>` local (pas Zustand), merge avec fichiers attaches + dropped au send

## Memoire Semantique (RAG local)

- Ingestion fire-and-forget (batch 50, 2s), chunking 1000/overlap 200
- Recall silencieux → `<semantic-memory>` XML dans system prompt
- Qdrant REST `fetch()` natif, config YAML `--config-path`, Point IDs `crypto.randomUUID()`
- Embedding `all-MiniLM-L6-v2` (384d ONNX), modele dans `vendor/models/`

## Referentiels RAG Custom

- LibraryService singleton, dual embedding local (384d) ou Google (gemini-embedding-2-preview 768d)
- Collection Qdrant par referentiel `library_{id}`, sticky attach `activeLibraryId` par conversation
- Injection `<library-context>` XML en premier, synthetic tool chunks pour feedback visuel
- SourceCitation deterministe (pas LLM), pdf-parse via `pdf-parse/lib/pdf-parse.js`

## Arena Mode

- 2 AbortController independants, `Promise.allSettled()`, 2 canaux IPC `arena:chunk:left/right`
- Store dedie isole du chat, multi-rounds avec archivage, simplifie (pas de tools/MCP)
- Table `arena_matches`, stats agregees UNION ALL par modele

## Bardas (Brigade)

- Format : Markdown + frontmatter YAML, sections `## Roles/Commands/Prompts/Memory Fragments/Libraries/MCP`
- Namespace propage sur 6 tables, import atomique (transaction SQLite, anti-TOCTOU)
- MCP skip si existant, desinstallation atomique FK-strict, toggle ON/OFF via `disabledNamespaces`

## Right Panel (S43-S45)

- 6 sections : Parametres, Dossier de travail, Options, Outils, MCP, Remote
- Toujours visible : collapsed (40px, icones) / expanded (300px, contenu) — toggle via TopBar
- Mutuellement exclusif avec WorkspacePanel : `openPanel: 'workspace' | 'right' | null`
- Sections cards : `bg-sidebar` (meme fond que sidebar)
- Thinking selector : Radix Select (meme composant que Model/Role selectors)
- Communication : CustomEvent (`EVENTS.PROMPT_INSERT/PROMPT_OPTIMIZED`) + `ui.store.draftContent`
- Library sync dans ChatView (pas OptionsSection), flag `cancelled` anti-race

## TopBar (S45)

- Composant `layout/TopBar.tsx` : 38px pleine largeur, drag region macOS + 2 toggles a droite
- Toggle sidebar : `PanelLeftClose`/`PanelLeftOpen` via `useSettingsStore().toggleSidebar`
- Toggle right panel : `PanelRightClose`/`PanelRightOpen` via `useUiStore().toggleRightPanel`
- Logique icones harmonisee : expanded → Close, collapsed → Open (les deux panneaux)
- Raccourcis : CMD+B = sidebar, OPT+CMD+B = right panel (`e.code === 'KeyB'`, capture phase)

## CustomizeView (S45)

- Regroupe 7 anciens ViewMode en onglets : Prompts, Roles, Commandes, Memoire, Referentiels, MCP, Brigade
- Meme layout que SettingsView : sidebar navigation (w-48) + contenu scrollable
- `CustomizeTab` type + `customizeTab` state dans ui.store (meme pattern que `SettingsTab`)
- Raccourci CMD+U ouvre la vue Personnaliser
- Vues internes lazy-loaded dans le contenu (React.lazy + Suspense)

## Sidebar (S45)

- Largeur expanded : 300px (was 260px), collapsed : 52px
- Header : 3 boutons Chat/Taches/Arena (expanded : labels, collapsed : icones + tooltips)
- Plus de toggle sidebar dans le header (deplace dans TopBar)
- Plus de drag region (deplacee dans TopBar)

## Selectors centralises

- `messages.store.getConversationMessages(convId)`, `providers.store.getSelectedModel()`/`getSelectedModelId()`
- `EVENTS` constantes + `formatTokenCount()` dans `lib/utils.ts`

## Conventions UI

- Vues inline (pas de modal) — `subView` state ('grid'|'create'|'edit')
- Footer message : actions hover a gauche, info a droite
- ModelSelector : liste plate, pas de groupement par provider
- WorkspacePanel : toggle (pas close), ne PAS auto-open au changement de conversation
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea), icone `MessagesSquare` (Arena: `Swords`)
- Remote badge : dans ContextWindowIndicator, PAS toolbar
- Singletons : `export const fooService = new FooService()`
- UserMenu : Personnaliser (Cmd+U) → Parametres (Cmd+,) → Images → Statistiques
- ProjectSelector : "Gerer les projets..." en bas du dropdown (point d'entree unique projets)

## Data Cleanup / Factory Reset

- Zone orange (partiel) / zone rouge (factory reset 25 tables + localStorage.clear())
- Ordre FK strict : bardas → namespacees, arena_matches → messages, library_chunks → sources → libraries
