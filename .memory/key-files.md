# Fichiers cles — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11 (session 20 — audit securite)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Lifecycle Electron, auto-updater, protocol `local-image://` (allowlist securise) |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText, chunks IPC, thinking, cost, tools multi-step |
| `src/main/ipc/index.ts` | Registre IPC + blocage `multi-llm:apikey:*` dans settings |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations (Zod), filtre projet, roles |
| `src/main/ipc/images.ipc.ts` | Generation images — save fichier + DB |
| `src/main/ipc/roles.ipc.ts` | CRUD roles (Zod) |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts (Zod) |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace |
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
| `src/main/llm/workspace-tools.ts` | 4 outils AI SDK : bash, readFile, writeFile, listFiles |
| `src/main/llm/errors.ts` | Classification erreurs (unwrapCause, isInvalidApiKey, isQuotaExhausted) |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider (Google + OpenAI) |
| `src/main/llm/file-operations.ts` | Parser blocs `file:create/modify/delete` |
| `src/main/db/schema.ts` | 15 tables Drizzle (dont mcp_servers, memory_fragments) |
| `src/main/services/workspace.service.ts` | Scan, read/write/delete, securite, .coworkignore |
| `src/main/services/file-watcher.service.ts` | Chokidar wrapper |
| `src/main/services/tts.service.ts` | TTS OpenAI (MP3) + Google (PCM→WAV) |
| `src/main/services/scheduler.service.ts` | Timers (setTimeout/setInterval), lifecycle |
| `src/main/services/task-executor.ts` | Execution LLM programmatique |
| `src/main/services/credential.service.ts` | Wrapper safeStorage |
| `src/main/services/backup.service.ts` | Backup CRUD (path validation, trash) |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge ~84 methodes |
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
| `components/settings/SettingsView.tsx` | 8 tabs (General, Apparence, API, Modele, Audio, Raccourcis, Donnees, Sauvegardes) |
| `components/workspace/WorkspacePanel.tsx` | Panneau droit collapsible, FileTree + FilePanel |
| `components/common/CommandPalette.tsx` | Cmd+K — recherche globale |

## Renderer — Stores

| Fichier | Role |
|---------|------|
| `stores/settings.store.ts` | Persist localStorage : theme, font, density, temperature, maxTokens, topP, thinkingEffort, ttsProvider, favoriteModelIds |
| `stores/messages.store.ts` | Messages conversation active, ToolCallDisplay |
| `stores/ui.store.ts` | ViewMode, isStreaming, commandPalette, settingsTab |
| `stores/conversations.store.ts` | CRUD conversations (projectId, roleId) |
| `stores/providers.store.ts` | Providers + models + selectModel() |
| `stores/workspace.store.ts` | rootPath, tree, attachedFiles, isPanelOpen |
| `stores/roles.store.ts` | Roles, activeRoleId, activeSystemPrompt |
| `stores/tasks.store.ts` | Taches planifiees (DB-backed, pas persist) |
| `stores/mcp.store.ts` | Serveurs MCP — CRUD, toggle, start/stop/restart, status events |

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
| `specs/feature-mcp-integration.md` | Spec MCP (implementee session 18-19) |
| `src/main/window.ts` | BrowserWindow config (sandbox, CSP), shell.openExternal avec confirmation dialog |
| `src/main/llm/attachments.ts` | Validation attachments (extension, taille, confinement path userData+workspace) |
