# Design — Fix Cleanup Zone Orange + ServiceRegistry + Lazy Loading

> Date : 2026-04-02 (S50+)
> Scope : 2 items backlog BASSE du progress.md

---

## 1. Fix cleanup zone orange (deleteConversationsProjectsImages)

### Probleme

`deleteConversationsProjectsImages()` supprime 11 tables dont bardas, skills, mcpServers, slashCommands et libraries. Ces entites sont des assets de personnalisation, pas des donnees conversationnelles. La "zone orange" doit conserver tout ce qui n'est pas lie aux conversations.

### Tables a supprimer (zone orange)

| Table | Raison |
|-------|--------|
| `attachments` | Lies aux messages |
| `images` | Generees dans des conversations |
| `arenaMatches` | Lies aux conversations arena |
| `remoteSessions` | Sessions ephemeres |
| `vectorSyncState` | Sync Qdrant des conversations |
| `messages` | Contenu des conversations |
| `scheduledTasks` | Liees aux conversations |
| `conversations` | Conversations elles-memes |
| `projects` | Projets (contiennent les conversations) |

### Tables a NE PLUS supprimer

| Table | Raison |
|-------|--------|
| `bardas` | Assets de personnalisation |
| `skills` | Assets de personnalisation |
| `mcpServers` | Config infrastructure |
| `slashCommands` | Config utilisateur + builtins |
| `libraries` / `librarySources` / `libraryChunks` | Referentiels RAG = assets |

### Impact factoryResetDatabase

Inchange (supprime tout). Ajouter `permissionRules` qui manque dans les deux fonctions.

### Impact dialog UI

Le message du dialog natif doit lister aussi : bardas, skills, MCP, commandes, referentiels comme conserves.

### Fichiers touches

- `src/main/db/queries/cleanup.ts` — retirer les DELETE sur bardas, skills, mcpServers, slashCommands, libraries, librarySources, libraryChunks. Ajouter permissionRules au factory reset.
- `src/main/ipc/data.ipc.ts` — mettre a jour le texte du dialog zone orange.

---

## 2. ServiceRegistry + Lazy Loading

### Interface Stoppable

```typescript
interface Stoppable {
  stop(): Promise<void>
}
```

### ServiceRegistry (services/registry.ts)

- `Map<string, Stoppable>` interne
- `register(name, service)` — enregistre le service, log en dev
- `unregister(name)` — pour factory reset (service detruit sans quit)
- `stopAll(): Promise<void>` — itere en LIFO (dernier enregistre = premier stoppe), sequentiel
- `has(name)` — debug/tests
- Singleton : `export const serviceRegistry = new ServiceRegistry()`

### Ordre de stop LIFO

Ordre d'init : scheduler → MCP → telegram → remote → qdrant (embedding implicite).
LIFO inverse : qdrant → remote → telegram → MCP → scheduler.
Consumers d'abord, infrastructure ensuite. DB hors registry, fermee manuellement apres stopAll.

### Services lazy-loaded (dynamic import)

| Service | Condition de chargement | Moment |
|---------|------------------------|--------|
| `telegramBotService` | Session Telegram active en DB | app.whenReady |
| `remoteServerService` | Flag "was enabled" en settings | app.whenReady |
| `mcpManagerService` | Serveurs MCP configures en DB | app.whenReady |
| `qdrantMemoryService` | Setting memoire semantique activee | app.whenReady |
| `embedding` (worker) | Charge par qdrantMemoryService | Implicite |

### Services en import statique (restent tels quels)

| Service | Raison |
|---------|--------|
| `schedulerService` | Leger, toujours necessaire |
| `skillService` | Sync skills au startup, leger |
| `updater` | Critique pour les updates, leger |

### Structure index.ts apres refacto

```
app.whenReady():
  1. initDatabase + runMigrations (synchrone)
  2. registerAllIpcHandlers()
  3. createMainWindow()
  4. ensureSandboxDir + skills sync + seedBuiltins (synchrone, leger)
  5. schedulerService.init(mainWindow) → registry.register('scheduler', ...)
  6. lazyInitServices(mainWindow):
     - check DB/settings pour chaque service
     - import() conditionnel
     - chaque service fait .init() puis registry.register()
```

### Structure before-quit apres refacto

```
before-quit:
  1. await serviceRegistry.stopAll()  // LIFO
  2. closeDatabase()                  // Toujours en dernier
  3. app.quit()
```

### Impact sur les IPC handlers

Les handlers (data.ipc.ts) qui font `await import(...)` continuent de fonctionner — le dynamic import retourne le module deja charge s'il l'est, ou le charge a la demande sinon. Aucun changement necessaire.

### Fichiers touches

- `src/main/services/registry.ts` — nouveau fichier (~30 lignes)
- `src/main/index.ts` — refacto imports + init + before-quit
- Services concernes : chaque `.init()` ajoute `serviceRegistry.register(name, this)` apres init reussie

---

## Fichiers impactes (resume)

| Fichier | Action |
|---------|--------|
| `src/main/services/registry.ts` | **Nouveau** — ServiceRegistry |
| `src/main/db/queries/cleanup.ts` | **Modifie** — retirer tables non-conversationnelles, ajouter permissionRules |
| `src/main/ipc/data.ipc.ts` | **Modifie** — texte dialog zone orange |
| `src/main/index.ts` | **Modifie** — lazy imports, lazyInitServices, before-quit simplifie |
| `src/main/services/telegram-bot.service.ts` | **Modifie** — register dans init |
| `src/main/services/remote-server.service.ts` | **Modifie** — register dans init |
| `src/main/services/mcp-manager.service.ts` | **Modifie** — register dans init |
| `src/main/services/qdrant-memory.service.ts` | **Modifie** — register dans init |
| `src/main/services/scheduler.service.ts` | **Modifie** — register dans init |
