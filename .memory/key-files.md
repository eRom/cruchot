# Fichiers cles — Multi-LLM Desktop

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Lifecycle Electron, auto-updater, protocol `local-image://` (allowlist securise) |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText, chunks IPC, thinking, cost, tools multi-step |
| `src/main/ipc/index.ts` | Registre IPC + blocage `multi-llm:apikey:*` dans settings |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations, filtre projet, roles |
| `src/main/ipc/images.ipc.ts` | Generation images — save fichier + DB |
| `src/main/ipc/roles.ipc.ts` | CRUD roles (Zod) |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts (Zod) |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace |
| `src/main/ipc/scheduled-tasks.ipc.ts` | CRUD taches planifiees (Zod discriminatedUnion) |
| `src/main/ipc/tts.ipc.ts` | TTS synthesize + getAvailableProviders |
| `src/main/ipc/statistics.ipc.ts` | 5 handlers stats (tous avec param `days`) |
| `src/main/ipc/files.ipc.ts` | openInOS/showInFolder securises (allowlist + extension blocklist) |
| `src/main/llm/router.ts` | Routeur getModel() — AI SDK |
| `src/main/llm/registry.ts` | 11 providers, modeles (text + image), `isImageModel()` |
| `src/main/llm/thinking.ts` | Mapping effort → providerOptions par provider |
| `src/main/llm/workspace-tools.ts` | 4 outils AI SDK : bash, readFile, writeFile, listFiles |
| `src/main/llm/errors.ts` | Classification erreurs (unwrapCause, isInvalidApiKey, isQuotaExhausted) |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider (Google + OpenAI) |
| `src/main/llm/file-operations.ts` | Parser blocs `file:create/modify/delete` |
| `src/main/db/schema.ts` | 13 tables Drizzle |
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
| `src/preload/index.ts` | contextBridge ~71 methodes |
| `src/preload/types.ts` | Types partages, DTOs |

## Renderer — Composants cles

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Routing ViewMode, shortcuts, onboarding |
| `components/chat/ChatView.tsx` | Message list + WorkspacePanel, auto-open workspace |
| `components/chat/InputZone.tsx` | Saisie, mode texte/image, pills (Thinking/Role/Prompt), FileReference |
| `components/chat/MessageItem.tsx` | Markdown, images, ReasoningBlock, ToolCallBlock, FileOperationCards, footer |
| `components/chat/ModelSelector.tsx` | Liste plate 2 sections, filtre favoris |
| `components/chat/MarkdownRenderer.tsx` | react-markdown + Shiki + KaTeX + Mermaid |
| `components/layout/Sidebar.tsx` | Drag zone, ProjectSelector, ConversationList, nav 8 vues |
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
| `specs/feature-mcp-integration.md` | Spec MCP (prochaine feature) |
