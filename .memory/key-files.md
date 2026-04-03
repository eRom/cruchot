# Fichiers cles — Multi-LLM Desktop
> Derniere mise a jour : 2026-04-03 (S54)

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
| `src/main/llm/tools/index.ts` | Assembleur 8 tools + pipeline permissions wrapping |
| `src/main/llm/tools/shared.ts` | Constantes, validation path/fichiers, TOCTOU cache |
| `src/main/llm/tools/bash.ts` | Tool bash (execSandboxed) |
| `src/main/llm/tools/file-read.ts` | Tool readFile (+ TOCTOU mtime update) |
| `src/main/llm/tools/file-write.ts` | Tool writeFile |
| `src/main/llm/tools/file-edit.ts` | Tool FileEdit (remplacement string, TOCTOU check) |
| `src/main/llm/tools/list-files.ts` | Tool listFiles |
| `src/main/llm/tools/grep.ts` | Tool GrepTool (regex search Node.js) |
| `src/main/llm/tools/glob.ts` | Tool GlobTool (pattern matching minimatch) |
| `src/main/llm/tools/web-fetch.ts` | Tool WebFetchTool (fetch + turndown HTML→MD) |
| `src/main/llm/tools/context.ts` | buildWorkspaceContextBlock + WORKSPACE_TOOLS_PROMPT |
| `src/main/llm/bash-security.ts` | 23 security checks + buildSafeEnv + wrapCommand |
| `src/main/llm/permission-engine.ts` | evaluatePermission (deny>allow>ask>fallback) + session approvals |
| `src/main/llm/library-prompt.ts` | Injection library-context XML |
| `src/main/llm/memory-prompt.ts` | Injection semantic-memory XML |
| `src/main/llm/episode-prompt.ts` | Construction bloc XML `<user-profile>` (tri confidence * log(occ+1), cap 100) |
| `src/main/services/episode-extractor.service.ts` | Extraction LLM episodique singleton (generateText → JSON actions) |
| `src/main/services/episode-trigger.service.ts` | Trigger service singleton (switch conv / idle 5min / quit), guard < 4 messages |
| `src/main/ipc/episode.ipc.ts` | 7 handlers IPC episodes (Zod) |
| `src/main/db/queries/episodes.ts` | CRUD episodes SQLite |
| `src/main/llm/errors.ts` | Classification erreurs |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout |
| `src/main/llm/image.ts` | Generation images multi-provider |
| `src/main/ipc/permissions.ipc.ts` | 4 handlers permissions CRUD (Zod) |
| `src/main/db/schema.ts` | 27 tables Drizzle |
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
| `src/main/services/ocr.service.ts` | OCR Mistral (PDF/DOCX/PPTX/images) singleton |
| `src/main/services/vcr-recorder.service.ts` | VCR : ecriture NDJSON temps-reel, 14 event types |
| `src/main/services/vcr-anonymizer.service.ts` | VCR : masquage PII (chemins, tokens, IPs, emails) |
| `src/main/services/vcr-html-exporter.service.ts` | VCR : generation HTML standalone + injection template |
| `src/main/services/vcr-event-bus.ts` | VCR : TypedEventEmitter centralise |
| `src/main/ipc/vcr.ipc.ts` | VCR : handlers vcr:start/stop/status (Zod) |
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
| `App.tsx` | Routing 9 vues (chat + 8 lazy), Cmd+U customize, Cmd+F search |
| `chat/ChatView.tsx` | Message list + RightPanel + WorkspacePanel + ToolApprovalBanner |
| `chat/ToolApprovalBanner.tsx` | Banner approbation tool (toast 60s, 3 boutons) |
| `chat/InputZone.tsx` | Saisie, @mentions, slash commands, drag & drop |
| `chat/right-panel/RightPanel.tsx` | 7 sections (Params, Dossier, Options, Outils, MCP, Remote, VCR) |
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
| `layout/TopBar.tsx` | Drag region macOS + toggles sidebar/right panel |
| `layout/Sidebar.tsx` | Nav (Chat/Taches/Arena), projets, conversations (300px) |
| `arena/ArenaView.tsx` | Layout Arena (colonnes + VS + vote) |
| `brigade/BrigadeView.tsx` | Grille BardaCards, import/preview |
| `workspace/WorkspacePanel.tsx` | FileTree + FilePanel |
| `customize/CustomizeView.tsx` | 7 onglets (Prompts, Roles, Commands, Memory, Libraries, MCP, Brigade) |
| `memory/ProfileTab.tsx` | Onglet Profil dans MemoryView (model selector + liste episodes) |
| `common/CommandPalette.tsx` | Cmd+K recherche globale |
| `search/SearchView.tsx` | Vue recherche FTS5 plein texte (CMD+F, filtres role/projet, prefix matching) |
| `chat/VcrBadge.tsx` | Badge REC clignotant dans ContextWindowIndicator |
| `chat/right-panel/VcrSection.tsx` | Section VCR Right Panel (Record/Stop + stats) |
| `stores/vcr.store.ts` | Zustand store VCR (isRecording, startRecording, stopRecording) |
| `stores/episode.store.ts` | Zustand store episodes (liste, CRUD, extraction manuelle) |

## Stores & Hooks

| Fichier | Role |
|---------|------|
| `stores/conversations.store.ts` | Conversations CRUD + favorites + arena |
| `stores/arena.store.ts` | Store Arena dedie |
| `stores/settings.store.ts` | Persist localStorage |
| `stores/messages.store.ts` | Messages + getConversationMessages() |
| `settings/PermissionsSettings.tsx` | Onglet Settings CRUD regles permissions |
| `stores/ui.store.ts` | ViewMode, openPanel, settingsTab, customizeTab, draftContent, pendingApproval |
| `stores/barda.store.ts` | Bardas + disabledNamespaces |
| `stores/providers.store.ts` | Models + getSelectedModel() |
| `stores/workspace.store.ts` | rootPath, tree, attachedFiles |
| `stores/library.store.ts` | Libraries + activeLibraryId |
| `hooks/useStreaming.ts` | Ecoute chat:chunk |
| `hooks/useArenaStreaming.ts` | Ecoute arena:chunk:left/right |
| `hooks/useFileMention.ts` | Detection @mention |
| `hooks/useSlashCommands.ts` | Detection slash, resolution |
