# Fichiers cles — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 5)

## Main process

| Fichier | Role |
|---------|------|
| `src/main/index.ts` | Entry point Electron, app lifecycle, auto-updater, custom protocol `local-image://` |
| `src/main/ipc/chat.ipc.ts` | Handler chat:send — streamText() AI SDK, forward chunks IPC, providerOptions thinking, reasoning persistence |
| `src/main/ipc/conversations.ipc.ts` | CRUD conversations + filtre par projet + setConversationProject |
| `src/main/ipc/index.ts` | Registre central de tous les IPC handlers |
| `src/main/llm/router.ts` | Routeur getModel() — Vercel AI SDK |
| `src/main/llm/registry.ts` | Registry des providers et modeles (text + image) + `isImageModel()` helper |
| `src/main/llm/types.ts` | `ModelDefinition` (avec `type`, `supportsThinking`), `ProviderDefinition`, `ModelPricing` |
| `src/main/llm/thinking.ts` | Mapper effort → providerOptions par provider (Anthropic, OpenAI, Google, xAI) |
| `src/main/llm/image.ts` | Generation d'images multi-provider (Google Gemini + OpenAI GPT Image) |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul cout par message |
| `src/main/ipc/images.ipc.ts` | Handler images:generate — genere, sauve fichier + DB images + DB messages |
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
| `src/preload/types.ts` | Types partages ElectronAPI, tous les DTO, ThinkingEffort, StreamChunk etendu |

## Renderer — Composants critiques

| Fichier | Role |
|---------|------|
| `src/renderer/src/App.tsx` | Racine React — routing ViewMode, keyboard shortcuts, onboarding |
| `src/renderer/src/components/chat/InputZone.tsx` | Zone de saisie — mode texte + mode image, ThinkingSelector, VoiceInput, PromptPicker |
| `src/renderer/src/components/chat/MessageItem.tsx` | Rendu message — markdown, images, ReasoningBlock, footer (audio+copier a gauche, model a droite) |
| `src/renderer/src/components/chat/ThinkingSelector.tsx` | Dropdown pill effort de reflexion (off/low/medium/high), accent violet |
| `src/renderer/src/components/chat/AspectRatioSelector.tsx` | Chips inline pour ratio d'image (1:1, 16:9, 9:16, 4:3, 3:4) |
| `src/renderer/src/components/chat/MessageList.tsx` | Liste virtualisee — applique fontSizePx, density, messageWidth depuis settings store |
| `src/renderer/src/components/chat/ModelSelector.tsx` | Select modele — textGroups par provider + section "Generation d'images" separee |
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
| `src/renderer/src/stores/providers.store.ts` | Providers + models (avec `type: 'text' \| 'image'`) + selectModel(providerId, modelId) |
| `src/renderer/src/stores/settings.store.ts` | Settings persistees (theme, fontSizePx, density, messageWidth, sidebar, temperature, maxTokens, topP, thinkingEffort) |
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
