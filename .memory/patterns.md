# Patterns — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-20 (S40)

## Conventions de nommage

- Fichiers : kebab-case — Composants : PascalCase — Stores : `[domaine].store.ts` — IPC : `[domaine].ipc.ts` — Queries : `[domaine].ts`

## IPC Pattern

- `ipcMain.handle` (request/response) + `webContents.send` (streaming)
- Preload : `contextBridge.exposeInMainWorld('api', { ... })`
- Renderer : `window.api.methodName(payload)`

## LLM — AI SDK v6

- `streamText()` pour chat, `generateImage()` pour images
- `onChunk` forward IPC — `chunk.text` (pas `textDelta`)
- **Pas de `onFinish`** — save DB apres `await result.text` + `await result.usage`
- `result.usage` → `{ inputTokens, outputTokens }` (pas `promptTokens`/`completionTokens`)
- `inputSchema` (pas `parameters`) pour outils, `stopWhen: stepCountIs(50)`
- `NoOutputGeneratedError` : verifier `.cause` (wrape l'erreur API reelle)
- `tool-call`/`tool-result` chunks dans `onChunk` (pas `onStepFinish`)

## Thinking / Reasoning

- `thinking.ts` : `buildThinkingProviderOptions(providerId, effort)` — 4 niveaux
- Anthropic : `thinking.type` + `budgetTokens` | OpenAI : `reasoningEffort` | Google : `thinkingConfig.thinkingBudget`
- xAI : low/high seulement | DeepSeek : binaire | Qwen/Magistral : decoratif

## Projet ↔ Conversation

- `defaultModelId` format `providerId::modelId` — `split('::')` avant `selectModel()`
- Conversation herite `projectId` actif, sidebar filtre par projet

## Workspace Co-Work + Tools

- 4 outils AI SDK : bash (env minimal, blocklist ~39 + newline guard), readFile (whitelist ~80 ext), writeFile, listFiles
- `buildWorkspaceContextBlock()` auto-lit CLAUDE.md, README.md etc. → system prompt
- Fichiers attaches en system prompt (`<workspace-files>` XML)
- ToolCallBlock/ReasoningBlock : auto-collapse quand stream finit (useRef + useEffect)

## @Mention Fichiers

- Textarea `color: transparent` + `-webkit-text-fill-color: transparent` + `caret-color: foreground`
- Overlay div `absolute inset-0` rend le meme texte avec @mentions stylees cyan
- Regex : paths tries par longueur desc, negative lookahead `(?![\w./-])`
- mentionedFiles = `Set<string>` local (pas Zustand), cleanup quand @path disparait du texte
- FileMentionPopover : meme positionnement que SlashCommandPicker
- Au send : fichiers panel-attaches + @mentionnes + dropped files merges avec dedup via `loadedPaths` Set

## Drag & Drop Fichiers (S38)

- Drop handler sur InputZone : `onDragEnter`/`onDragLeave`/`onDragOver`/`onDrop`
- `e.dataTransfer.files[i].path` expose le chemin natif (Electron)
- Fichiers texte/code lus via IPC `files:readText` (chemin absolu, whitelist extensions, 500KB max, DANGEROUS_EXTENSIONS bloquees, realpathSync)
- `droppedFileContexts` : `Map<path, {content, language, name}>` state local dans InputZone
- Affiches comme pills `FileReference` cyan (meme rendu que fichiers workspace)
- Images/binaires redirigees vers le flux `addBrowserFiles` existant
- State nettoye apres send

## Prompt Optimizer (S38)

- Bouton Sparkles (lucide-react) dans la zone pills de InputZone, entre PromptPicker et VoiceInput
- Actif seulement quand `inputValue.trim().length > 0` et pas en streaming/image mode
- `generateText()` one-shot avec system prompt d'expert prompt engineering
- Le texte optimise remplace directement le contenu du textarea
- Spinner Loader2 pendant l'optimisation
- Handler IPC `prompt:optimize` dans `prompt-optimizer.ipc.ts` (Zod)

## Conversations Favorites (S38)

- Colonne `is_favorite` (INTEGER DEFAULT 0, mode boolean) sur table `conversations`
- Migration idempotente `ALTER TABLE ... ADD COLUMN` (try/catch)
- Query `toggleFavorite(id, isFavorite)` via Drizzle
- IPC `conversations:toggleFavorite` (Zod: `{ id: string, isFavorite: boolean }`)
- Icone Star (lucide-react) : pleine ambre si favori (toujours visible), outline au hover sinon
- ConversationList split : section "Favoris" (header + separateur) en haut, puis groupes par date

## Slash Commands

- Resolution renderer-side : `useSlashCommands()` detecte `/`, filtre, resout variables ($ARGS, $1-$N, $MODEL, $PROJECT, $WORKSPACE, $DATE)
- Priorite : projet > global > builtin. Noms : regex `/^[a-z][a-z0-9-]*$/`, reserves blacklist
- `contentData.slashCommand` → badge violet dans MessageItem
- Seed builtins au startup (upsert, n'ecrase pas les personnalises)

## Memoire Semantique (RAG local)

- **Ingestion** : fire-and-forget via `syncQueue` + interval 2s, batch max 50 messages
- **Chunking** : 1000 chars, overlap 200, coupure intelligente (paragraphe > phrase > newline), guard anti-boucle infinie (`Math.max(nextStart, start + 1)`)
- **Recall** : silencieux, injecte dans system prompt `<semantic-memory>` XML, invisible pour l'utilisateur
- **Qdrant REST API** : `fetch()` natif vers `127.0.0.1:6333`, pas de client JS — filtre format `{ key, match: { value } }`, `should` au top-level (pas nested)
- **Qdrant config** : YAML dans `userData/qdrant-config/config.yaml`, spawn avec `--config-path` (PAS --port/--storage-path CLI args)
- **Embedding** : `@huggingface/transformers` dynamic import (ESM), pipeline `feature-extraction`, model `all-MiniLM-L6-v2` (384d, ONNX quantized)
- **Point IDs** : `crypto.randomUUID()` (Qdrant exige UUID ou uint, pas nanoid)
- **Prod bundling** : modele ONNX dans `vendor/models/`, script `scripts/prepare-models.sh`, `extraResources` dans electron-builder

## Export/Import JSON (Prompts, Roles & Commandes)

- 100% renderer (donnees deja en stores Zustand)
- Export : `Blob` + `URL.createObjectURL()` + `<a download>`
- Import : `FileReader` → validation type/items + `window.api.create*()`. Dedup suffixe `-1`, `-2`

## Referentiels RAG Custom (S35)

- **LibraryService** singleton : CRUD, import documents (PDF/DOCX/MD/code/CSV), chunking adapte par type, dual embedding, Qdrant upsert, retrieval
- **Dual embedding** : local (all-MiniLM-L6-v2, 384d) ou Google (gemini-embedding-2-preview, 768d via `google.embedding()`)
- **Collection Qdrant** par referentiel : `library_{id}`, isolee de `conversations_memory`
- **Sticky attach** : `activeLibraryId` dans table `conversations`, persiste entre sessions, 1 referentiel par conversation (v1)
- **Injection system prompt** : `<library-context>` XML en PREMIER (avant `<semantic-memory>` et `<user-memory>`), via `library-prompt.ts`
- **Retrieval dans chat.ipc.ts** : avant `streamText()`, query Qdrant, build XML context, chunks injectes dans `contentData.librarySources`
- **Synthetic tool chunks** : `tool-call` + `tool-result` IPC (`toolName: 'librarySearch'`) envoyes autour du retrieval pour feedback visuel dans ToolCallBlock
- **SourceCitation** : section "Sources utilisees" deterministe en bas du message (pas LLM), basee sur `contentData.librarySources`
- **LibraryPicker** : badge colore sticky dans InputZone (entre RoleSelector et PromptPicker), dropdown select simple, detach via bouton X
- **3 tables Drizzle** : `libraries`, `library_sources`, `library_chunks` — FK cascade, cleanup ordre strict chunks → sources → libraries
- **pdf-parse** : import `pdf-parse/lib/pdf-parse.js` directement (contourne test code dans index.js)

## Arena Mode (LLM vs LLM) (S39)

- **Architecture duale** : 2 `AbortController` independants (`leftAbortController`, `rightAbortController`), `Promise.allSettled()` pour que chaque cote puisse fail sans bloquer l'autre
- **2 canaux IPC streaming** : `arena:chunk:left` et `arena:chunk:right` (webContents.send fire-and-forget), meme format que `chat:chunk` (start/text-delta/reasoning-delta/finish/error)
- **Store dedie** : `arena.store.ts` completement isole du chat normal (pas dans messages.store), state : leftMessage/rightMessage/rounds/vote/currentMatchId
- **Hook dedie** : `useArenaStreaming.ts` ecoute les 2 canaux + `arena:match-created`, cleanup cancel au unmount
- **Simplifie volontairement** : pas de workspace tools, pas de MCP, pas de @mentions, pas de drag&drop, pas de search, pas de library retrieval, pas de Remote forwarding — comparaison LLM vanilla pure
- **Multi-rounds** : apres vote, `archiveCurrentRound()` deplace le round courant dans `rounds[]`, reset le state streaming
- **Conversation arena** : `is_arena` colonne boolean sur `conversations`, set via `setConversationArena()` au premier `arena:send`
- **Sidebar integration** : ConversationItem affiche `Swords` icon si `isArena`, Sidebar route vers `'arena'` view au clic
- **VS animation** : CSS custom `@keyframes arena-pulse` dans `globals.css` (box-shadow pulse rouge)
- **Metriques comparees** : ArenaMetrics colore en vert le meilleur et rouge le moins bon sur chaque axe (cout, temps, tokens out)
- **Table `arena_matches`** : 24eme table Drizzle, stocke les 2 modeles, vote, timestamps, FK vers messages via leftMessageId/rightMessageId
- **Stats agregees** : `getArenaStats()` utilise UNION ALL SQL pour merger les stats gauche/droite par modele

## Data Cleanup / Factory Reset

- Zone orange : nettoyage partiel (conversations, projets, images, taches, MCP). Zone rouge : factory reset complet (24 tables + `localStorage.clear()`)
- Backend : ordre FK strict, stop services avant delete, trash fichiers, confirmation dialog natif main
- Cleanup : `arena_matches` avant `messages`, `library_chunks` → `library_sources` → `libraries` (ordre FK) + drop collections Qdrant `library_*`
- Singletons : `export const fooService = new FooService()` (pas getInstance())

## Conventions UI

- Vues inline (pas de modal) — `subView` state ('grid'|'create'|'edit')
- Pills InputZone : shadcn Select (pattern ThinkingSelector)
- Footer message : actions hover a gauche, info a droite
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea)
- Title bar macOS : `hiddenInset`, traffic lights `{x:15, y:10}`, drag zones 38px

## Performance (S37)

- **React.lazy + Suspense** : 12 vues non-chat lazy-loaded dans App.tsx (seul ChatView est eager)
- **React.memo** : MessageItem wrappe pour eviter re-renders pendant streaming
- **useMemo** : `conversationMessages` dans ChatView (evite .filter() sur chaque token)
- **manualChunks** : vendor splitting par fonction (id) dans electron.vite.config.ts — chunks react, icons, charts, markdown, radix
- **rAF scroll** : `requestAnimationFrame` + `behavior: 'auto'` pendant streaming (pas `smooth` qui empile les animations)
- **Fire-and-forget settings** : hydration DB dans useInitApp non-bloquante (localStorage fournit les valeurs au t=0)
- **Deferred init** : `ensureInstanceToken` + `seedBuiltinCommands` apres `createMainWindow()`
- **esbuild** : remplace Terser pour le main process (build 57% plus rapide)
- **15 index SQLite** : `CREATE INDEX IF NOT EXISTS` dans migrate.ts sur toutes les FK frequemment requetees

## Distribution (S40)

- **externalizeDepsPlugin `exclude`** : bundler TOUT sauf les vrais modules natifs/ESM. Liste actuelle des bundled : ai, tous @ai-sdk/*, @openrouter/ai-sdk-provider, drizzle-orm, nanoid, sonner, zod, mammoth, pdf-parse, qrcode, ws, electron-updater, builder-util-runtime
- **Modules restant external** (natifs ou ESM) : better-sqlite3, chokidar, @ai-sdk/mcp, trash, @huggingface/transformers, onnxruntime-*, fsevents, sharp, @perplexity-ai/ai-sdk, bufferutil, utf-8-validate
- Build arm64 macOS (pas universal — evite conflit test_extension.node), auto-updater check 4h, `app.isPackaged` guard
- `forceCodeSigning: false` — ad-hoc signing automatique, `notarize: false`, `hardenedRuntime: false`
- `sourcemap: false` partout (main, preload, renderer, remote-web, tsconfig)
- **Commande de test packaging** : `npm run dist:mac` puis `pkill -f "Cruchot.app"; trash /Applications/Cruchot.app; cp -R dist/mac-arm64/Cruchot.app /Applications/; xattr -cr /Applications/Cruchot.app; open /Applications/Cruchot.app`

## Securite — Patterns (S36)

- **Bash blocklist** : newlines bloquees en premier (`/[\r\n]/`), puis ~39 regex patterns (heredoc, alias, backtick, $(), sudo, rm, exfiltration, etc.)
- **Path validation** : `realpathSync()` avant `isPathAllowed()` ou `validatePath()` — resout symlinks
- **Library addSources** : `validateSourcePath()` avec BLOCKED_SOURCE_ROOTS (15 chemins systeme) + SENSITIVE_FILE_PATTERNS (14 patterns)
- **Filename sanitization** : `path.basename(filename) !== filename` bloque les separateurs de chemin
- **DANGEROUS_EXTENSIONS** : 23 extensions (.app, .exe, .pkg, .dmg, .jar, .ps1, .vbs, etc.)
- **Workspace deleteFile** : `isIgnored()` bloque `.git/`, `node_modules/`, etc.
- **CF tunnel** : token via env var `TUNNEL_TOKEN` (pas CLI arg, invisible dans `ps aux`)
- **Remote message length** : `text.length > 100_000` pour WebSocket (coherent avec desktop Zod)
- **Bulk import** : `statSync().size > 200MB` avant `readFileSync()`
- **will-navigate** : bloque navigation hors `file://` et dev URL
- **Remote-web CSP** : `connect-src` restreint au reseau local (localhost, 127.0.0.1, 192.168.*, 10.*)
