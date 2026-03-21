# Gotchas — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-20 (S41)

## AI SDK v6 — Breaking changes

- `chunk.text` (pas `textDelta`), `result.usage` → `inputTokens`/`outputTokens`
- `inputSchema` (pas `parameters`), `stopWhen: stepCountIs(N)` obligatoire (default = 1)
- `NoOutputGeneratedError` : verifier `.cause`. `consumeStream()` avale toutes les erreurs — ne pas utiliser
- **Pas de `onFinish`** — save apres `await result.text` + `await result.usage`

## providerOptions par provider

- Anthropic : `{ anthropic: { thinking: { type: 'enabled', budgetTokens } } }`
- OpenAI : `{ openai: { reasoningEffort: 'low' | 'medium' | 'high' } }`
- Google : `{ google: { thinkingConfig: { thinkingBudget: number } } }`
- xAI : `{ xai: { reasoningEffort: 'low' | 'high' } }` (pas medium/none)
- DeepSeek : binaire. Reasoner raisonne toujours. Qwen/Magistral : decoratif

## Pieges recurrents

- **Radix ScrollArea** : `display: table` casse flex → `overflow-y-auto`
- **Radix Select** : `<SelectLabel>` exige `<SelectGroup>` → `<div>` pour headers
- **Radix popover** : `overflow-hidden` parent clippe les dropdowns
- **Zustand persist** : nouveaux champs = `undefined` → `?? defaultValue`
- **Preload** : non recharge en HMR → restart app complet
- **Chokidar / @ai-sdk/mcp** : ESM → dynamic import + `external` dans electron.vite.config
- **Import paths** : stores/ = 3 `../` vers preload, components/chat = 4 `../`
- **ANSI codes** : `FORCE_COLOR=0 NO_COLOR=1` dans env child_process
- **hotkeys-js** : virgule = separateur → listener natif `keydown` pour Cmd+,

## Drizzle / SQLite

- Aggregations : core query builder + `sql<T>()` (PAS relational queries)
- Timestamps en secondes (Drizzle `mode: 'timestamp'`), params : `Math.floor()`
- FTS5 : table virtuelle manuelle, WAL checkpoint au demarrage
- `foreign_keys = ON` via pragma (desactive par defaut)
- Tables dans `migrate.ts` avec `CREATE TABLE IF NOT EXISTS` (pas migrations Drizzle)
- Cleanup : ordre FK strict, `arena_matches` avant `messages`, `library_chunks` → `library_sources` → `libraries`, `slash_commands` avant `projects`

## React 19

- `contentData: Record<string, unknown>` empoisonne types JSX → caster `as string`

## @Mention Fichiers

- `-webkit-text-fill-color: transparent` + `caret-color: foreground` (color seul insuffisant)
- Overlay scroll sync via event listener (sinon desync)
- Regex : trier paths par longueur desc + lookahead `(?![\w./-])` (sinon match partiel)
- Approche badge/PJ rejetee → texte `@path` inline avec style different

## Qdrant / Memoire Semantique (S33)

- **Qdrant v1.17 CLI args** : `--port`/`--storage-path`/`--grpc-port` ne sont PAS des args CLI → utiliser `--config-path` avec fichier YAML
- **device WASM vs CPU** : `device: 'wasm'` n'existe pas en Node.js/Electron → utiliser `device: 'cpu'` (onnxruntime-node gere le CPU natif)
- **onnxruntime-node N-API** : ABI-stable v3, fonctionne dans Electron SANS electron-rebuild
- **Point IDs Qdrant** : exige UUID ou unsigned int → `crypto.randomUUID()`, PAS nanoid
- **Filtre Qdrant** : `should` au top-level du filtre (pas nested dans `must`), conditions = `{ key, match: { value } }`
- **chunkText boucle infinie** : si `start = end - CHUNK_OVERLAP` recule, boucle infinie → `Math.max(nextStart, start + 1)` + `if (end >= text.length) break`
- **NODE_ENV_ELECTRON_VITE** : electron-vite utilise cette var (pas `NODE_ENV`) pour signaler prod → `isProd` doit checker les deux
- **drop_console terser** : si applique sans condition `isProd`, supprime TOUS les console.* meme en dev → conditionner sur `isProd`
- **esbuild drop console** : `esbuild: { drop: ['console'] }` va au top-level de la section main (pas sous `build`), conditionne sur `isProd`

