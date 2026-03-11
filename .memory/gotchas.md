# Gotchas — Multi-LLM Desktop

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
- **Import paths** : stores/ = 3 `../` vers preload, components/chat|workspace = 4 `../`
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

## Restant a faire

- Search bar sidebar (T34)
- BranchNavigation dans MessageItem (T45)
- MCP Integration (spec ecrite, `specs/feature-mcp-integration.md`)
- Prompt Optimizer (T48), Export PDF (T52), Packaging (T60)
- i18n (T41) — configure mais pas utilise
- SSH key GitHub non configuree
