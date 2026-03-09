# Gotchas — Multi-LLM Desktop

**Dernière mise à jour** : 2026-03-09

## Phase de planification

### InputZone.tsx — fichier à haut risque de conflit
9 tâches différentes modifient ce composant (T15, T18, T29, T31, T33, T42, T44, T46, T48). En mode team, un seul agent doit en être propriétaire (Agent C "features-ui"). Les autres agents définissent des interfaces/props dans leurs propres fichiers.

### ipc/index.ts — registre central
Chaque nouveau domaine IPC ajoute un import dans ce fichier. Risque de conflit trivial au merge (ajout de lignes). Mitigation : chaque handler est dans son propre fichier (`chat.ipc.ts`, `projects.ipc.ts`, etc.).

### Google Generative AI SDK — remplacé par AI SDK
Le SDK `@google/generative-ai` n'est plus utilisé. Le projet utilise `@ai-sdk/google` du Vercel AI SDK. Plus de souci de dépréciation.

### AbortController — côté client seulement
L'annulation via AbortController stoppe la requête côté client mais le serveur continue à consommer des tokens. L'utilisateur est quand même facturé pour les tokens générés avant l'abort.

### Drizzle — aggregations + relational queries
Les aggregations SQL (`sum`, `count`) ne fonctionnent PAS avec les relational queries de Drizzle. Il faut utiliser le core query builder avec `sql<T>()` template literals.

### Zustand middleware order
L'ordre des middlewares compte : le plus interne s'exécute en premier. Pattern correct :
`create()(devtools(persist(subscribeWithSelector(immer(...)))))` — immer est le plus interne.

### electron-vite — chemin du preload en dev
electron-vite build le preload séparément. En dev, le chemin du preload est différent de la production. Utiliser `path.join(__dirname, '../preload/index.js')` qui fonctionne dans les deux cas.

### better-sqlite3 — WAL checkpoint
Sans checkpoint périodique, le fichier WAL peut grossir indéfiniment. Lancer `PRAGMA wal_checkpoint(RESTART)` périodiquement ou au démarrage.

### SQLite FTS5 — table virtuelle
La table FTS5 doit être créée manuellement (pas via Drizzle schema). Utiliser une migration SQL raw pour `CREATE VIRTUAL TABLE messages_fts USING fts5(content, title)`.

### Skill frontend-design — systématique sur tout l'UI
Décision prise : la skill `document-skills:frontend-design` doit être utilisée pour TOUS les composants UI visibles, pas seulement les écrans majeurs. Chaque prompt agent dans team.md inclut cette instruction.

### team.md — lancement de la team
Pour lancer la team multi-agents : `cat team.md | claude` dans un tmux. Le fichier est 100% autonome — il contient toutes les instructions, contexte, tâches, prompts agents, sync points. Aucun autre fichier n'est nécessaire pour le lancement.

### Agents P1 — propriété des fichiers
- Agent A (llm) : UNIQUEMENT `src/main/llm/` + `src/main/services/openrouter.service.ts` + `src/main/services/local-providers.service.ts`
- Agent B (features-main) : `src/main/db/queries/`, `src/main/ipc/`, `src/main/services/`, stores/projets-prompts-rôles
- Agent C (features-ui) : `src/renderer/src/components/chat/`, hooks — PROPRIÉTAIRE EXCLUSIF de InputZone.tsx et MessageItem.tsx
- Agent D (features-rich) : `src/renderer/src/components/images,statistics/`, locales, ipc/images+files

## Quotas et limites

### Vercel AI SDK — providerOptions
Les `providerOptions` sont spécifiques à chaque provider et ne sont pas typées de manière uniforme. Pour Anthropic Extended Thinking : `providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens } } }`. Toujours utiliser `satisfies AnthropicLanguageModelOptions` pour le type-checking.

### Image generation — Gemini uniquement
Seuls 2 modèles sont supportés pour la génération d'images : `gemini-3.1-flash-image-preview` (rapide) et `gemini-3-pro-image-preview` (qualité). Pas de DALL-E, pas de Nano Banana.

### Quota Claude Code
Romain attend la remise à zéro de son quota avant de lancer l'implémentation. Le plan T01 est prêt dans `.claude/plans/virtual-soaring-lollipop.md`.
