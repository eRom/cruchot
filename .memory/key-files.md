# Fichiers cles — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-12 (session 26 — Export/Import Prompts & Roles)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Lifecycle Electron, auto-updater, protocol `local-image://` (allowlist securise) |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send + `handleChatMessage()` exportee (dual desktop/telegram), streamText, dual-forward chunks, tool approval gate |
| `src/main/ipc/index.ts` | Registre IPC + blocage `multi-llm:apikey:*` dans settings |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations (Zod), filtre projet, roles |
| `src/main/ipc/images.ipc.ts` | Generation images — save fichier + DB |
| `src/main/ipc/roles.ipc.ts` | CRUD roles (Zod) |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts (Zod) |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace + couplage Git (invalidateCache + push git:changed) |
| `src/main/ipc/git.ipc.ts` | 8 handlers Git (info, status, diff, stage, unstage, commit, generateCommitMessage) + push git:changed |
| `src/main/ipc/scheduled-tasks.ipc.ts` | CRUD taches planifiees (Zod discriminatedUnion) |
| `src/main/ipc/tts.ipc.ts` | TTS synthesize + getAvailableProviders |
| `src/main/ipc/statistics.ipc.ts` | 5 handlers stats (Zod, days valide 1-3650) |
| `src/main/ipc/files.ipc.ts` | openInOS/showInFolder securises (allowlist + extension blocklist), files:save limite 10MB |
| `src/main/ipc/mcp.ipc.ts` | 12 handlers MCP (CRUD, toggle, start/stop/restart, test) — Zod, env+headers jamais exposes |
| `src/main/db/queries/mcp-servers.ts` | Queries CRUD table mcp_servers (getAll, getEnabled, create, update, delete, toggle) |
| `src/main/services/mcp-manager.service.ts` | Singleton MCP lifecycle — Map<serverId, MCPClient>, prefixage outils, env chiffre, testConnection timeout 30s |
| `src/main/llm/router.ts` | Routeur getModel() — AI SDK |
| `src/main/llm/registry.ts` | 11 providers, modeles (text + image), `isImageModel()` |
| `src/main/llm/thinking.ts` | Mapping effort → providerOptions par provider |
| `src/main/llm/workspace-tools.ts` | 4 outils AI SDK : bash, readFile (whitelist ext), writeFile, listFiles + buildWorkspaceContextBlock() |
| `src/main/llm/errors.ts` | Classification erreurs (unwrapCause, isInvalidApiKey, isQuotaExhausted) |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider (Google + OpenAI) |
| `src/main/llm/file-operations.ts` | Parser blocs `file:create/modify/delete` |
| `src/main/db/schema.ts` | 16 tables Drizzle (dont mcp_servers, memory_fragments, remote_sessions) |
| `src/main/services/workspace.service.ts` | Scan, read/write/delete, securite, .coworkignore |
| `src/main/services/file-watcher.service.ts` | Chokidar wrapper |
| `src/main/services/tts.service.ts` | TTS OpenAI (MP3) + Google (PCM→WAV) |
| `src/main/services/scheduler.service.ts` | Timers (setTimeout/setInterval), lifecycle |
| `src/main/services/task-executor.ts` | Execution LLM programmatique |
| `src/main/services/credential.service.ts` | Wrapper safeStorage |
| `src/main/services/backup.service.ts` | Backup CRUD (path validation, trash) |
| `src/main/ipc/remote.ipc.ts` | 8 handlers Remote Telegram (configure, start, stop, status, config, auto-approve, allowed-user, delete-token) + event wiring message→handleChatMessage |
| `src/main/services/telegram-bot.service.ts` | Singleton TelegramBotService — polling, pairing, streaming, tool approval, commands, sanitization, reconnexion (~550 lignes) |
| `src/main/db/queries/remote-sessions.ts` | CRUD table remote_sessions (getActive, create, update, deactivate, touchActivity, updateAutoApprove) |
| `src/main/services/git.service.ts` | Service Git standalone — execFile securise, env minimal, cache TTL 2s, parsing porcelain |
| `src/main/ipc/summary.ipc.ts` | Handler summary:generate — generateText one-shot, Zod, whitelist providers, transcript serialize |
| `src/main/services/remote-server.service.ts` | Singleton RemoteServerService — WebSocket server ws://, pairing, dual-forward, CloudFlare tunnel (~960 lignes) |
| `src/main/ipc/remote-server.ipc.ts` | Handlers Remote Web (start, stop, generate-pairing, status, config) |
| `src/main/db/queries/remote-server.ts` | CRUD table remote_server_sessions |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge ~105 methodes |
| `src/preload/types.ts` | Types partages, DTOs |

