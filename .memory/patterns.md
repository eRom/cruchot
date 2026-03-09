# Patterns — Multi-LLM Desktop

**Dernière mise à jour** : 2026-03-09

## Conventions de nommage

- **Fichiers** : kebab-case (`credential.service.ts`, `openai.adapter.ts`)
- **Composants React** : PascalCase (`MessageItem.tsx`, `InputZone.tsx`)
- **Stores Zustand** : `[domaine].store.ts` (ex: `conversations.store.ts`)
- **IPC handlers** : `[domaine].ipc.ts` (ex: `chat.ipc.ts`)
- **DB queries** : `[domaine].ts` dans `db/queries/` (ex: `messages.ts`)
- **LLM** : plus d'adapters custom — Vercel AI SDK (`router.ts`, `providers.ts`, `cost-calculator.ts`, `image.ts`)

## Patterns architecturaux

### LLM — Vercel AI SDK Pattern
Plus d'adapters custom — le AI SDK fournit l'abstraction :
- `streamText()` pour le chat streaming (remplace `LLMAdapter.streamChat`)
- `generateImage()` pour la génération d'images (Gemini uniquement)
- `onChunk` callback pour forward IPC des chunks normalisés
- `onFinish` callback pour sauvegarde DB + calcul coûts
- `abortSignal` pour annulation
- `providerOptions` pour features spécifiques (ex: Anthropic thinking)
- `getModel(provider, modelId)` — routeur simple dans `router.ts`
- Coûts calculés via table `PRICING` dans `cost-calculator.ts`

### IPC Pattern
- Main : `ipcMain.handle('domaine:action', handler)` — request/response
- Main : `webContents.send('domaine:event', data)` — streaming events
- Preload : `contextBridge.exposeInMainWorld('api', { ... })` — bridge typé
- Renderer : `window.api.methodName(payload)` — appel typé

### Zustand Store Pattern
- Slices composables via `StateCreator`
- Middleware `persist` uniquement pour settings
- Middleware `subscribeWithSelector` pour les side-effects
- Pas de middleware sur les slices individuels — uniquement au niveau du store combiné

### Error Classification Pattern
- **Transient** (429, 500, 503) → retry backoff exponentiel + jitter, max 3
- **Fatal** (401, 403) → notification immédiate
- **Actionable** (402, déprécié) → notification avec action

### Data Pattern
- Drizzle ORM avec schema-first
- WAL mode + foreign_keys ON
- Stats pré-agrégées par jour, à la volée pour aujourd'hui
- Fichiers binaires sur filesystem, référence en DB

## Conventions de test

- **Framework** : Vitest (unit + integration)
- **E2E** : Playwright
- **Structure** : `__tests__/` au même niveau que le code testé
- **Coverage** : v8, objectif 80% main / 60% renderer

## Conventions projet

- **Suppression** : toujours `trash` au lieu de `rm` (macOS)
- **Langue** : communication en français, code en anglais
- **Commits** : pas de commit sans demande explicite de Romain
- **UI Design** : skill `document-skills:frontend-design` systématique sur TOUS les composants UI visibles
- **Lancement team** : `cat team.md | claude` dans un tmux — le fichier est autonome

## Orchestration multi-agents

- **P0** : leader seul (séquentiel, 20 tâches)
- **P1** : 4 agents parallèles en worktree (`adapters`, `features-main`, `features-ui`, `features-rich`)
- **P2** : 3 agents parallèles (`voice-a11y`, `data-infra`, `ux-polish`)
- **Sync points** : après P0, après P1a, après P1b, après P2 — avec validation `tsc + vitest + npm run dev`
- **Modèle agents** : Claude Opus (`claude-opus-4-6`)
