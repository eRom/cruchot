# Fichiers cles — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-22 (S42)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Lifecycle, auto-updater, protocol `local-image://` |
| `src/main/ipc/chat.ipc.ts` | Chat handler + `handleChatMessage()` exportee, streamText, dual-forward, library retrieval + synthetic tool chunks |
| `src/main/ipc/index.ts` | Registre IPC, `ALLOWED_SETTING_KEYS` whitelist |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations (Zod) + `conversations:toggleFavorite` |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace + couplage Git |
| `src/main/ipc/git.ipc.ts` | 8 handlers Git + push `git:changed` |
| `src/main/ipc/mcp.ipc.ts` | 12 handlers MCP (Zod) |
| `src/main/ipc/remote.ipc.ts` | 8 handlers Remote Telegram |
| `src/main/ipc/remote-server.ipc.ts` | Handlers Remote Web |
| `src/main/ipc/slash-commands.ipc.ts` | 8 handlers slash commands (Zod) |
| `src/main/ipc/library.ipc.ts` | 15 handlers referentiels RAG (Zod) — CRUD, sources, search, attach/detach, pick-files, get-attached |
| `src/main/ipc/summary.ipc.ts` | Summary one-shot generateText |
| `src/main/ipc/data.ipc.ts` | Cleanup + factory reset, confirmation dialog |
| `src/main/ipc/files.ipc.ts` | Read/save securises, `isPathAllowed()`, `files:readText` (drag & drop, chemin absolu, whitelist ext, 500KB max) |
| `src/main/ipc/prompt-optimizer.ipc.ts` | Handler `prompt:optimize` — generateText one-shot pour ameliorer un prompt (Zod) |
| `src/main/ipc/arena.ipc.ts` | 5 handlers Arena (send, cancel, vote, getMatches, getStats) + dual streaming parallele |
| `src/main/ipc/barda.ipc.ts` | 5 handlers Barda (import, preview, list, toggle, uninstall) + path validation securisee |
| `src/main/ipc/sandbox.ipc.ts` | 6 handlers YOLO sandbox (activate, deactivate, stop, getStatus, getProcesses, openPreview) + Zod + path confinement |
| `src/main/ipc/statistics.ipc.ts` | 5 handlers stats |
| `src/main/ipc/images.ipc.ts` | Generation images |
| `src/main/ipc/roles.ipc.ts` | CRUD roles |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts |
| `src/main/ipc/scheduled-tasks.ipc.ts` | CRUD taches planifiees |
| `src/main/ipc/tts.ipc.ts` | TTS synthesize |
| `src/main/llm/router.ts` | Routeur `getModel()` AI SDK |
| `src/main/llm/registry.ts` | 11 providers, modeles text + image |
| `src/main/llm/thinking.ts` | providerOptions par provider |
| `src/main/llm/workspace-tools.ts` | 4 outils AI SDK + `buildWorkspaceContextBlock()` |
| `src/main/llm/yolo-tools.ts` | 5 tools YOLO AI SDK v6 (bash, createFile, readFile, listFiles, openPreview) + validatePath sandbox |
| `src/main/llm/yolo-prompt.ts` | System prompt YOLO plan-then-execute (3 phases) |
| `src/main/llm/library-prompt.ts` | Injection `<library-context>` XML dans system prompt, sanitisation |
| `src/main/llm/errors.ts` | Classification erreurs |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider |
| `src/main/db/schema.ts` | 25 tables Drizzle (+ bardas S41) |
| `src/main/db/queries/cleanup.ts` | Bulk delete, ordre FK strict (dont bardas, arena_matches, library_chunks → library_sources → libraries) |
| `src/main/db/queries/bardas.ts` | CRUD bardas + deleteResourcesByNamespace (8 DELETE FK-strict) + countActiveFragments |
| `src/main/db/queries/arena.ts` | CRUD arena_matches + stats agregees win/loss/tie par modele |
| `src/main/db/queries/libraries.ts` | CRUD libraries + sources + chunks + sticky attach/detach |
| `src/main/db/queries/slash-commands.ts` | CRUD + seed builtins |
| `src/main/commands/builtin.ts` | 8 builtins + `RESERVED_COMMAND_NAMES` |
| `src/main/services/library.service.ts` | Singleton LibraryService — CRUD, import, extract, chunk, embed, Qdrant upsert, retrieval, ~500 lignes |
| `src/main/services/library-embedding.service.ts` | Abstraction dual embedding local/Google (gemini-embedding-2-preview 768d) |
| `src/main/services/mcp-manager.service.ts` | Singleton MCP lifecycle |
| `src/main/services/telegram-bot.service.ts` | Singleton Remote Telegram (~550 lignes) |
| `src/main/services/remote-server.service.ts` | Singleton Remote Web (~960 lignes) |
| `src/main/services/git.service.ts` | Git standalone, execFile securise |
| `src/main/services/workspace.service.ts` | Scan, read/write/delete, .coworkignore |
| `src/main/services/file-watcher.service.ts` | Chokidar wrapper |
| `src/main/services/credential.service.ts` | Wrapper safeStorage |
| `src/main/services/backup.service.ts` | Backup CRUD |
| `src/main/services/scheduler.service.ts` | Timers lifecycle |
| `src/main/services/task-executor.ts` | Execution LLM programmatique |
| `src/main/services/tts.service.ts` | TTS OpenAI + Google |
| `src/main/services/qdrant-memory.service.ts` | Singleton memoire semantique — ingestion, recall, search, forget, stats, reindex |
| `src/main/services/qdrant-process.ts` | Lifecycle binaire Qdrant — start/stop, config YAML, healthcheck |
| `src/main/services/embedding.service.ts` | Pipeline @huggingface/transformers — initEmbedding, embed, embedBatch (384d) |
| `src/main/llm/memory-prompt.ts` | Injection `<semantic-memory>` XML dans system prompt |
| `src/main/ipc/qdrant-memory.ipc.ts` | IPC handlers memoire semantique (Zod) |
| `src/main/db/queries/vector-sync.ts` | CRUD table `vector_sync_state` (sync SQLite ↔ Qdrant) |
| `src/main/window.ts` | BrowserWindow config, CSP, shell.openExternal, will-navigate guard |
| `src/main/services/instance-token.service.ts` | Token instance 32 bytes safeStorage pour export/import .mlx |
| `src/main/services/bulk-export.service.ts` | Export bulk AES-256-GCM → fichier .mlx |
| `src/main/services/bulk-import.service.ts` | Import .mlx, decrypt, Zod validation, size check 200MB |
| `src/main/services/barda-parser.service.ts` | Parseur Markdown barda — frontmatter YAML + sections ## + ressources ### + MCP YAML fenced, validation stricte |
| `src/main/services/barda-import.service.ts` | Import atomique barda — transaction SQLite, namespace propagation, MCP skip, rapport |
| `src/main/services/sandbox.service.ts` | Singleton SandboxService — create/destroy sessions, profil Seatbelt SBPL, dossiers ~/cruchot/sandbox/ |
| `src/main/services/process-manager.service.ts` | Singleton ProcessManagerService — track/kill process enfants, SIGTERM→SIGKILL grace, max 5/session |
| `src/main/services/seatbelt.ts` | Wrapper sandbox-exec macOS (-f fichier temp) + fallback, env minimal, NVM auto-detect |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge ~150 methodes |
| `src/preload/types.ts` | Types partages, DTOs (LibraryInfo, ArenaChunk, ArenaMatch, ArenaStat, etc.) |

