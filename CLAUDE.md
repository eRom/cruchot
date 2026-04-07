# CLAUDE.md — Multi-LLM Desktop

> Auto-genere par /stack le 2026-03-09
> Stack : Electron 35 + React 19 + TypeScript 5 + SQLite (better-sqlite3) + Drizzle ORM + Vercel AI SDK 5

## Regles projet

- App desktop locale, ZERO serveur backend — tout tourne sur la machine
- Mono-utilisateur, pas d'auth
- Donnees 100% locales (SQLite + filesystem), aucune telemetrie
- Cles API jamais dans le renderer — uniquement dans le main process via safeStorage
- Utiliser `trash` au lieu de `rm` pour supprimer des fichiers (macOS corbeille)
- Langue UI : francais par defaut, anglais supporte

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
```typescript
// schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  contentData: text('content_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  modelId: text('model_id'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  cost: real('cost'),
  responseTimeMs: integer('response_time_ms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```
- WAL mode : `db.pragma('journal_mode = WAL')` — meilleures perfs en lecture
- FTS5 : `CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages, content_rowid=rowid)`
- Prepared statements via Drizzle (automatique)
- Migrations via `drizzle-kit generate` puis `drizzle-kit migrate`
- JSON dans text columns : `text('data', { mode: 'json' }).$type<MyType>()`

### Pieges
- better-sqlite3 est synchrone — ne bloque pas l'event loop pour les grosses queries (utiliser worker si necessaire)
- FTS5 : re-indexer apres INSERT/UPDATE/DELETE manuellement si `content=` table externe
- Ne pas oublier `foreign_keys = ON` via pragma (desactive par defaut dans SQLite)

## Couche LLM — Vercel AI SDK

### Patterns
```typescript
// Routeur — getModel retourne un LanguageModel du AI SDK
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { mistral } from '@ai-sdk/mistral'
import { xai } from '@ai-sdk/xai'
import { openrouter } from '@ai-sdk/openrouter'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

function getModel(provider: string, modelId: string) {
  switch (provider) {
    case 'openai': return openai(modelId)
    case 'anthropic': return anthropic(modelId)
    case 'google': return google(modelId)
    case 'mistral': return mistral(modelId)
    case 'xai': return xai(modelId)
    case 'openrouter': return openrouter(modelId)
    case 'perplexity': return createOpenAICompatible({ name: 'perplexity', baseURL: '...' })(modelId)
    case 'lmstudio': return createOpenAICompatible({ name: 'lmstudio', baseURL: '...' })(modelId)
    // ollama via community provider
  }
}

// Streaming — onChunk + onFinish
import { streamText } from 'ai'

const result = streamText({
  model: getModel(provider, modelId),
  messages,
  abortSignal: controller.signal,
  providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens } } },
  onChunk({ chunk }) {
    mainWindow.webContents.send('chat:chunk', chunk)
  },
  onFinish({ totalUsage }) {
    // Sauvegarder en DB, calculer cout
  },
})

// Image generation — Gemini uniquement
import { generateImage } from 'ai'

const { image } = await generateImage({
  model: google.image('gemini-3.1-flash-image-preview'),
  prompt,
  aspectRatio: '1:1',
})

// Cost calculator — table de pricing par modele
const PRICING: Record<string, { input: number; output: number }> = { /* fourni par Romain */ }
```
- Pas d'adapters custom — le AI SDK fournit l'abstraction multi-provider
- streamText() pour le chat, generateImage() pour les images
- onChunk callback pour forward IPC des chunks normalises
- onFinish callback pour sauvegarde DB + calcul couts
- abortSignal pour annulation
- providerOptions pour features specifiques (Anthropic thinking)
- Couts calcules via table PRICING dans cost-calculator.ts

### Pieges
- Le AI SDK normalise les chunks mais les providerOptions restent specifiques
- Gemini : le SDK gere automatiquement l'injection du system message
- Perplexity : les citations/sources sont dans les metadata de la reponse — a parser manuellement
- OpenRouter : features avancees (credits, auto-routing, ZDR) a gerer via API directe
- Ollama : verifier que le serveur tourne avant d'appeler (port 11434)
- Image generation : uniquement 2 modeles Gemini (gemini-3.1-flash-image-preview, gemini-3-pro-image-preview)

## Voix (STT/TTS)

### Patterns
- STT : capture audio dans le renderer (MediaRecorder API), envoi du buffer au main via IPC
- TTS : main process genere l'audio (buffer), envoie au renderer pour playback
- Fallback Web Speech API : tout dans le renderer, zero IPC

### Pieges
- MediaRecorder : format depend du navigateur — forcer `audio/webm;codecs=opus`
- Web Speech API : pas disponible dans tous les contextes Electron — tester au runtime
- Deepgram streaming : connexion WebSocket, pas REST — gerer reconnexion

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

Au démarrage de chaque session, lis ces fichiers pour charger le contexte du projet :
- .memory/architecture.md
- .memory/key-files.md
- .memory/patterns.md
- .memory/gotchas.md

Après lecture, affiche un résumé compact :
- Projet : [nom/type]
- Stack : [technos principales]
- Fichiers clés : [nombre]
- Gotchas : [nombre]
- Prêt à travailler.