## Renderer — Composants cles

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Routing ViewMode, shortcuts, onboarding |
| `components/chat/ChatView.tsx` | Message list + WorkspacePanel, auto-open workspace |
| `components/chat/InputZone.tsx` | Saisie, mode texte/image, pills (Thinking/Role/Prompt), FileReference |
| `components/chat/MessageItem.tsx` | Markdown, images, ReasoningBlock, ToolCallBlock, FileOperationCards, footer |
| `components/chat/ModelSelector.tsx` | Liste plate 2 sections, filtre favoris |
| `components/chat/MarkdownRenderer.tsx` | react-markdown + Shiki (DOMPurify) + KaTeX + Mermaid (DOMPurify) |
| `components/layout/Sidebar.tsx` | Drag zone, ProjectSelector, ConversationList, nav 9 vues (dont MCP) |
| `components/mcp/McpView.tsx` | Vue standalone MCP — grille serveurs, subView pattern |
| `components/mcp/McpServerCard.tsx` | Card serveur MCP — toggle, status, tools count, hover actions |
| `components/mcp/McpServerForm.tsx` | Formulaire create/edit serveur MCP — transport, env vars, projet, test |
| `components/chat/ContextWindowIndicator.tsx` | Barre tokens + cout + RemoteBadge + SummaryButton (status, pairing toast+clipboard, start/stop) |
| `components/settings/SettingsView.tsx` | 10 tabs (General, Apparence, API, Modele, Audio, Raccourcis, Donnees, Sauvegardes, Remote, Resume) |
| `components/settings/SummaryTab.tsx` | Config Resume — selecteur modele (text+configured), textarea prompt, bouton reinitialiser |
| `components/settings/RemoteTab.tsx` | Config Remote — formulaire token+userId unifie, session start/stop, pairing code, auto-approve toggles |
| `components/workspace/WorkspacePanel.tsx` | Panneau droit collapsible, FileTree + FilePanel + GitBranchBadge + tab Fichiers/Changes |
| `components/workspace/GitBranchBadge.tsx` | Badge branche Git (nom, dot dirty/clean, count modifies) |
| `components/workspace/ChangesPanel.tsx` | Vue Changes (staged/unstaged, stage/unstage, diff inline, commit + AI message) |
| `components/workspace/DiffView.tsx` | Viewer diff unifie colore (+/vert, -/rouge, @@/bleu) |
| `components/prompts/PromptsView.tsx` | Vue prompts — grille, CRUD, **export/import JSON** (export all, export single, import avec dedup) |
| `components/roles/RolesView.tsx` | Vue roles — grille, CRUD, **export/import JSON** (meme pattern que prompts) |
| `components/common/CommandPalette.tsx` | Cmd+K — recherche globale |

## Renderer — Stores

