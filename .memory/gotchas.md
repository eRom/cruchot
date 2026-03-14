# Gotchas — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-13 (S35)

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
- Cleanup : ordre FK strict, `slash_commands` avant `projects`

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

## Distribution

- `externalizeDepsPlugin()` sans args externalise TOUT → crash. Utiliser `exclude` liste
- Build universal + ad-hoc : `codesign --force --deep --sign -` apres copie /Applications
- Gatekeeper bloque silencieusement → `xattr -cr` en dev
- Certificat Apple Developer ID requis pour distribution publique

## Preferences UI de Romain

- Vues inline (pas modals), CRUD complet visible
- Footer message : actions hover a gauche, info a droite
- ModelSelector : liste plate, pas de groupement par provider
- WorkspacePanel : toggle (pas close), ne PAS auto-open au changement de conversation
- Remote badge : dans ContextWindowIndicator, PAS dans la toolbar
- UI web remote : calque visuel exact du desktop

## Securite — points a surveiller

- **pdf-parse v1.1.1** : non maintenu. Migrer vers pdfjs-dist eventuel
- **MCP headers HTTP** : en clair en DB (masques du renderer mais pas chiffres au repos)
- **`currentAbortController` global** : fragile en multi-fenetres
- **`removeAllListeners(channel)`** : trop large, risque en multi-fenetre

## Export/Import .mlx (S34)

- **Token instance hors whitelist** : stocke dans settings avec cle `multi-llm:instance-token`, mais PAS dans `ALLOWED_SETTING_KEYS` — acces uniquement depuis le main process, le renderer ne peut pas lire/ecrire via `settings:get/set`
- **Timestamps Drizzle** : `createdAt` peut etre `Date` ou `number` (secondes epoch) selon le contexte — le buildExportPayload() gere les deux cas via instanceof check
- **Import externe (ChatGPT/Claude/Gemini)** : hors scope, bouton grise "bientot disponible"

## Restant a faire

- Search bar sidebar, BranchNavigation, Prompt Optimizer, Export PDF
- i18n (configure mais pas utilise)
- MCP : presets serveurs, import config Claude Desktop, chiffrer headers HTTP
- Certificat Apple Developer ID (99$/an)
- Remote Web : branche `feature-remote-web`, a valider visuellement
- Import externe conversations (ChatGPT, Claude, Gemini) — bouton grise dans DataSettings
- Memoire semantique : fonctionnelle (S33), operation silencieuse (pas de badge visible)