## Distribution (S40 — packaging enfin fonctionnel)

- `externalizeDepsPlugin()` sans args externalise TOUT → crash. Utiliser `exclude` liste
- **`@openrouter/ai-sdk-provider` manquait dans `exclude`** : externalise par defaut mais absent de l'asar → `Cannot find module` au runtime. Fix : ajouter a `exclude` dans electron.vite.config.ts
- **`qrcode` → `dijkstrajs` manquant** : qrcode externalise mais ses deps transitives absentes de l'asar. Fix : bundler qrcode (ajouter a `exclude`) au lieu de l'externaliser
- **`ws` deps optionnelles** : `bufferutil` et `utf-8-validate` sont des deps natives optionnelles de ws. Quand ws est bundle, le bundler tente de resoudre ces deps et echoue. Fix : ajouter `bufferutil` et `utf-8-validate` a `rollupOptions.external`
- **Strategie d'externalisation** : ne garder external que les vrais modules natifs/ESM (better-sqlite3, chokidar, @ai-sdk/mcp, trash, @huggingface/transformers, onnxruntime-*). Tout le reste (qrcode, ws, electron-updater, builder-util-runtime, tous les @ai-sdk/*) doit etre bundle via `exclude`
- **Build universal macOS** : `@electron/universal` plante sur `test_extension.node` de better-sqlite3 (identique x64/arm64). Fix : builder pour l'arch native seulement (`arch: [arm64]`)
- **`forceCodeSigning: true`** → le build refuse de produire un binaire sans certificat. Fix : `false` pour dev local (fallback ad-hoc automatique)
- **`notarize: true`** sans Apple Developer ID → echec. Fix : `false` pour dev local
- **`hardenedRuntime: true`** exige une vraie signature → `false` pour dev local
- **Gatekeeper macOS Tahoe** : `xattr -cr /Applications/Cruchot.app` apres copie. Clic droit > Ouvrir ne suffit pas toujours
- **Installation propre** : `pkill -f "Cruchot.app"; trash /Applications/Cruchot.app; cp -R dist/mac-arm64/Cruchot.app /Applications/; xattr -cr /Applications/Cruchot.app`
- Certificat Apple Developer ID requis pour distribution publique (99$/an)
- **CI Release multi-plateforme** : `release.yml` build Mac + Win + Linux en parallele (`fail-fast: false`)
- **macOS CI** : `arch: [arm64, x64]` pour couvrir les 2 types de runners GitHub Actions (pas universal — plante sur better-sqlite3)
- **Linux .deb `maintainer`** : electron-builder exige un champ `maintainer` dans le bloc `linux:` du YAML (ou `author` avec email dans package.json). Sans ça : `It is required to set Linux .deb package maintainer`
- **TypeScript CI** : erreurs pre-existantes dans le renderer bloquent le release. Le typecheck main a `continue-on-error: true` mais pas le renderer
- **Re-tag release** : quand on fix et re-tag, les anciens assets restent sur la release GitHub (doublons). Nettoyer via `gh release delete-asset`
- **Blockmaps** : fichiers `.blockmap` generes par electron-builder pour l'auto-updater delta. Polluent la page release — supprimer pour la lisibilite

## Preferences UI de Romain

- Vues inline (pas modals), CRUD complet visible
- Footer message : actions hover a gauche, info a droite
- ModelSelector : liste plate, pas de groupement par provider
- WorkspacePanel : toggle (pas close), ne PAS auto-open au changement de conversation
- Remote badge : dans ContextWindowIndicator, PAS dans la toolbar
- UI web remote : calque visuel exact du desktop

## Referentiels RAG Custom (S35)

