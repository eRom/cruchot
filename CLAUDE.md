# CLAUDE.md — Multi-LLM Desktop

> Stack : Electron 41 + React 19 + TypeScript 5.7 + SQLite (better-sqlite3) + Drizzle ORM + Vercel AI SDK 6

## Regles projet

- App desktop locale, ZERO serveur backend — tout tourne sur la machine
- Mono-utilisateur, pas d'auth
- Donnees 100% locales (SQLite + filesystem), aucune telemetrie
- Cles API jamais dans le renderer — uniquement dans le main process via safeStorage
- Utiliser `trash` au lieu de `rm` pour supprimer des fichiers (macOS corbeille)
- Langue UI : francais par defaut, anglais supporte

## Code Quality

- Always Read a file before using Write or Edit on it. Never skip this step even if you think you know the content.
- When editing a file, ensure old_string context is unique. If the edit fails, widen the context rather than retrying the same string.
- After modifying any IPC handler, preload method, or ElectronAPI type, verify consistency across all 3 layers (main handler, preload bridge, renderer types) before committing.
- InputZone.tsx and Sidebar.tsx are high-churn files. Before modifying them, read the full file first and plan all changes in one pass to avoid repeated edits.
- Before running shell commands that depend on external tools (git, gh, npm), verify the tool is available and the expected state is correct (e.g. `git status` before `git push`).
- After implementing a feature or fixing a bug (3+ files modified), run `/cruchot-audit-code` before committing. The pre-commit hook catches typecheck+test failures, but the skill also checks dangerous patterns and IPC coherence.

## Structure projet (electron-vite)

```
src/
  main/           # Electron main process (Node.js)
    index.ts       # Point d'entree, BrowserWindow, IPC handlers
    db/            # Schema Drizzle, migrations, queries
    llm/           # Vercel AI SDK (routeur, providers, cost-calculator)
    services/      # Secrets, export, stats, voix cloud
  preload/         # Bridge IPC securise
    index.ts       # contextBridge.exposeInMainWorld
  renderer/        # React app (UI uniquement)
    src/
      components/  # Composants React
      hooks/       # Custom hooks
      stores/      # Zustand stores
      i18n/        # Traductions
      lib/         # Utilitaires
    index.html
```

## Electron — Securite

### Patterns
- `nodeIntegration: false` et `contextIsolation: true` toujours
- Preload : exposer UNE fonction par action IPC, jamais ipcRenderer directement
- Main process : valider TOUS les inputs IPC (type, longueur, format)
- CSP stricte : `default-src 'none'; script-src 'self'; connect-src 'self' https://*.openai.com https://*.anthropic.com https://*.googleapis.com https://*.x.ai https://*.mistral.ai https://*.perplexity.ai https://openrouter.ai`
- safeStorage pour les cles API — chiffrement OS natif (Keychain macOS, DPAPI Windows)
- `sandbox: true` sur BrowserWindow

### Pieges
- Ne JAMAIS faire `contextBridge.exposeInMainWorld('ipc', ipcRenderer)` — exposer des fonctions wrappees
- Ne JAMAIS utiliser `shell.openExternal(url)` sans valider l'URL (vecteur d'injection)
- Ne JAMAIS stocker de cles dans electron-store (pas chiffre) — utiliser safeStorage
- Le renderer ne doit JAMAIS connaitre les cles API, meme temporairement

## Electron — IPC

### Patterns
```typescript
// preload.ts — UNE fonction par action
contextBridge.exposeInMainWorld('api', {
  sendMessage: (payload: SendMessagePayload) => ipcRenderer.invoke('chat:send', payload),
  cancelStream: () => ipcRenderer.invoke('chat:cancel'),
  onChunk: (cb: (chunk: StreamChunk) => void) => {
    ipcRenderer.on('chat:chunk', (_, chunk) => cb(chunk))
  },
  offChunk: () => ipcRenderer.removeAllListeners('chat:chunk'),
})

// main.ts — handler avec validation
ipcMain.handle('chat:send', async (event, payload) => {
  const parsed = sendMessageSchema.safeParse(payload) // Zod
  if (!parsed.success) throw new Error('Invalid payload')
  // ... appel LLM
})
```

### Pieges
- `ipcRenderer.on` cree des listeners — toujours cleanup avec `removeAllListeners` au unmount React
- `invoke` est async (request/response), `send`/`on` est fire-and-forget — utiliser invoke pour les actions, send/on pour le streaming

## React 19

### Patterns
- Composants fonctionnels uniquement, pas de classes
- Zustand pour le state global (conversations, settings, modele actif)
- State local (useState) pour le state UI ephemere (dropdown ouvert, input en cours)
- `@tanstack/react-virtual` pour les listes de messages > 100 items
- `React.memo` sur les composants message (eviter re-render de toute la liste)
- `useMemo` / `useCallback` seulement quand mesure demontre un probleme de perf

### Pieges
- Pas de useEffect pour le data fetching — utiliser des IPC invoke dans des event handlers
- Pas de state derive dans useState — calculer a la volee ou useMemo
- Cleanup des listeners IPC dans le return du useEffect

## Tailwind CSS 4 + shadcn/ui

### Patterns
- La skill `/erom-design` donne la base du Design
- Tailwind 4 : `@import "tailwindcss"` dans CSS, plus de tailwind.config.js
- Theme via CSS variables : `--color-primary`, `--color-background`, etc.
- Dark mode : `dark:` prefix, toggle via `document.documentElement.classList`
- shadcn/ui : copier les composants dans `src/renderer/src/components/ui/`
- Customiser les composants shadcn, ne pas importer depuis node_modules

