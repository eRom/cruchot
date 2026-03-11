# Gotchas — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11 (session 20 — audit securite)

## AI SDK v6 — Breaking changes (checklist)

- `chunk.text` (pas `textDelta`) dans `onChunk`
- `result.usage` → `inputTokens`/`outputTokens` (pas `promptTokens`/`completionTokens`)
- `inputSchema` (pas `parameters`) pour `tool()`
- `stopWhen: stepCountIs(N)` obligatoire pour multi-step (default = 1 step)
- `mediaType` (pas `mimeType`) sur `GeneratedFile`
- `NoOutputGeneratedError` : toujours verifier `.cause` — wrape souvent l'erreur API reelle
- `tool-result` chunks dans `onChunk` (pas `onStepFinish`)
- **Pas de `onFinish`** pour save couts — `await result.text` puis `await result.usage`
- `experimental_generateImage` = alias deprece de `generateImage`
- `consumeStream()` avale TOUTES les erreurs (dont AbortError) — ne pas utiliser

## Pieges recurrents

- **Radix ScrollArea** : `display: table` wrapper casse les layouts flex avec hover actions → utiliser `overflow-y-auto`
- **Radix Select** : `<SelectLabel>` exige `<SelectGroup>` → utiliser `<div>` pour les headers de section
- **Radix popover** : `overflow-hidden` sur un parent clippe les dropdowns → retirer
- **hotkeys-js** : virgule = separateur de raccourcis → listener natif `keydown` pour Cmd+,
- **Zustand persist** : nouveaux champs = `undefined` au 1er chargement → `?? defaultValue`
- **Preload** : non recharge en HMR → restart app complet apres modif `src/preload/` ou `src/main/`
- **Chokidar** : ESM + deps natives → `external` dans electron.vite.config, import dynamique
- **shadcn Switch** : n'existe pas dans le projet → button custom (cf TaskCard)
- **Import paths** : stores/ = 3 `../` vers preload, components/chat|workspace|mcp = 4 `../`
- **@ai-sdk/mcp** : ESM → dynamic import obligatoire + `external` dans electron.vite.config (comme chokidar)
- **Electron main** : jamais d'API sync bloquantes (execSync, etc.) → toujours async
- **ANSI codes** : `FORCE_COLOR=0 NO_COLOR=1` dans env child_process quand output consomme par du code

## providerOptions par provider

- Anthropic : `{ anthropic: { thinking: { type: 'enabled', budgetTokens } } }`
- OpenAI : `{ openai: { reasoningEffort: 'low' | 'medium' | 'high' } }`
- Google : `{ google: { thinkingConfig: { thinkingBudget: number } } }`
- xAI : `{ xai: { reasoningEffort: 'low' | 'high' } }` (pas medium/none)
- DeepSeek : `{ deepseek: { thinking: { type: 'enabled' } } }` (binaire)

## xAI — modeles Grok

- IDs : `grok-4-1-fast-reasoning` / `grok-4-1-fast-non-reasoning` (tirets, pas points)
- Chat API : `reasoningEffort` low|high seulement. Off = undefined.

## DeepSeek / Qwen / Magistral

- DeepSeek Reasoner raisonne toujours (meme thinking off)
- Qwen thinking decoratif (built-in, `createOpenAICompatible` ne supporte pas `enable_thinking`)
- Qwen endpoint : `dashscope-intl.aliyuncs.com` (Singapore)
- Magistral reasoning built-in, ThinkingSelector decoratif

## Drizzle / SQLite

- Aggregations (`sum`, `count`) : PAS avec relational queries → core query builder + `sql<T>()`
- Timestamps en secondes (Drizzle `mode: 'timestamp'`) — `date(createdAt, 'unixepoch')` sans /1000
- Params temporels : `Math.floor((Date.now() - days * 86400000) / 1000)` (entier, pas Date)
- WAL checkpoint au demarrage sinon WAL grossit indefiniment
- FTS5 : table virtuelle creee manuellement (pas via schema Drizzle)
- `foreign_keys = ON` via pragma (desactive par defaut)

## React 19

- `contentData: Record<string, unknown>` empoisonne les types JSX → caster : `(contentData?.type as string)`
- Fix definitif futur : union discriminee ou sous-composant isole

## Preferences UI de Romain

- Vues inline (pas modals), CRUD complet visible
- Modele par defaut obligatoire sur projet
- Params modele (temperature, maxTokens, topP) globaux, pas par modele
- Footer message : actions hover a gauche, info modele a droite
- ModelSelector : liste plate, pas de groupement par provider
- Pills InputZone : shadcn Select (pattern ThinkingSelector), RoleSelector apres ThinkingSelector
- Roles : description/icone/categorie masques
- WorkspacePanel : toggle (pas close)
- Blocs de code : padding interne

## Securite — pieges decouverts session 20

- **Bash tool blocklist** : une blocklist (deny list) est fondamentalement insuffisante — contournements triviaux (variables shell, base64, heredocs). L'env minimal (PATH restreint, zero process.env) est la vraie protection. La blocklist est un filet supplementaire, pas la securite primaire.
- **MCP headers HTTP** : stockes en clair en DB (pas chiffres contrairement aux env vars) — masques du renderer mais pas chiffres au repos. Inconsistance a corriger eventuellement.
- **connect-src 'none'** casse le HMR Vite (websocket) → utiliser `connect-src 'self'`
- **BrowserWindow.getFocusedWindow()** peut retourner une fenetre differente de la source IPC → toujours utiliser `BrowserWindow.fromWebContents(event.sender)`
- **validateAttachment** : acceptait n'importe quel path (y compris ~/.ssh/id_rsa) → confine maintenant a userData + workspace
- **`removeAllListeners(channel)`** est global — supprime TOUS les listeners, pas seulement celui de l'instance. Risque en multi-fenetre. Amelioration future : `removeListener` avec ref stockee.
- **Signature de code absente** dans electron-builder.yml — macOS notarisation + Windows SmartScreen non configures. Bloquant pour distribution publique.
- **pdf-parse v1.1.1** non maintenu depuis 2018 — surveiller ou migrer vers pdfjs-dist

## Restant a faire

- Search bar sidebar (T34)
- BranchNavigation dans MessageItem (T45)
- Prompt Optimizer (T48), Export PDF (T52), Packaging (T60)
- i18n (T41) — configure mais pas utilise
- SSH key GitHub non configuree
- MCP : presets serveurs, import config Claude Desktop
- MCP : chiffrer les headers HTTP comme les env vars
- Signature de code macOS/Windows pour distribution
