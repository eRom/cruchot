# Gotchas — Multi-LLM Desktop
> Derniere mise a jour : 2026-03-11 (session 23 — Remote Telegram)

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
- WorkspacePanel : toggle (pas close), ne PAS auto-open au changement de conversation
- Blocs de code : padding interne
- Remote badge : dans ContextWindowIndicator (bottom InputZone), PAS dans la toolbar

## Securite — pieges decouverts session 20

- **Bash tool blocklist** : une blocklist (deny list) est fondamentalement insuffisante — contournements triviaux (variables shell, base64, heredocs). L'env minimal (PATH restreint, zero process.env) est la vraie protection. La blocklist est un filet supplementaire, pas la securite primaire.
- **MCP headers HTTP** : stockes en clair en DB (pas chiffres contrairement aux env vars) — masques du renderer mais pas chiffres au repos. Inconsistance a corriger eventuellement.
- **connect-src 'none'** casse le HMR Vite (websocket) → utiliser `connect-src 'self'`
- **BrowserWindow.getFocusedWindow()** peut retourner une fenetre differente de la source IPC → toujours utiliser `BrowserWindow.fromWebContents(event.sender)`
- **validateAttachment** : acceptait n'importe quel path (y compris ~/.ssh/id_rsa) → confine maintenant a userData + workspace
- **`removeAllListeners(channel)`** est global — supprime TOUS les listeners, pas seulement celui de l'instance. Risque en multi-fenetre. Amelioration future : `removeListener` avec ref stockee.
- **pdf-parse v1.1.1** non maintenu depuis 2018 — surveiller ou migrer vers pdfjs-dist

## Distribution / Packaging (session 21)

- **electron-builder pas installe** par defaut — doit etre en devDependency, sinon `npm run dist:mac` echoue (exit 127)
- **externalizeDepsPlugin()** sans args externalise TOUT (drizzle-orm, ai, zod...) → crash "Cannot find module" en production. Solution : `exclude` liste explicite des deps JS pures a bundler
- **Build universal + ad-hoc signature** : Team IDs differents entre binaire principal et Electron Framework → `dyld: Library not loaded`. Fix : `codesign --force --deep --sign -` apres copie dans /Applications
- **Gatekeeper bloque silencieusement** les apps non signees/non notarisees (pas de dialog, juste rien) → `xattr -cr` pour supprimer la quarantaine en dev
- **`drizzle/` migrations** : warning `file source doesn't exist` dans electron-builder car le dossier n'existe pas encore (extraResources). Non bloquant.
- **Certificat Apple Developer ID** requis pour distribution publique — sans lui, seul le dev local fonctionne (ad-hoc + codesign + xattr)
- **Secrets GitHub** a configurer pour CI release : `MAC_CERTIFICATE_P12_BASE64`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`

## Workspace Tools — pieges session 22

- **readFile sans filtre** : le LLM lisait n'importe quoi (binaires, .env, node_modules) → crash "Binary file detected". Fix : whitelist d'extensions textuelles + blocklist fichiers sensibles + blocklist segments gitignore
- **maxSteps: 10 trop bas** : le LLM atteignait la limite sur des taches simples (20 tool calls pour un "bonjour"). Fix : monte a 50 (app locale, pas de risque de cout)
- **LLM lit tout le workspace au premier message** : sans contexte initial, le LLM passe 20+ tool calls a decouvrir le projet. Fix : `buildWorkspaceContextBlock()` injecte automatiquement CLAUDE.md, README.md, etc. dans le system prompt
- **ToolCallBlock/ReasoningBlock restent ouverts** : `useState(isStreaming)` ne se replie jamais quand `isStreaming` passe a false. Fix : `useRef` + `useEffect` pour detecter la transition true→false et `setExpanded(false)`
- **FileTree replie par defaut** : `useState(depth < 2)` ouvrait trop de dossiers → `useState(false)` pour tout replier

## Git Integration — pieges session 22

- **exec vs execFile** : `exec` permet l'injection shell (`; rm -rf /`), `execFile` ne passe que des arguments → toujours `execFile` pour Git
- **GIT_TERMINAL_PROMPT=0** : sans ca, git peut bloquer en attendant un mot de passe (ex: repo prive sans SSH key)
- **git status --porcelain=v1** : le format est `XY path` avec X=staging, Y=working. Pour les renommages, le format est `R  old -> new` → parser la fleche
- **Cache invalidation** : le FileWatcher ignore `.git/` → les changements Git internes (stage, commit) ne declenchent pas de file change. Le cache est invalide manuellement dans les methodes stage/unstage/commit
- **Debounce git:changed** : sans debounce, un `git add -A` sur 50 fichiers enverrait 50 events. Debounce 500ms dans `onWorkspaceFileChanged()`

## Remote Telegram — pieges session 23

- **"no such table: remote_sessions"** : `drizzle-kit generate` cree un fichier SQL de migration mais le projet utilise `CREATE TABLE IF NOT EXISTS` manuels dans `src/main/db/migrate.ts`. Il faut ajouter la table la-bas, pas compter sur les migrations Drizzle.
- **Dynamic imports dans telegram-bot.service.ts** : `await import('../db')` et `await import('../db/schema')` generent des warnings Vite quand les modules sont aussi importes statiquement ailleurs. Fix : utiliser des imports statiques directs.
- **Conversation bridge** : l'approche initiale creait une conv "[Remote] Session" au pairing → l'utilisateur voulait continuer la conv desktop active. Fix : passer `conversationId` dans toute la chaine `RemoteBadge → store.start() → preload → IPC → telegramBot.start()`.
- **Placement du bouton Remote** : teste dans la toolbar InputZone → "mitigue". Deplace dans `ContextWindowIndicator` (barre tokens en bas) → valide. Pattern : `[Badge Remote] ═══ ~318 / 1.0M tokens <$0.01`
- **WorkspacePanel auto-open** : `openWorkspace()` dans workspace.store.ts forcait `isPanelOpen: true` → le panneau s'ouvrait a chaque changement de conversation. Fix : retirer le `isPanelOpen: true`, conserver l'etat existant du panneau.
- **User ID obligatoire** : le champ "Mon ID Telegram" est obligatoire (pas optionnel). Le formulaire token + userId est unifie avec un seul bouton "Valider" qui exige les deux champs.
- **MarkdownV2 Telegram** : les caracteres speciaux (`_*[]()~>#+=|{}.!-`) doivent etre echappes SAUF dans les code blocks. Fallback texte brut si erreur 400 "parse entities".
- **Message split** : Telegram limite a 4096 chars. Split intelligent : paragraphe > ligne > hard cut. Les code blocks ouverts doivent etre fermes/rouverts aux frontieres de split.
- **Rate limiting Telegram** : 429 avec `Retry-After` → respecter le delai, retry 1 fois. 401 → token revoque, disconnected. 403 → bot bloque.

## Restant a faire

- Search bar sidebar (T34)
- BranchNavigation dans MessageItem (T45)
- Prompt Optimizer (T48), Export PDF (T52)
- i18n (T41) — configure mais pas utilise
- SSH key GitHub non configuree
- MCP : presets serveurs, import config Claude Desktop
- MCP : chiffrer les headers HTTP comme les env vars
- Certificat Apple Developer ID (99$/an) pour signature + notarisation
- Test app packagee (crash au lancement a investiguer — probablement lie aux node_modules manquants, a retester apres fix externals)
