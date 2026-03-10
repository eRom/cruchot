# Fichiers cles — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 11)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Entry point Electron, app lifecycle, auto-updater, custom protocol `local-image://` |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText() AI SDK, forward chunks IPC, providerOptions thinking, reasoning persistence, cost calc, model + role persistence, workspace file context injection, file operations parsing |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations + filtre par projet + setConversationProject + setConversationRole + deleteAllConversations |
| `src/main/ipc/index.ts` | Registre central de tous les IPC handlers |
| `src/main/llm/router.ts` | Routeur getModel() — Vercel AI SDK |
| `src/main/llm/registry.ts` | Registry des providers et modeles (text + image) + `isImageModel()` helper |
| `src/main/llm/types.ts` | `ModelDefinition` (avec `type`, `supportsThinking`), `ProviderDefinition`, `ModelPricing` |
| `src/main/llm/thinking.ts` | Mapper effort → providerOptions par provider (Anthropic, OpenAI, Google, xAI) |
| `src/main/llm/image.ts` | Generation d'images multi-provider (Google Gemini + OpenAI GPT Image) |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout par message |
| `src/main/ipc/images.ipc.ts` | Handler images:generate — genere, sauve fichier + DB images + DB messages |
| `src/main/db/schema.ts` | Schema Drizzle (11 tables) — projects a systemPrompt, defaultModelId, color, workspacePath |
| `src/main/db/queries/conversations.ts` | Queries conversations — CRUD + getConversationsByProject() + updateConversationModel() + updateConversationRole() + deleteAllConversations() |
| `src/main/db/queries/roles.ts` | Queries roles — CRUD + seedBuiltinRoles() + deleteRole() (FK cleanup) |
| `src/main/ipc/roles.ipc.ts` | CRUD roles — Zod validation, 6 handlers (getAll, get, create, update, delete, seed) |
| `src/main/services/credential.service.ts` | Wrapper safeStorage pour cles API |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts — Zod validation, 7 handlers |
| `src/main/db/queries/prompts.ts` | Queries prompts — getAllPrompts, searchPrompts, CRUD |
| `src/main/window.ts` | Config BrowserWindow — titleBarStyle hiddenInset, trafficLights |
| `src/main/db/queries/statistics.ts` | Queries stats — getDailyStats, getProviderStats, getModelStats, getProjectStats, getGlobalStats (toutes avec param `days`) |
| `src/main/ipc/statistics.ipc.ts` | 5 handlers stats — daily, providers, models, total, projects — tous avec param `days` |
| `src/main/services/updater.service.ts` | electron-updater service |
| `src/main/services/workspace.service.ts` | Workspace core — scan tree, read/write/delete, securite (path traversal, sensitive files), .coworkignore, language detection |
| `src/main/services/file-watcher.service.ts` | Chokidar wrapper — watch workspace, forward events vers renderer |
| `src/main/ipc/workspace.ipc.ts` | 8 handlers workspace — selectFolder, open, close, getTree, readFile, writeFile, deleteFile, getInfo |
| `src/main/llm/file-operations.ts` | Parser blocs ```file:create/modify/delete:path``` dans les reponses LLM, retourne ParsedFileOperation[] |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge — expose ~60 methodes window.api (dont 10 workspace + 2 listeners) |
| `src/preload/types.ts` | Types partages ElectronAPI, tous les DTO, ThinkingEffort, StreamChunk, FileNode, FileOperation, WorkspaceFileContext |