- **pdf-parse v1.1.1 `index.js`** : execute du code de test quand `module.parent` est null (cas electron-vite bundle) → ENOENT `./test/data/05-versions-space.pdf`. Fix : importer `pdf-parse/lib/pdf-parse.js` directement
- **Google embedding model** : `gemini-embedding-exp-03-07` deprecie (404). Modele actuel : `gemini-embedding-2-preview` (768d, multimodal)
- **AI SDK v6 embedding API** : `.textEmbeddingModel()` renomme en `.embedding()` — `google.embedding('gemini-embedding-2-preview')`
- **Dynamic `require()` dans electron-vite** : les `require('../relative/path')` echouent car tout est compile en un seul fichier bundle (les chemins relatifs n'existent plus). Fix : utiliser des imports statiques en haut du fichier
- **mammoth DOCX** : `convertToMarkdown()` pour les referentiels (preserve headings), `extractRawText()` pour les attachments chat

## Securite — points a surveiller (audit S36 : score 97/100)

- **pdf-parse v1.1.1** : non maintenu. Migrer vers pdfjs-dist eventuel (risque accepte, mitige par import direct)
- **MCP headers HTTP** : en clair en DB (masques du renderer mais pas chiffres au repos)
- **MCP stdio** : execute un binaire arbitraire configure par l'utilisateur — by design, risque accepte (mono-user)
- **`currentAbortController` global** : fragile en multi-fenetres, race condition theorique (mono-user, risque accepte)
- **`removeAllListeners(channel)`** : trop large, risque en multi-fenetre
- **Settings localStorage** : persist Zustand duplique les settings SQLite — pas de secrets, UI prefs seulement (risque accepte)
- **`legacy-peer-deps=true`** dans `.npmrc` : desactive detection conflits peer deps — isole a @perplexity-ai/ai-sdk
- **`forceCodeSigning`** : desactive (false) depuis S40 — ad-hoc signing automatique en dev local
- **Semgrep faux positif** : `react-insecure-request` sur `qdrant-process.ts:106` (HTTP vers localhost Qdrant) — toujours present, ignorer
- **Typecheck main process** : erreurs pre-existantes dans chat.ipc.ts, git.ipc.ts, mcp.ipc.ts (types AI SDK v6) — `continue-on-error: true` en CI

## Performance — points a surveiller (audit S37)

- **Streaming token-by-token** : chaque token = 1 IPC + 2 Zustand map() + 1 re-render. Batching 50ms serait un gros gain (non implemente)
- **Shiki re-highlight pendant streaming** : `useEffect([code, language])` fire par token pour chaque code block visible. `codeToHtml()` execute puis discard si le code change entre-temps
- **Mermaid 800KB dans le bundle ChatView** : import statique dans MermaidBlock, pourrait etre dynamic import()
- **ONNX model 23MB en memoire** : charge une fois, jamais decharge. Acceptable mono-user mais `dispose()` serait propre
- **MCP `getToolsForChat()` sans timeout** : appel async vers transport stdio/http, peut bloquer le chat si un serveur MCP est lent
- **messages store flat array** : pas de pagination, pas d'eviction. Conversations longues (1000+ messages avec tool-use) = plusieurs MB de strings en heap
- **`removeAllListeners(channel)`** dans useStreaming : trop large, supprime TOUS les listeners du canal (risque si mount multiple)
- **manualChunks function-based** : les string-array `manualChunks` echouent avec `Could not resolve entry module` pour les packages Radix/Vite → utiliser la forme fonction `manualChunks(id)`
- **Drizzle `.references()` ne cree PAS d'index** : SQLite n'enforce pas les FK indexes. Toujours ajouter `CREATE INDEX` manuellement dans migrate.ts

## Worktrees et userData Electron (S38)

- **Rename app → userData change** : quand le projet a ete renomme de `multi-llm-desktop` en `cruchot`, `app.getPath('userData')` a change de `~/Library/Application Support/multi-llm-desktop/` vers `~/Library/Application Support/cruchot/`. Les anciennes donnees (DB, images, etc.) sont restees dans l'ancien dossier. Fix : copier `main.db` de l'ancien vers le nouveau dossier.
- **Worktrees et node_modules** : les git worktrees n'ont PAS de `node_modules` — il faut soit `npm install` (risque sharp build failure) soit symlinker depuis le repo principal : `ln -s /path/to/main/node_modules /path/to/worktree/node_modules`
- **Worktrees et localStorage** : lancer l'app depuis un worktree partage le meme userData Electron (meme nom d'app) mais peut reinitialiser le localStorage (Zustand persist), donnant l'impression de perte de donnees alors que la DB SQLite est intacte
- **ALTER TABLE et Drizzle** : si une migration `ALTER TABLE ADD COLUMN` n'a pas eu le temps de s'executer mais que le schema Drizzle reference deja la colonne, les queries plantent silencieusement. Verifier que la migration est passee en DB.

