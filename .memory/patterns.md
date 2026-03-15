# Patterns — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-15 (S37)

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
- Au send : fichiers panel-attaches + @mentionnes merges avec dedup via `loadedPaths` Set

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

## Data Cleanup / Factory Reset

- Zone orange : nettoyage partiel (conversations, projets, images, taches, MCP). Zone rouge : factory reset complet (22 tables + `localStorage.clear()`)
- Backend : ordre FK strict, stop services avant delete, trash fichiers, confirmation dialog natif main
- Cleanup libraries : `library_chunks` → `library_sources` → `libraries` (ordre FK) + drop collections Qdrant `library_*`
- Singletons : `export const fooService = new FooService()` (pas getInstance())

## Conventions UI

- Vues inline (pas de modal) — `subView` state ('grid'|'create'|'edit')
- Pills InputZone : shadcn Select (pattern ThinkingSelector)
- Footer message : actions hover a gauche, info a droite
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea)
- Title bar macOS : `hiddenInset`, traffic lights `{x:15, y:10}`, drag zones 38px

## Performance (S37)

- **React.lazy + Suspense** : 11 vues non-chat lazy-loaded dans App.tsx (seul ChatView est eager)
- **React.memo** : MessageItem wrappe pour eviter re-renders pendant streaming
- **useMemo** : `conversationMessages` dans ChatView (evite .filter() sur chaque token)
- **manualChunks** : vendor splitting par fonction (id) dans electron.vite.config.ts — chunks react, icons, charts, markdown, radix
- **rAF scroll** : `requestAnimationFrame` + `behavior: 'auto'` pendant streaming (pas `smooth` qui empile les animations)
- **Fire-and-forget settings** : hydration DB dans useInitApp non-bloquante (localStorage fournit les valeurs au t=0)
- **Deferred init** : `ensureInstanceToken` + `seedBuiltinCommands` apres `createMainWindow()`
- **esbuild** : remplace Terser pour le main process (build 57% plus rapide)
- **15 index SQLite** : `CREATE INDEX IF NOT EXISTS` dans migrate.ts sur toutes les FK frequemment requetees

## Distribution

- externalizeDepsPlugin : `exclude` liste les deps JS pures a bundler
- Modules natifs/ESM restent external : better-sqlite3, chokidar, @ai-sdk/mcp, electron-updater, trash, @huggingface/transformers, onnxruntime-node, onnxruntime-web, onnxruntime-common
- Build universal macOS, auto-updater check 4h, `app.isPackaged` guard
- `forceCodeSigning: true` — builds echouent sans certificat (pas de binaires non signes)
- `sourcemap: false` partout (main, preload, renderer, remote-web, tsconfig)

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