## Renderer — Composants cles

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Routing ViewMode (14 vues), 13 vues lazy-loaded (React.lazy + Suspense), shortcuts, onboarding |
| `components/chat/ChatView.tsx` | Message list + WorkspacePanel |
| `components/chat/InputZone.tsx` | Saisie, pills, FileReference, SlashCommandPicker, MentionOverlay, LibraryPicker, PromptOptimizer (Sparkles), Drag & Drop fichiers |
| `components/chat/LibraryPicker.tsx` | Select simple referentiel sticky — badge actif + dropdown + detachement |
| `components/chat/SourceCitation.tsx` | Section "Sources utilisees" collapsible, deterministe (pas LLM) |
| `components/chat/MentionOverlay.tsx` | Overlay transparent, @mentions cyan |
| `components/chat/FileMentionPopover.tsx` | Autocomplete @mention fichiers |
| `components/chat/SlashCommandPicker.tsx` | Autocomplete slash commands |
| `components/chat/MessageItem.tsx` | Markdown, images, reasoning, tools (dont librarySearch), SourceCitation, footer, **React.memo** (S37) |
| `components/chat/ModelSelector.tsx` | Liste plate, filtre favoris |
| `components/chat/MarkdownRenderer.tsx` | react-markdown + Shiki + KaTeX + Mermaid |
| `components/chat/ContextWindowIndicator.tsx` | Barre tokens + RemoteBadge + WebServerBadge + SummaryButton |
| `components/libraries/LibrariesView.tsx` | Vue grille CRUD referentiels (cards colorees, search, tri, formulaire creation/edition) |
| `components/libraries/LibraryDetailView.tsx` | Detail referentiel — sources, ajout fichiers, reindex, progress bar |
| `components/settings/SemanticMemorySection.tsx` | Settings tab memoire semantique — toggle, stats, reindex, purge |
| `components/memory/MemoryExplorer.tsx` | Vue recherche/exploration memoire semantique |
| `components/layout/Sidebar.tsx` | Nav, ProjectSelector, ConversationList, handleToggleFavorite |
| `components/conversations/ConversationItem.tsx` | Item conversation avec icone Star (favoris ambre) + Swords (arena) |
| `components/conversations/ConversationList.tsx` | Liste avec section Favoris en haut + separateur + groupes par date |
| `components/layout/UserMenu.tsx` | Menu dropdown navigation — sous-menu Personnalisation (dont Referentiels), entree Arena (Swords) |
| `components/mcp/McpView.tsx` | Vue MCP standalone |
| `components/workspace/WorkspacePanel.tsx` | FileTree + FilePanel + Git tabs |
| `components/workspace/ChangesPanel.tsx` | Staged/unstaged, commit, AI message |
| `components/settings/SettingsView.tsx` | 10 tabs |
| `components/commands/CommandsView.tsx` | Grille CRUD + export/import JSON |
| `components/prompts/PromptsView.tsx` | Grille CRUD + export/import JSON |
| `components/roles/RolesView.tsx` | Grille CRUD + export/import JSON |
| `components/common/CommandPalette.tsx` | Cmd+K recherche globale |
| `components/arena/ArenaView.tsx` | Layout Arena principal (header + colonnes + VS + vote + input) |
| `components/arena/ArenaColumn.tsx` | Colonne gauche/droite avec model selector + messages scroll + metriques |
| `components/arena/VsSeparator.tsx` | Separateur VS anime (glow pulse, badge rouge-orange) |
| `components/arena/VoteBar.tsx` | 3 boutons vote (gauche/egalite/droite) + affichage resultat |
| `components/arena/ArenaInputZone.tsx` | Zone saisie simplifiee (textarea + send/cancel, pas de pills) |
| `components/arena/ArenaMetrics.tsx` | Barre metriques comparees (tokens, cout, temps, coloration vert/rouge) |
| `components/brigade/BrigadeView.tsx` | Vue principale Gestion de Brigade — grille BardaCards, import avec preview, rapport post-import |
| `components/brigade/BardaCard.tsx` | Card barda — namespace badge, compteurs, toggle ON/OFF, desinstaller |
| `components/brigade/BardaPreview.tsx` | Preview avant import + rapport post-import + affichage erreur parsing |
| `components/chat/YoloToggle.tsx` | Toggle YOLO amber + Dialog warning "J'accepte les risques" |
| `components/chat/YoloStatusBar.tsx` | Barre status sandbox amber (path, processes, Stop, Open Folder) |

