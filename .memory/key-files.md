# Fichiers cles — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 17 — workspace tools & tool call UI)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Entry point Electron, app lifecycle, auto-updater, custom protocol `local-image://` (securise: allowlist dirs, pas de bypassCSP) |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText() AI SDK, forward chunks IPC, providerOptions thinking, reasoning persistence, cost calc, model + role persistence, workspace file context injection, file operations parsing, workspace tools multi-step (stopWhen), tool call tracking (accumulatedToolCalls) |
| `src/main/llm/workspace-tools.ts` | 3 outils AI SDK workspace (readFile, listFiles, searchInFiles) + WORKSPACE_TOOLS_PROMPT — utilise `inputSchema` (pas `parameters`, AI SDK v6) |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations + filtre par projet + setConversationProject + setConversationRole + deleteAllConversations |
| `src/main/ipc/index.ts` | Registre central de tous les IPC handlers + blocage `multi-llm:apikey:*` dans settings:get/set |
| `src/main/llm/router.ts` | Routeur getModel() — Vercel AI SDK |
| `src/main/llm/registry.ts` | Registry des 11 providers et modeles (text + image) + `isImageModel()` helper |
| `src/main/llm/types.ts` | `ModelDefinition` (avec `type`, `supportsThinking`), `ProviderDefinition`, `ModelPricing` |
| `src/main/llm/thinking.ts` | Mapper effort → providerOptions par provider (Anthropic, OpenAI, Google, xAI, DeepSeek) |
| `src/main/llm/image.ts` | Generation d'images multi-provider (Google Gemini + OpenAI GPT Image) |
| `src/main/llm/errors.ts` | Classification erreurs API (unwrapCause, isInvalidApiKey, isQuotaExhausted) + withRetry backoff |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout par message |
| `src/main/ipc/images.ipc.ts` | Handler images:generate — genere, sauve fichier + DB images + DB messages |
| `src/main/db/schema.ts` | Schema Drizzle (13 tables) — projects a systemPrompt, defaultModelId, color, workspacePath, tts_usage, scheduledTasks |
| `src/main/db/queries/conversations.ts` | Queries conversations — CRUD + getConversationsByProject() + updateConversationModel() + updateConversationRole() + deleteAllConversations() |
| `src/main/db/queries/roles.ts` | Queries roles — CRUD + seedBuiltinRoles() + deleteRole() (FK cleanup) |
| `src/main/ipc/roles.ipc.ts` | CRUD roles — Zod validation, 6 handlers (getAll, get, create, update, delete, seed) |
| `src/main/services/credential.service.ts` | Wrapper safeStorage pour cles API |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts — Zod validation, 7 handlers |
| `src/main/db/queries/prompts.ts` | Queries prompts — getAllPrompts, searchPrompts, CRUD |
| `src/main/window.ts` | Config BrowserWindow — titleBarStyle hiddenInset, trafficLights, devTools: !app.isPackaged |
| `src/main/db/queries/statistics.ts` | Queries stats — getDailyStats, getProviderStats, getModelStats, getProjectStats, getGlobalStats (toutes avec param `days`) |
| `src/main/ipc/statistics.ipc.ts` | 5 handlers stats — daily, providers, models, total, projects — tous avec param `days` |
| `src/main/services/updater.service.ts` | electron-updater service |
| `src/main/services/workspace.service.ts` | Workspace core — scan tree, read/write/delete, securite (path traversal, sensitive files), .coworkignore, language detection |
| `src/main/services/file-watcher.service.ts` | Chokidar wrapper — watch workspace, forward events vers renderer |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace — selectFolder, open, close, getTree, readFile, writeFile, deleteFile, getInfo |
| `src/main/llm/file-operations.ts` | Parser blocs ```file:create/modify/delete:path``` dans les reponses LLM, retourne ParsedFileOperation[] |
| `src/main/services/tts.service.ts` | Service TTS multi-provider — OpenAI (MP3) + Google Gemini (PCM→WAV), pricing, pcmToWav() |
| `src/main/ipc/tts.ipc.ts` | 2 handlers TTS — tts:synthesize (Zod) + tts:getAvailableProviders (check cles API) |
| `src/main/db/queries/tts.ts` | Queries tts_usage — insertTtsUsage, getTtsCostTotal(days?) |
| `src/main/db/queries/scheduled-tasks.ts` | Queries CRUD taches planifiees + computeNextRunAt(), updateTaskRunStatus(), incrementRunCount() |
| `src/main/services/scheduler.service.ts` | Singleton SchedulerService — gestion timers (setTimeout/setInterval), init/stop lifecycle, scheduleAllEnabled() |
| `src/main/services/task-executor.ts` | Execution programmatique LLM — cree conversation, charge role, streamText(), sauve messages + cout, notification Electron |
| `src/main/ipc/scheduled-tasks.ipc.ts` | 7 handlers tasks:* — list, get, create, update, delete, execute, toggle — Zod discriminated union pour scheduleConfig |
| `src/main/ipc/files.ipc.ts` | File operations IPC — isPathAllowed() allowlist, hasDangerousExtension() blocklist, securise openInOS/showInFolder |
| `src/main/services/backup.service.ts` | Backup CRUD — assertPathInBackupsDir() path validation, trash au lieu de unlinkSync |
| `src/main/services/file.service.ts` | File service attachments — path validation corrigee (prefix + path.sep) |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge — expose ~71 methodes window.api (dont 10 workspace, 2 tts, 9 tasks, 2 listeners tasks) |
| `src/preload/types.ts` | Types partages ElectronAPI, tous les DTO, ThinkingEffort, StreamChunk, FileNode, FileOperation, WorkspaceFileContext, TtsProvider, ScheduledTaskInfo, TaskExecutedEvent |

