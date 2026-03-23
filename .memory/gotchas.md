# Gotchas — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-23 (S44)

## AI SDK v6 — Breaking changes

- `chunk.text` (pas `textDelta`), `result.usage` → `inputTokens`/`outputTokens`
- `inputSchema` (pas `parameters`), `stopWhen: stepCountIs(N)` obligatoire (default = 1)
- `NoOutputGeneratedError` : verifier `.cause`. `consumeStream()` avale les erreurs
- **Pas de `onFinish`** — save apres `await result.text` + `await result.usage`
- `streamText()` sans tools : `maxTokens` rejete comme propriete inconnue → spread conditionnel ou cast `any`

## providerOptions par provider

- Anthropic : `{ anthropic: { thinking: { type: 'enabled', budgetTokens } } }`
- OpenAI : `{ openai: { reasoningEffort: 'low' | 'medium' | 'high' } }`
- Google : `{ google: { thinkingConfig: { thinkingBudget: number } } }`
- xAI : `{ xai: { reasoningEffort: 'low' | 'high' } }` (pas medium/none)
- DeepSeek : binaire. Qwen/Magistral : decoratif

## Pieges recurrents

- **Radix ScrollArea** : `display: table` casse flex → `overflow-y-auto`
- **Radix Select** : `<SelectLabel>` exige `<SelectGroup>` → `<div>` pour headers
- **Radix popover** : `overflow-hidden` parent clippe les dropdowns → portail
- **Zustand persist** : nouveaux champs = `undefined` → `?? defaultValue`
- **Preload** : non recharge en HMR → restart app complet
- **Chokidar / @ai-sdk/mcp** : ESM → dynamic import + `external`
- **Import paths** : stores/ = 3 `../` vers preload, components/chat = 4 `../`
- **ANSI codes** : `FORCE_COLOR=0 NO_COLOR=1` dans env child_process
- **macOS Alt key** : OPT+B → `∫`. Utiliser `e.code === 'KeyB'` (hardware)
- **CMD+B Chromium** : intercepte pour bold → `addEventListener(capture: true)`
- **CMD+B = sidebar** : toggleSidebar(), PAS workspace panel
- **React 19** : `contentData: Record<string, unknown>` empoisonne JSX → cast `as string`
- **Gemini hallucine des tool calls** en XML brut (`<function_calls>`)

## Drizzle / SQLite

- Aggregations : core query builder + `sql<T>()` (PAS relational queries)
- Timestamps en secondes, params `Math.floor()`
- FTS5 : table virtuelle manuelle, WAL checkpoint au demarrage
- `foreign_keys = ON` via pragma
- Tables dans `migrate.ts` avec `CREATE TABLE IF NOT EXISTS`
- Cleanup : ordre FK strict (arena_matches → messages, library_chunks → sources → libraries)
- `.references()` ne cree PAS d'index → ajouter manuellement
- `db.transaction(fn)` execute directement (PAS `db.transaction(fn)()`)

## Qdrant / Memoire Semantique

- Config YAML `--config-path` (PAS CLI args --port/--storage-path)
- `device: 'cpu'` (pas 'wasm' — n'existe pas en Node.js)
- Point IDs : `crypto.randomUUID()` (PAS nanoid)
- Filtre : `should` au top-level (pas nested dans `must`)
- chunkText : guard `Math.max(nextStart, start + 1)` anti-boucle infinie
- `NODE_ENV_ELECTRON_VITE` pour detecter prod (pas `NODE_ENV`)

## Distribution

- `externalizeDepsPlugin()` sans args externalise TOUT → crash. Utiliser `exclude`
- Strategie : external = natifs/ESM seulement, tout le reste bundle via `exclude`
- `bufferutil`/`utf-8-validate` en `rollupOptions.external` (deps optionnelles ws)
- Build arm64 (pas universal — plante sur test_extension.node)
- `forceCodeSigning: false`, `notarize: false` pour dev local
- Gatekeeper macOS : `xattr -cr` apres copie
- `manualChunks` : forme fonction (pas string-array)
- esbuild drop console : top-level section main, conditionne `isProd`

## Referentiels RAG Custom

- pdf-parse : importer `pdf-parse/lib/pdf-parse.js` (contourne test code index.js)
- Google embedding : `gemini-embedding-2-preview` (768d), API `.embedding()` (pas `.textEmbeddingModel()`)
- Dynamic `require()` echoue dans bundle → imports statiques
- mammoth : `convertToMarkdown()` pour referentiels, `extractRawText()` pour attachments

## Securite — risques acceptes

- pdf-parse v1.1.1 non maintenu (import direct), MCP headers HTTP en clair en DB
- `currentAbortController` global fragile multi-fenetres, `removeAllListeners(channel)` trop large
- `legacy-peer-deps=true` (.npmrc), Semgrep FP localhost Qdrant

## Performance — opportunites

- Token batching IPC 50ms (gros gain), Shiki re-highlight par token, Mermaid 800KB dynamic import
- messages store flat array sans pagination

## Seatbelt / Conversation Tools (S44)

- Seatbelt `-f fichier.sb` (PAS `-p inline` — injection shell)
- NVM path : `readdirSync` (pas `$(ls ...)` — pas evalue par un shell)
- `(allow network*)` dans profil SBPL (reseau complet)
- Fallback exec() sans sandbox sur Windows/Linux

## Restant a faire

Voir [feature wishlist](../memory/project_feature_wishlist.md) dans MEMORY.md
