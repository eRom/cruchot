# Patterns — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-13 (S35)

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

- 4 outils AI SDK : bash (env minimal, blocklist ~36), readFile (whitelist ~80 ext), writeFile, listFiles
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

## Export/Import Securise (.mlx)

- **Token instance** : 32 bytes (`crypto.randomBytes`), stocke chiffre via `encryptApiKey()` dans settings (cle `multi-llm:instance-token`), hors `ALLOWED_SETTING_KEYS` (inaccessible du renderer via settings:get/set)
- **Export** : `buildExportPayload()` serialise projets (sans workspacePath) + conversations + messages → JSON, `encryptPayload()` chiffre AES-256-GCM → binaire `[IV:12][AuthTag:16][Ciphertext:N]`
- **Import** : `tryDecryptWithLocalToken()` auto-tente le token local, sinon demande token externe (hex 64 chars, Zod regex strict), `importPayload()` en transaction SQLite
- **Dedup** : noms projets suffixes `-1`, `-2` (existants + intra-batch)
- **Format** : `.mlx`, dialog save/open natif Electron, taille max 200 MB

## Skills

- **Discovery fichier** : 2 sources (global `~/.multi-llm/skills/` + projet `{workspace}/.multi-llm/skills/`), projet ecrase global sur conflit de nom
- **SKILL.md** : YAML frontmatter (`name` kebab-case, `description`) + markdown body, parse via `gray-matter`
- **Companion files** : scan recursif du dossier skill, chemins relatifs, exclut SKILL.md et LICENSE*
- **Injection system prompt** : `<available-skills>` XML avec noms + descriptions, scan a chaque conversation
- **Tool AI SDK** : `loadSkill(name)` retourne instructions completes + chemins absolus companion files dans `<skill_content>` XML
- **readFile etendu** : chemins absolus `~/.multi-llm/` et `{workspace}/.multi-llm/skills/` autorises (verification isReadableFile + anti-traversal)
- **Pas de DB** : 100% fichier, cache Map en memoire, pas de hot-reload (scan au demarrage conversation ou refresh manuel)
- **Securite** : nom `/^[a-z][a-z0-9-]{0,49}$/`, content max 200KB, pas de `..` dans les chemins
- **Auto-approve remote** : `loadSkill` = autoApproveRead (lecture seule)

## Data Cleanup / Factory Reset

- Zone orange : nettoyage partiel (conversations, projets, images, taches, MCP). Zone rouge : factory reset complet (18 tables + `localStorage.clear()`)
- Backend : ordre FK strict, stop services avant delete, trash fichiers, confirmation dialog natif main
- Singletons : `export const fooService = new FooService()` (pas getInstance())

## Conventions UI

- Vues inline (pas de modal) — `subView` state ('grid'|'create'|'edit')
- Pills InputZone : shadcn Select (pattern ThinkingSelector)
- Footer message : actions hover a gauche, info a droite
- ConversationList : `overflow-y-auto` (PAS Radix ScrollArea)
- Title bar macOS : `hiddenInset`, traffic lights `{x:15, y:10}`, drag zones 38px

## Distribution

- externalizeDepsPlugin : `exclude` liste les deps JS pures a bundler
- Modules natifs/ESM restent external : better-sqlite3, chokidar, @ai-sdk/mcp, electron-updater, trash, @huggingface/transformers, onnxruntime-node, onnxruntime-web, onnxruntime-common
- Build universal macOS, auto-updater check 4h, `app.isPackaged` guard