## Renderer — Composants critiques

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Racine React — routing ViewMode, keyboard shortcuts, onboarding |
| `src/renderer/src/components/chat/InputZone.tsx` | Zone de saisie — mode texte + mode image, ThinkingSelector, RoleSelector, VoiceInput, PromptPicker, FileReference chips, workspace toggle |
| `src/renderer/src/components/chat/ChatView.tsx` | Zone A — message list + empty state + WorkspacePanel, auto-open workspace, file watcher sync |
| `src/renderer/src/components/chat/MessageItem.tsx` | Rendu message — markdown, images, ReasoningBlock, FileOperationCards, footer (audio+copier a gauche, model+cout+temps a droite) |
| `src/renderer/src/components/chat/ThinkingSelector.tsx` | Dropdown pill effort de reflexion (off/low/medium/high), accent violet |
| `src/renderer/src/components/chat/AspectRatioSelector.tsx` | Chips inline pour ratio d'image (1:1, 16:9, 9:16, 4:3, 3:4) |
| `src/renderer/src/components/chat/MessageList.tsx` | Liste virtualisee — applique fontSizePx, density, messageWidth depuis settings store |
| `src/renderer/src/components/chat/ModelSelector.tsx` | Select modele — liste plate 2 sections (texte/images), filtre par favoris |
| `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Barre de progression tokens + cout total conversation |
| `src/renderer/src/components/chat/MarkdownRenderer.tsx` | Rendu Markdown — react-markdown + Shiki syntax highlighting + KaTeX + Mermaid |
| `src/renderer/src/components/layout/Sidebar.tsx` | Sidebar — drag zone, "Nouvelle discussion", ProjectSelector, ConversationList, nav footer (7 vues dont Roles) |
| `src/renderer/src/components/layout/AppLayout.tsx` | Layout racine — sidebar + main avec drag zone title bar |
| `src/renderer/src/components/conversations/ConversationItem.tsx` | Item conversation — rename inline, delete confirmation, boutons hover absolus avec degrade |
| `src/renderer/src/components/conversations/ConversationList.tsx` | Liste groupee par date (Aujourd'hui/Hier/7j/Plus ancien) — div overflow au lieu de Radix ScrollArea |
| `src/renderer/src/components/settings/DataSettings.tsx` | Tab Donnees — export/import JSON, deleteAllConversations cable |
| `src/renderer/src/components/projects/ProjectsView.tsx` | Vue Projets — grille de cartes + formulaire inline (create/edit), pas de dialog |
| `src/renderer/src/components/projects/ProjectForm.tsx` | Formulaire projet inline (nom, couleur, description, systemPrompt, modele obligatoire, workspacePath) |
| `src/renderer/src/components/projects/ProjectSelector.tsx` | Dropdown sidebar — switch projet rapide, applique defaultModelId |
| `src/renderer/src/components/prompts/PromptsView.tsx` | Vue Prompts — grille + form inline, types complet/complement, tags, variables |
| `src/renderer/src/components/settings/SettingsView.tsx` | 7 tabs : General, Apparence, Cles API, Modele, Raccourcis, Donnees, Sauvegardes — consomme settingsTab du ui.store |
| `src/renderer/src/components/settings/ModelSettings.tsx` | Conteneur 3 sous-onglets : Modeles LLM, Modeles Images, Parametres |
| `src/renderer/src/components/settings/ModelTableLLM.tsx` | Table modeles texte groupes par provider — prix, contexte, badge think, etoile favori |
| `src/renderer/src/components/settings/ModelTableImages.tsx` | Table modeles image — provider, prix, etoile favori |
| `src/renderer/src/components/settings/AppearanceSettings.tsx` | Font size, density, message width — persistes via Zustand |
| `src/renderer/src/components/statistics/StatsView.tsx` | Vue Statistiques — 6 cards, 4 graphiques (line, 2 pie, bar), selecteur de periode |
| `src/renderer/src/components/statistics/StatCard.tsx` | Composant carte stat individuelle (titre, valeur, icone, trend optionnel) |
| `src/renderer/src/components/roles/RolesView.tsx` | Vue Roles — grille + form inline, CRUD complet, tags, variables, roles builtin non-supprimables |
| `src/renderer/src/components/roles/RoleSelector.tsx` | Pill selector role dans InputZone — shadcn Select, verrouillage, variables, role projet virtuel |
| `src/renderer/src/components/common/CommandPalette.tsx` | Cmd+K — recherche globale (actions, projets, roles, workspace, TOUTES conversations) |
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
| `src/renderer/src/stores/settings.store.ts` | Settings persistees (theme, fontSizePx, density, messageWidth, sidebar, temperature, maxTokens, topP, thinkingEffort, favoriteModelIds) |
| `src/renderer/src/stores/messages.store.ts` | Messages de la conversation active |
| `src/renderer/src/stores/stats.store.ts` | Stats — dailyStats, providerStats, modelStats, projectStats, globalStats, selectedPeriod, auto-reload |
| `src/renderer/src/stores/workspace.store.ts` | Workspace — rootPath, tree, filePreview, isPanelOpen, attachedFiles, openWorkspace/closeWorkspace/refreshTree/togglePanel |

## Renderer — Hooks

| Fichier | Role |
|---------|------|
| `src/renderer/src/hooks/useStreaming.ts` | Ecoute chat:chunk IPC, met a jour messages store en temps reel |
| `src/renderer/src/hooks/useInitApp.ts` | Charge conversations + providers + models au demarrage |
| `src/renderer/src/hooks/useKeyboardShortcuts.ts` | Cmd+N, Cmd+K, Cmd+M, Cmd+B (workspace toggle), Cmd+virgule, Escape |

## Config

| Fichier | Role |
|---------|------|
| `electron.vite.config.ts` | Config build main + preload + renderer |
| `electron-builder.yml` | Config packaging multi-OS |
| `CLAUDE.md` | Best practices stack + regles projet |