| Fichier | Role |
|---------|------|
| `stores/settings.store.ts` | Persist localStorage : theme, font, density, temperature, maxTokens, topP, thinkingEffort, ttsProvider, favoriteModelIds, summaryModelId, summaryPrompt |
| `stores/messages.store.ts` | Messages conversation active, ToolCallDisplay |
| `stores/ui.store.ts` | ViewMode, isStreaming, commandPalette, settingsTab |
| `stores/conversations.store.ts` | CRUD conversations (projectId, roleId) |
| `stores/providers.store.ts` | Providers + models + selectModel() |
| `stores/workspace.store.ts` | rootPath, tree, attachedFiles, isPanelOpen |
| `stores/roles.store.ts` | Roles, activeRoleId, activeSystemPrompt |
| `stores/tasks.store.ts` | Taches planifiees (DB-backed, pas persist) |
| `stores/mcp.store.ts` | Serveurs MCP — CRUD, toggle, start/stop/restart, status events |
| `stores/git.store.ts` | Git state — info, status, diff, stage/unstage/commit, generateMessage |
| `stores/remote.store.ts` | Remote Telegram — status, config, pairingCode, loadConfig, start/stop, auto-approve |

## Renderer — Hooks

| Fichier | Role |
|---------|------|
| `hooks/useStreaming.ts` | Ecoute chat:chunk, tool-call/tool-result |
| `hooks/useAudioPlayer.ts` | TTS dual-mode browser/cloud, cache |
| `hooks/useKeyboardShortcuts.ts` | Cmd+N/K/M/B/virgule, Escape |

## Config

| Fichier | Role |
|---------|------|
| `electron.vite.config.ts` | Build main + preload + renderer |
| `CLAUDE.md` | Regles projet |
| `specs/feature-remote-control/` | Spec Remote Telegram (7 fichiers, implementee session 23) |
| `specs/feature-mcp-integration.md` | Spec MCP (implementee session 18-19) |
| `src/main/window.ts` | BrowserWindow config (sandbox, CSP), shell.openExternal avec confirmation dialog |
| `src/main/llm/attachments.ts` | Validation attachments (extension, taille, confinement path userData+workspace) |
| `src/main/services/updater.service.ts` | Auto-updater electron-updater — check periodique, download, install, IPC broadcast |
| `electron-builder.yml` | Config packaging — targets, signature, notarisation, publish GitHub, extraResources |
| `electron.vite.config.ts` | Build main + preload + renderer, externalizeDepsPlugin avec exclude list |
| `.github/workflows/release.yml` | CI/CD release — tag v* → build + signe + notarise + publie GitHub Release |
| `.github/workflows/ci.yml` | CI — typecheck + audit + build sur push/PR main |
| `DISTRIBUTION.md` | Guide complet packaging, signature, notarisation, releases, auto-updater |

## Remote Web (SPA standalone)

| Fichier | Role |
|---------|------|
| `src/remote-web/vite.config.ts` | Config Vite standalone — React + Tailwind CSS 4, build dans `out/remote-web/` |
| `src/remote-web/src/App.tsx` | Entree SPA — useReducer state machine, WebSocket connect, pairing flow |
| `src/remote-web/src/index.css` | Theme CSS — palette OKLCH identique desktop dark mode, prose-msg, animations |
| `src/remote-web/src/hooks/useWebSocket.ts` | Hook WebSocket — connect/reconnect, dispatch actions, send messages |
| `src/remote-web/src/types/protocol.ts` | Types partages — Message, ToolApproval, AppState, AppAction |
| `src/remote-web/src/components/ChatView.tsx` | Vue chat — messages + input, calque exact desktop (InputZone pattern) |
| `src/remote-web/src/components/PairingScreen.tsx` | Ecran pairing — saisie 6 digits + URL serveur, auto-submit via URL params |
| `src/remote-web/src/components/StatusBar.tsx` | Barre status — dot connexion + titre conversation |
| `src/remote-web/src/components/ToolCallCard.tsx` | Card approbation outil — timer, args, boutons approve/deny |
| `src/remote-web/src/components/ReasoningBlock.tsx` | Bloc reasoning collapsible |
| `src/remote-web/src/components/Markdown.tsx` | Renderer markdown leger (regex, pas de deps) |
| `src/renderer/src/stores/remote-server.store.ts` | Store Zustand Remote Web cote desktop — status, pairingCode, pairingWsUrl |