### Pieges
- Tailwind 4 n'utilise plus `tailwind.config.js` — config dans le CSS avec `@theme`
- shadcn/ui depend de Radix — ne pas melanger avec d'autres libs de composants

## Drizzle ORM + SQLite

### Patterns
- 30 tables Drizzle, ~28 index SQLite (voir `src/main/db/schema.ts`)
- WAL mode : `db.pragma('journal_mode = WAL')` — meilleures perfs en lecture
- FTS5 : `CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid)`
- Prepared statements via Drizzle (automatique)
- Migrations via `drizzle-kit generate` puis `drizzle-kit migrate`
- JSON dans text columns : `text('data', { mode: 'json' }).$type<MyType>()`

### Pieges
- better-sqlite3 est synchrone — ne bloque pas l'event loop pour les grosses queries (utiliser worker si necessaire)
- FTS5 : re-indexer apres INSERT/UPDATE/DELETE manuellement si `content=` table externe
- Ne pas oublier `foreign_keys = ON` via pragma (desactive par defaut dans SQLite)

## Couche LLM — Vercel AI SDK 6

### Patterns
- 11 providers (9 cloud + 2 locaux) via `src/main/llm/registry.ts`
- `streamText()` pour le chat, `generateImage()` pour les images
- `stopWhen: stepCountIs(N)` obligatoire (default = 1 en AI SDK 6)
- `await result.text` + `await result.usage` pour recuperer les resultats (pas de `onFinish`)
- `providerOptions` pour features specifiques (Anthropic thinking, OpenAI reasoning, Google thinkingConfig)
- Couts calcules via `src/main/llm/cost-calculator.ts` + table `llm_costs` DB

### Pieges
- Voir `.memory/gotchas.md` section "AI SDK v6 — breaking changes" pour les details complets
- Ollama : verifier que le serveur tourne avant d'appeler (port 11434)

## Live Voice

- Architecture plugin : `src/main/live/` — LiveEngineService + Registry + plugins
- GeminiLivePlugin : WebSocket v1alpha, 13 tools, screen sharing, memoire semantique
- OpenAILivePlugin : WebSocket transport, audio 16→24kHz resample
- Pieges : voir `.memory/gotchas.md` section "Live Voice"

## electron-vite

### Patterns
- Config dans `electron.vite.config.ts` avec 3 sections : main, preload, renderer
- HMR automatique pour le renderer
- Hot restart pour le main process
- Alias `@` pour `src/renderer/src`

### Pieges
- Le preload doit etre bundle en CJS (pas ESM) pour Electron
- Les native modules (better-sqlite3) doivent etre en `external` dans la config main
- `electron-builder` config dans `electron-builder.yml` ou `package.json`

## Commandes

```bash
npm run dev                # Demarrer en mode dev (HMR)
npm run build              # Build production
npm run preview            # Preview du build
npm run lint               # ESLint
npm run typecheck          # tsc --noEmit
npm run test               # Vitest (251 tests, ~1.5s)
npm run test:e2e:security  # Playwright security suite (22 + 2 skipped, ~12s)
npm run test:e2e:flows     # Playwright flow specs (6 specs, ~1.4 min, Ollama qwen3.5:4b uniquement)
npm run test:all           # vitest + security + flows = 279 passing + 2 skipped (~2 min)
npm run db:generate        # Generer migrations Drizzle
npm run db:migrate         # Appliquer migrations
npm run dist               # Build + package (electron-builder)
npm run dist:mac           # Package macOS (DMG + ZIP)
npm run dist:win           # Package Windows (NSIS)
npm run dist:linux         # Package Linux (AppImage + deb)
```

**Tests** : strategie sablier 3-tier (S68-S70). Vitest + E2E security tournent en local + CI sur chaque PR. **Les E2E flows tournent UNIQUEMENT en local** (Ollama qwen3.5:4b), gates par le skill `cruchot-release` etape 2.6 pre-tag. Pas de job CI `e2e-flows` (decision Phase 2b2 PIVOT 2026-04-06 : ~1.4 min en local vs ~20 min en CI, et les specs sont over-fittees a qwen3.5:4b). Voir `tests/e2e/README.md` pour le detail des 6 specs et `_internal/specs/2026-04-06-test-strategy-design.md` pour le design global.

## Specifications

Les specs du projet sont organisees dans `specs/` :
- `specs/phase-setup/` — Specs de la phase initiale (ARCH, FEATURES, PLAN, PRICING, STACK, TASKS, TEAM)

Les nouvelles specs de fonctionnalites vont directement dans `_internal/specs/` (un fichier par feature).

## Contexte projet (.memory)

Le dossier `.memory/` contient la cartographie persistante du projet :
- `architecture.md` — vue d'ensemble, stack, flux de données
- `key-files.md` — fichiers critiques et leur rôle
- `patterns.md` — conventions et patterns récurrents
- `gotchas.md` — pièges, bugs résolus, workarounds

**Ne lis PAS ces fichiers au démarrage.** Lis-les à la demande, uniquement quand la question de l'utilisateur touche au domaine concerné (ex: question archi → `architecture.md`, bug étrange → `gotchas.md`). Pour une question triviale ou sans rapport avec le projet lui-même, ne les lis pas du tout.
