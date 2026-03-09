# Fichiers cles — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-09 (session 3)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Entry point Electron, app lifecycle, auto-updater init |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText() AI SDK, forward chunks IPC |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations + filtre par projet + setConversationProject |
| `src/main/ipc/index.ts` | Registre central de tous les IPC handlers |
| `src/main/llm/router.ts` | Routeur getModel() — Vercel AI SDK |
| `src/main/llm/registry.ts` | Registry des providers et modeles disponibles |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout par message |
| `src/main/db/schema.ts` | Schema Drizzle (11 tables) — projects a systemPrompt, defaultModelId, color |
| `src/main/db/queries/conversations.ts` | Queries conversations — createConversation(title, projectId), getConversationsByProject(), setConversationProject() |
| `src/main/services/credential.service.ts` | Wrapper safeStorage pour cles API |
| `src/main/ipc/prompts.ipc.ts` | CRUD prompts — Zod validation, 7 handlers |
| `src/main/db/queries/prompts.ts` | Queries prompts — getAllPrompts, searchPrompts, CRUD |
| `src/main/window.ts` | Config BrowserWindow — titleBarStyle hiddenInset, trafficLights |
| `src/main/services/updater.service.ts` | electron-updater service |

## Preload

| Fichier | Role |
|---------|------|
| `src/preload/index.ts` | contextBridge — expose ~50 methodes window.api |
| `src/preload/types.ts` | Types partages ElectronAPI, tous les DTO (ProjectInfo, ConversationInfo, etc.) |

## Renderer — Composants critiques

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Racine React — routing ViewMode, keyboard shortcuts, onboarding |
| `src/renderer/src/components/chat/InputZone.tsx` | Zone de saisie — cree conversation avec projectId actif, VoiceInput, lit model params depuis settings store |
| `src/renderer/src/components/chat/MessageItem.tsx` | Rendu d'un message — markdown, TTS AudioPlayer, metadata |
| `src/renderer/src/components/chat/MessageList.tsx` | Liste virtualisee — applique fontSizePx, density, messageWidth depuis settings store |
| `src/renderer/src/components/chat/ModelSelector.tsx` | Select modele groupe par provider (format composite `providerId::modelId`) |
| `src/renderer/src/components/layout/Sidebar.tsx` | Sidebar — drag zone, "Nouvelle discussion", ProjectSelector, ConversationList, nav footer (6 vues) |
| `src/renderer/src/components/layout/AppLayout.tsx` | Layout racine — sidebar + main avec drag zone title bar |
| `src/renderer/src/components/conversations/ConversationItem.tsx` | Item conversation — rename inline, delete avec confirmation |
| `src/renderer/src/components/projects/ProjectsView.tsx` | Vue Projets — grille de cartes + formulaire inline (create/edit), pas de dialog |
| `src/renderer/src/components/projects/ProjectForm.tsx` | Formulaire projet inline (nom, couleur, description, systemPrompt, modele obligatoire) |
| `src/renderer/src/components/projects/ProjectSelector.tsx` | Dropdown sidebar — switch projet rapide, applique defaultModelId |
| `src/renderer/src/components/prompts/PromptsView.tsx` | Vue Prompts — grille + form inline, types complet/complement, tags, variables |
| `src/renderer/src/components/settings/SettingsView.tsx` | 7 tabs : General, Apparence, Cles API, Modele, Raccourcis, Donnees, Sauvegardes |
| `src/renderer/src/components/settings/ModelSettings.tsx` | Temperature, maxTokens, topP — presets (Creatif/Equilibre/Precis), persistes globalement |
| `src/renderer/src/components/settings/AppearanceSettings.tsx` | Font size, density, message width — persistes via Zustand |
| `src/renderer/src/components/common/CommandPalette.tsx` | Cmd+K — recherche globale (actions, projets, TOUTES conversations) |

## Renderer — Stores

| Fichier | Role |
|---------|------|
| `src/renderer/src/stores/ui.store.ts` | ViewMode (chat/settings/statistics/images/projects/prompts), isStreaming, commandPalette |
| `src/renderer/src/stores/prompts.store.ts` | CRUD prompts — Prompt a type complet/complement, tags, variables |
| `src/renderer/src/stores/conversations.store.ts` | CRUD conversations — Conversation a projectId optionnel |
| `src/renderer/src/stores/projects.store.ts` | CRUD projets — Project a systemPrompt, defaultModelId, color |
| `src/renderer/src/stores/providers.store.ts` | Providers + models + selectModel(providerId, modelId) |
| `src/renderer/src/stores/settings.store.ts` | Settings persistees (theme, fontSizePx, density, messageWidth, sidebar, temperature, maxTokens, topP) |
| `src/renderer/src/stores/messages.store.ts` | Messages de la conversation active |

## Renderer — Hooks

| Fichier | Role |
|---------|------|
| `src/renderer/src/hooks/useStreaming.ts` | Ecoute chat:chunk IPC, met a jour messages store en temps reel |
| `src/renderer/src/hooks/useInitApp.ts` | Charge conversations + providers + models au demarrage |
| `src/renderer/src/hooks/useKeyboardShortcuts.ts` | Cmd+N, Cmd+K, Cmd+virgule, Escape |

## Config

| Fichier | Role |
|---------|------|
| `electron.vite.config.ts` | Config build main + preload + renderer |
| `electron-builder.yml` | Config packaging multi-OS |
| `CLAUDE.md` | Best practices stack + regles projet |