## Renderer — Composants critiques

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Racine React — routing ViewMode, keyboard shortcuts, onboarding |
| `src/renderer/src/components/chat/InputZone.tsx` | Zone de saisie — mode texte + mode image, ThinkingSelector, RoleSelector, VoiceInput, PromptPicker, FileReference chips, workspace toggle |
| `src/renderer/src/components/chat/ChatView.tsx` | Zone A — message list + empty state + WorkspacePanel, auto-open workspace, file watcher sync |
| `src/renderer/src/components/chat/MessageItem.tsx` | Rendu message — markdown, images, ReasoningBlock, ToolCallBlock (cyan, collapsible), FileOperationCards, footer (audio+copier a gauche, model+cout+temps a droite) |
| `src/renderer/src/components/chat/ThinkingSelector.tsx` | Dropdown pill effort de reflexion (off/low/medium/high), accent violet |
| `src/renderer/src/components/chat/AspectRatioSelector.tsx` | Chips inline pour ratio d'image (1:1, 16:9, 9:16, 4:3, 3:4) |
| `src/renderer/src/components/chat/MessageList.tsx` | Liste virtualisee — applique fontSizePx, density, messageWidth depuis settings store |
| `src/renderer/src/components/chat/ModelSelector.tsx` | Select modele — liste plate 2 sections (texte/images), filtre par favoris |
| `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Barre de progression tokens + cout total conversation |
| `src/renderer/src/components/chat/MarkdownRenderer.tsx` | Rendu Markdown — react-markdown + Shiki syntax highlighting + KaTeX + Mermaid |
| `src/renderer/src/components/layout/Sidebar.tsx` | Sidebar — drag zone, "Nouvelle discussion", ProjectSelector, ConversationList, nav footer (8 vues dont Roles et Taches) |
| `src/renderer/src/components/layout/AppLayout.tsx` | Layout racine — sidebar + main avec drag zone title bar |
| `src/renderer/src/components/conversations/ConversationItem.tsx` | Item conversation — rename inline, delete confirmation, boutons hover absolus avec degrade |
| `src/renderer/src/components/conversations/ConversationList.tsx` | Liste groupee par date (Aujourd'hui/Hier/7j/Plus ancien) — div overflow au lieu de Radix ScrollArea |
| `src/renderer/src/components/settings/DataSettings.tsx` | Tab Donnees — export/import JSON, deleteAllConversations cable |
| `src/renderer/src/components/projects/ProjectsView.tsx` | Vue Projets — grille de cartes + formulaire inline (create/edit), pas de dialog |
| `src/renderer/src/components/projects/ProjectForm.tsx` | Formulaire projet inline (nom, couleur, description, systemPrompt, modele obligatoire, workspacePath) |
| `src/renderer/src/components/projects/ProjectSelector.tsx` | Dropdown sidebar — switch projet rapide, applique defaultModelId |
| `src/renderer/src/components/prompts/PromptsView.tsx` | Vue Prompts — grille + form inline, types complet/complement, tags, variables |
| `src/renderer/src/components/settings/SettingsView.tsx` | 8 tabs : General, Apparence, Cles API, Modele, Audio, Raccourcis, Donnees, Sauvegardes — consomme settingsTab du ui.store |
| `src/renderer/src/components/settings/AudioSettings.tsx` | Onglet Audio — select provider TTS (browser/openai/google), bouton tester, section STT placeholder |
| `src/renderer/src/components/settings/ModelSettings.tsx` | Conteneur 3 sous-onglets : Modeles LLM, Modeles Images, Parametres |
| `src/renderer/src/components/settings/ModelTableLLM.tsx` | Table modeles texte groupes par provider — prix, contexte, badge think, etoile favori |
| `src/renderer/src/components/settings/ModelTableImages.tsx` | Table modeles image — provider, prix, etoile favori |
| `src/renderer/src/components/settings/AppearanceSettings.tsx` | Font size, density, message width — persistes via Zustand |
| `src/renderer/src/components/statistics/StatsView.tsx` | Vue Statistiques — 6 cards, 4 graphiques (line, 2 pie, bar), selecteur de periode |
| `src/renderer/src/components/statistics/StatCard.tsx` | Composant carte stat individuelle (titre, valeur, icone, trend optionnel) |
| `src/renderer/src/components/roles/RolesView.tsx` | Vue Roles — grille + form inline, CRUD complet, tags, variables, roles builtin non-supprimables |
| `src/renderer/src/components/roles/RoleSelector.tsx` | Pill selector role dans InputZone — shadcn Select, verrouillage, variables, role projet virtuel |
| `src/renderer/src/components/tasks/TasksView.tsx` | Vue Taches planifiees — grille + form inline, CRUD, toggle, execute, ecoute task:executed |
| `src/renderer/src/components/tasks/TaskCard.tsx` | Carte tache — barre couleur par type (manual=bleu, interval=vert, daily=orange, weekly=violet), toggle, execute, badges |
| `src/renderer/src/components/tasks/TaskForm.tsx` | Formulaire tache — config conditionnelle par scheduleType (interval/daily/weekly), select modele/role/projet |
| `src/renderer/src/components/common/CommandPalette.tsx` | Cmd+K — recherche globale (actions, projets, roles, taches, workspace, TOUTES conversations) |
| `src/renderer/src/components/workspace/WorkspacePanel.tsx` | Panneau droit collapsible (w-80/w-10), toggle PanelRightClose/PanelRightOpen, header + tree + preview |
| `src/renderer/src/components/workspace/FileTree.tsx` | Arbre recursif avec recherche, expand/collapse, icones par extension, right-click attacher |
| `src/renderer/src/components/workspace/FilePanel.tsx` | Preview read-only, breadcrumb, langage/taille footer, bouton attacher |
| `src/renderer/src/components/workspace/FileReference.tsx` | Chip cyan compact pour fichier attache (dans InputZone) |
| `src/renderer/src/components/workspace/FileOperationCard.tsx` | Carte operation fichier (create/modify/delete), preview collapsible, approve/reject |

## Renderer — Stores

| Fichier | Role |
|---------|------|
| `src/renderer/src/stores/ui.store.ts` | ViewMode, isStreaming, commandPalette, settingsTab (navigation directe vers un onglet settings) |
| `src/renderer/src/stores/prompts.store.ts` | CRUD prompts — Prompt a type complet/complement, tags, variables |
| `src/renderer/src/stores/roles.store.ts` | Roles + activeRoleId + activeSystemPrompt — Role a category, tags, variables |
| `src/renderer/src/stores/conversations.store.ts` | CRUD conversations — Conversation a projectId optionnel, roleId optionnel |
| `src/renderer/src/stores/projects.store.ts` | CRUD projets — Project a systemPrompt, defaultModelId, color |
| `src/renderer/src/stores/providers.store.ts` | Providers + models (avec `type: 'text' \| 'image'`) + selectModel(providerId, modelId) |
| `src/renderer/src/stores/settings.store.ts` | Settings persistees (theme, fontSizePx, density, messageWidth, sidebar, temperature, maxTokens, topP, thinkingEffort, ttsProvider, favoriteModelIds) |
| `src/renderer/src/stores/messages.store.ts` | Messages de la conversation active — ToolCallDisplay type, addToolCall/updateLastToolCallStatus actions |
| `src/renderer/src/stores/stats.store.ts` | Stats — dailyStats, providerStats, modelStats, projectStats, globalStats (dont totalTtsCost), selectedPeriod, auto-reload |
| `src/renderer/src/stores/workspace.store.ts` | Workspace — rootPath, tree, filePreview, isPanelOpen, attachedFiles, openWorkspace/closeWorkspace/refreshTree/togglePanel |
| `src/renderer/src/stores/tasks.store.ts` | Taches planifiees — tasks[], setTasks, addTask, updateTask, removeTask, loadTasks (pas de persist, DB-backed) |

## Renderer — Hooks

| Fichier | Role |
|---------|------|
| `src/renderer/src/hooks/useAudioPlayer.ts` | Hook TTS dual-mode : browser (Web Speech) ou cloud (IPC → base64 → Blob → Audio), cache module-level |
| `src/renderer/src/hooks/useStreaming.ts` | Ecoute chat:chunk IPC, met a jour messages store en temps reel — gere tool-call + tool-result chunks |
| `src/renderer/src/hooks/useInitApp.ts` | Charge conversations + providers + models au demarrage |
| `src/renderer/src/hooks/useKeyboardShortcuts.ts` | Cmd+N, Cmd+K, Cmd+M, Cmd+B (workspace toggle), Cmd+virgule, Escape |

## Config

| Fichier | Role |
|---------|------|
| `electron.vite.config.ts` | Config build main + preload + renderer |
| `electron-builder.yml` | Config packaging multi-OS |
| `CLAUDE.md` | Best practices stack + regles projet |
| `SECURITY-2026-03-10.md` | Rapport audit securite initial — 4 vulns critiques (toutes fixees) |
| `SECURITY-2026-03-10-FULL.md` | Audit securite complet 5 axes — score B-, actions prioritaires |

## Renderer — Securite

| Fichier | Role |
|---------|------|
| `src/renderer/src/components/chat/MermaidBlock.tsx` | Rendu Mermaid — securityLevel: 'strict' + DOMPurify sanitize SVG |
| `src/renderer/index.html` | CSP durcie — object-src/base-uri/form-action/frame-src 'none', img-src local-image:, media-src blob: |
