# Fichiers cles — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-23 (S44)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Lifecycle, auto-updater, protocol local-image:// |
| `src/main/ipc/chat.ipc.ts` | Chat handler, streamText, library retrieval |
| `src/main/ipc/index.ts` | Registre IPC, ALLOWED_SETTING_KEYS |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations (Zod) |
| `src/main/ipc/workspace.ipc.ts` | Handlers workspace |
| `src/main/ipc/mcp.ipc.ts` | 12 handlers MCP (Zod) |
| `src/main/ipc/remote.ipc.ts` | Handlers Remote Telegram |
| `src/main/ipc/remote-server.ipc.ts` | Handlers Remote Web |
| `src/main/ipc/slash-commands.ipc.ts` | Handlers slash commands (Zod) |
| `src/main/ipc/library.ipc.ts` | 15 handlers referentiels RAG (Zod) |
| `src/main/ipc/arena.ipc.ts` | 5 handlers Arena + dual streaming |
| `src/main/ipc/barda.ipc.ts` | 5 handlers Barda + path validation |
| `src/main/ipc/summary.ipc.ts` | Summary one-shot generateText |
| `src/main/ipc/data.ipc.ts` | Cleanup + factory reset |
| `src/main/ipc/files.ipc.ts` | Read/save securises, isPathAllowed |
| `src/main/ipc/prompt-optimizer.ipc.ts` | Prompt optimize (Zod) |
| `src/main/ipc/statistics.ipc.ts` | Stats handlers |
| `src/main/ipc/images.ipc.ts` | Generation images |
| `src/main/ipc/roles.ipc.ts` | CRUD roles |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts |
| `src/main/ipc/scheduled-tasks.ipc.ts` | CRUD taches planifiees |
| `src/main/ipc/tts.ipc.ts` | TTS synthesize |
| `src/main/llm/router.ts` | Routeur getModel() AI SDK |
| `src/main/llm/registry.ts` | 11 providers, modeles text + image |
| `src/main/llm/thinking.ts` | providerOptions par provider |
| `src/main/llm/conversation-tools.ts` | 4 tools AI SDK (bash Seatbelt, readFile, writeFile, listFiles) |
| `src/main/llm/library-prompt.ts` | Injection library-context XML |
| `src/main/llm/memory-prompt.ts` | Injection semantic-memory XML |
| `src/main/llm/errors.ts` | Classification erreurs |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider |
| `src/main/db/schema.ts` | 25 tables Drizzle |
| `src/main/db/queries/cleanup.ts` | Bulk delete, ordre FK strict |
| `src/main/db/queries/bardas.ts` | CRUD bardas + namespace cleanup |
| `src/main/db/queries/arena.ts` | CRUD arena_matches + stats |
| `src/main/db/queries/libraries.ts` | CRUD libraries + sources + chunks |
| `src/main/db/queries/slash-commands.ts` | CRUD + seed builtins |
| `src/main/commands/builtin.ts` | 8 builtins + RESERVED_COMMAND_NAMES |
| `src/main/services/library.service.ts` | LibraryService singleton (~500 lignes) |
| `src/main/services/library-embedding.service.ts` | Dual embedding local/Google |
| `src/main/services/mcp-manager.service.ts` | MCP lifecycle singleton |
| `src/main/services/telegram-bot.service.ts` | Remote Telegram singleton |
| `src/main/services/remote-server.service.ts` | Remote Web singleton |
| `src/main/services/workspace.service.ts` | Scan, read/write/delete |
| `src/main/services/credential.service.ts` | Wrapper safeStorage |
| `src/main/services/qdrant-memory.service.ts` | Memoire semantique singleton |
| `src/main/services/qdrant-process.ts` | Lifecycle binaire Qdrant |
| `src/main/services/embedding.service.ts` | Pipeline HuggingFace (384d) |
| `src/main/services/seatbelt.ts` | Wrapper sandbox-exec macOS |
| `src/main/services/barda-parser.service.ts` | Parseur Markdown barda |
| `src/main/services/barda-import.service.ts` | Import atomique barda |
| `src/main/window.ts` | BrowserWindow config, CSP |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge ~150 methodes |
| `src/preload/types.ts` | Types partages, DTOs |

## Renderer — Composants cles

| Fichier | Role |
|---------|------|
| `App.tsx` | Routing 14 vues, lazy-loaded |
| `chat/ChatView.tsx` | Message list + RightPanel + WorkspacePanel |
| `chat/InputZone.tsx` | Saisie, @mentions, slash commands, drag & drop |
| `chat/right-panel/RightPanel.tsx` | 6 sections (Params, Dossier, Options, Outils, MCP, Remote) |
| `chat/right-panel/ParamsSection.tsx` | Model, Thinking, Role, tokens/cout |
| `chat/right-panel/WorkspaceSection.tsx` | Dossier de travail par conversation |
| `chat/right-panel/OptionsSection.tsx` | Web Search, Library Select |
| `chat/right-panel/McpSection.tsx` | Serveurs MCP + Switch |
| `chat/right-panel/ToolsSection.tsx` | PromptPicker, Resume, Ameliorer, Fork |
| `chat/right-panel/RemoteSection.tsx` | Telegram + Web switches |
| `chat/MessageItem.tsx` | Markdown, reasoning, tools, React.memo |
| `chat/ModelSelector.tsx` | Liste plate, filtre favoris |
| `chat/MarkdownRenderer.tsx` | react-markdown + Shiki + KaTeX + Mermaid |
| `chat/ContextWindowIndicator.tsx` | Barre tokens + badges |
| `libraries/LibrariesView.tsx` | CRUD referentiels |
| `layout/Sidebar.tsx` | Nav, projets, conversations |
| `arena/ArenaView.tsx` | Layout Arena (colonnes + VS + vote) |
| `brigade/BrigadeView.tsx` | Grille BardaCards, import/preview |
| `workspace/WorkspacePanel.tsx` | FileTree + FilePanel |
| `common/CommandPalette.tsx` | Cmd+K recherche globale |

## Stores & Hooks

| Fichier | Role |
|---------|------|
| `stores/conversations.store.ts` | Conversations CRUD + favorites + arena |
| `stores/arena.store.ts` | Store Arena dedie |
| `stores/settings.store.ts` | Persist localStorage |
| `stores/messages.store.ts` | Messages + getConversationMessages() |
| `stores/ui.store.ts` | ViewMode, openPanel, draftContent |
| `stores/barda.store.ts` | Bardas + disabledNamespaces |
| `stores/providers.store.ts` | Models + getSelectedModel() |
| `stores/workspace.store.ts` | rootPath, tree, attachedFiles |
| `stores/library.store.ts` | Libraries + activeLibraryId |
| `hooks/useStreaming.ts` | Ecoute chat:chunk |
| `hooks/useArenaStreaming.ts` | Ecoute arena:chunk:left/right |
| `hooks/useFileMention.ts` | Detection @mention |
| `hooks/useSlashCommands.ts` | Detection slash, resolution |