## Arena Mode (S39)

- **AI SDK v6 `maxTokens` type error** : `streamText()` sans tools rejette `maxTokens` comme propriete inconnue dans le type strict. Fix : spread conditionnel `...(maxTokens ? { maxTokens } : {})` ou cast `any` sur les options (meme pattern que chat.ipc.ts qui s'en sort grace a la presence de `tools` qui relaxe le type)
- **`BrowserWindow.fromWebContents()` null narrowing** : retourne `BrowserWindow | null`, TypeScript ne narrow pas dans les closures internes (streamSide). Fix : assigner a une nouvelle const apres le guard `if (!win) throw` → `const _win = ...; if (!_win) throw; const win = _win`
- **providerOptions type** : `buildThinkingProviderOptions()` retourne `Record<string, Record<string, unknown>>` qui n'est pas assignable a `SharedV3ProviderOptions`. Fix : cast via `as Parameters<typeof streamText>[0]['providerOptions']` ou `any`
- **Import path hooks → preload** : depuis `src/renderer/src/hooks/`, le chemin relatif vers preload est `../../../preload/types` (3 niveaux), PAS `../../../../preload/types` (4 niveaux comme depuis components/chat)
- **Keychain/safeStorage apres rebuild** : un rebuild complet de l'app peut invalider l'acces Keychain aux cles API chiffrees. Symptome : "API key not configured" pour tous les providers. Fix : re-saisir les cles dans Settings > API Keys. Ce n'est PAS un probleme de code, c'est un probleme de signature app qui change entre builds

## Bardas — Gestion de Brigade (S41)

- **TOCTOU namespace** : les checks `getBardaByNamespace()` + `countActiveFragments()` DOIVENT etre DANS la transaction SQLite (pas avant). Sinon 2 imports concurrents du meme namespace passent les checks
- **Desinstallation non-atomique** : les 8 DELETE de `deleteResourcesByNamespace()` + `deleteBarda()` DOIVENT etre dans une seule `db.transaction()`. Sinon crash mid-way = DB inconstante
- **nanoid interdit** : utiliser `crypto.randomUUID()` partout (convention projet post-S33, compatibilite Qdrant)
- **Path validation** : `validateBardaPath()` dans barda.ipc.ts — realpathSync, ext .md, BLOCKED_ROOTS. Sans ca = lecture fichier arbitraire
- **lastIndexOf pour split sections** : NE PAS utiliser `body.lastIndexOf('\n## ', nextPos)` pour couper les sections Markdown — fragile. Utiliser `matchStart` du regex directement
- **MCP servers non namespaces** : by design, les serveurs MCP importes ne sont PAS prefixes par le namespace (globaux). La collision entre bardas est attendue (skip)
- **Filtre namespace renderer** : utiliser `disabledNamespaces` Set du barda store, filtrer avec `.filter(r => !r.namespace || !disabledNamespaces.has(r.namespace))` dans les useMemo/JSX des 6 vues
- **Branche feature-barda** : non commitee/mergee. Tous les fichiers sont en place, typecheck passe, code review faite et corrections appliquees

## Restant a faire

- Search bar sidebar, BranchNavigation, Export PDF
- i18n (configure mais pas utilise)
- MCP : presets serveurs, import config Claude Desktop, chiffrer headers HTTP
- Certificat Apple Developer ID (99$/an)
- Remote Web : branche `feature-remote-web`, a valider visuellement
- Referentiels RAG : strategie d'embedding custom (spec `feature-custom-rag-embedding-strategy.md`), branche `feature-rag`
- Conversation branching (fork a partir d'un message)
- Arena : enrichir avec workspace tools/MCP, stats view dediee, leaderboard
- Voice mode (STT Whisper + TTS existant)
- "Cruchot mode" (easter egg system prompt Marechal des Logis-Chef)