## Renderer — Stores & Hooks

| Fichier | Role |
|---------|------|
| `stores/conversations.store.ts` | Conversations CRUD + isFavorite + isArena |
| `stores/arena.store.ts` | Store Arena dedie (modeles, messages L/R, rounds, vote, streaming state) |
| `stores/settings.store.ts` | Persist localStorage (theme, model params, favorites, summary) |
| `stores/messages.store.ts` | Messages conversation active |
| `stores/ui.store.ts` | ViewMode (14 vues dont brigade), isStreaming |
| `stores/barda.store.ts` | Store Zustand bardas — CRUD, disabledNamespaces (Set computed pour filtrage) |
| `stores/sandbox.store.ts` | Store YOLO — isActive, sessionId, sandboxPath, conversationId, processes, activate/deactivate/stop |
| `stores/workspace.store.ts` | rootPath, tree, attachedFiles, isPanelOpen |
| `stores/slash-commands.store.ts` | Slash commands CRUD |
| `stores/library.store.ts` | Libraries CRUD + indexing progress Map |
| `stores/semantic-memory.store.ts` | Status memoire semantique (status, stats, lastRecallCount) |
| `hooks/useStreaming.ts` | Ecoute chat:chunk |
| `hooks/useArenaStreaming.ts` | Ecoute arena:chunk:left + arena:chunk:right en parallele |
| `hooks/useFileMention.ts` | Detection @mention, filtrage arbre, keyboard nav |
| `hooks/useSlashCommands.ts` | Detection slash, resolution variables |

## Config

| Fichier | Role |
|---------|------|
| `electron.vite.config.ts` | Build main (esbuild) + preload + renderer (manualChunks vendor splitting), externalizeDepsPlugin |
| `electron-builder.yml` | Packaging, targets, publish GitHub, forceCodeSigning |
| `.npmrc` | `legacy-peer-deps=true` (fix peer dep conflict) |
| `.github/workflows/release.yml` | CI/CD release (tag v*) |
| `.github/workflows/ci.yml` | CI typecheck renderer+main + audit + lint + build |
| `security-audit-s36.md` | Rapport audit secu S36 — 31 vulns, 20 fixes, score 97/100 |
| `security-audit-s42.md` | Rapport audit secu S42 — sandbox-yolo hardening |
| `prompt-perf.md` | Prompt audit de performance 6 axes (cold-start, bundle, TTFMP, heap, runtime, build) |
| `scripts/prepare-models.sh` | Copie modele ONNX dans vendor/models/ pour production bundling |

## Remote Web (SPA standalone)

| Fichier | Role |
|---------|------|
| `src/remote-web/src/App.tsx` | Entree SPA, useReducer state machine |
| `src/remote-web/src/hooks/useWebSocket.ts` | WebSocket connect/reconnect |
| `src/remote-web/src/components/ChatView.tsx` | Chat calque exact desktop |
| `src/remote-web/src/components/PairingScreen.tsx` | Pairing 6 digits + auto-submit URL |
