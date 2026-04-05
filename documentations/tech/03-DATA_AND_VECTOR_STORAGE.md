# Données, Base Relationnelle et Stockage Vectoriel

Cruchot est une application "Local-First". Toutes les données utilisateurs (conversations, paramètres, clés, documents) restent sur la machine. Pour gérer cette complexité, l'application s'appuie sur une base de données relationnelle (SQLite) couplée à une base vectorielle (Qdrant) pour la mémoire sémantique.

## 1. La Base de Données Relationnelle (SQLite + Drizzle)

La base de données principale est gérée par **Better-SQLite3** et l'ORM **Drizzle**. Le fichier de base de données est stocké dans le profil utilisateur Electron (`app.getPath('userData')/db/main.db`, soit `~/Library/Application Support/cruchot/db/main.db` sur macOS).

### 1.1 Le Schéma (`schema.ts`)
Le schéma est complet et gère toutes les entités de l'application :
- **Configuration** : `providers`, `models`, `settings`.
- **Chat** : `projects`, `conversations`, `messages`, `attachments`, `images`.
- **IA & Context** : `roles`, `prompts`, `memoryFragments`, `slashCommands`.
- **RAG & Librairies** : `libraries`, `librarySources`, `libraryChunks`.
- **Outils & Extension** : `mcpServers`, `skills`, `permissionRules`, `bardas`, `customModels`.
- **Opérations** : `scheduledTasks`, `statistics`, `ttsUsage`, `arenaMatches`, `remoteSessions`.
- **Applications** : `allowedApps` (applications locales et sites web autorisés à être ouverts).

Le schéma totalise **30 tables** Drizzle (dont `episodes` en S55, `oneiric_runs` en S56, `allowedApps` en S59).

Colonnes notables ajoutées sur `conversations` :
- `compactSummary` (text | null) — résumé LLM généré lors d'une compaction complète.
- `compactBoundaryId` (text | null) — ID du dernier message inclus dans la compaction (point d'ancrage).

### 1.2 Migrations et Évolutivité
Les migrations sont gérées par des instructions SQL manuelles dans `migrate.ts` (pattern `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` avec gestion d'idempotence). Elles sont exécutées automatiquement au lancement de l'application via `runMigrations()`. Cela garantit que la base de données locale de l'utilisateur est toujours à jour avec la version de l'application.

## 2. Mémoire Épisodique (Episodes)

La mémoire épisodique est une troisième couche de mémoire, distincte de la mémoire sémantique Qdrant et des fragments manuels. Elle **distille automatiquement** des faits comportementaux sur l'utilisateur à partir des conversations, dans le style "Mem0".

### 2.1 Table `episodes`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | text PK | nanoid |
| `content` | text | Le fait distillé ("Préfère les réponses courtes") |
| `category` | text | enum: `preference`, `behavior`, `context`, `skill`, `style` |
| `confidence` | real | Score 0.0 — 1.0 fourni par le LLM |
| `occurrences` | integer | Nombre de fois observé (default 1) |
| `projectId` | text \| null | null = global, sinon scopé à un projet |
| `sourceConversationId` | text | Conversation d'origine (pas de FK — l'épisode survit à la suppression) |
| `isActive` | integer | Boolean (default 1) |
| `createdAt` / `updatedAt` | integer | Timestamps seconds |

Index : `idx_episodes_active_project` sur `(isActive, projectId)`.

**Pas de FK** vers `conversations` : les épisodes survivent à la suppression de la conversation source.

### 2.2 Colonne `lastEpisodeMessageId` sur `conversations`

Pointe vers le dernier message traité pour l'extraction. Permet de ne traiter que le **delta** (les nouveaux messages depuis la dernière extraction), évitant de reprocesser toute la conversation à chaque fois.

### 2.3 Scope et injection dans le system prompt

Au recall, les épisodes injectés sont : les globaux (`projectId IS NULL`) + ceux du projet actif. Le bloc est formaté en XML :

```xml
<user-profile>
Profil comportemental de l'utilisateur :

[preference] (confiance: 95%, vu 12x) Préfère les réponses courtes
[style] (confiance: 87%, vu 5x) Ton sec et direct, humour noir
[skill] (confiance: 80%, vu 3x) Expert TypeScript, débutant Rust
</user-profile>
```

Règles d'injection (`episode-prompt.ts`) : `isActive = true`, `confidence >= 0.3`, tri `confidence * log(occurrences + 1)` desc, cap 100 épisodes / ~2500 tokens. Ce bloc est injecté en **position 3** dans le system prompt, après `<semantic-memory>` et avant `<user-memory>`.

### 2.4 IPC (`episode.ipc.ts`)

| Channel | Description |
|---------|-------------|
| `episode:list` | Liste épisodes (filtres: projectId, category, isActive) |
| `episode:toggle` | Toggle isActive |
| `episode:delete` | Supprime un épisode |
| `episode:delete-all` | Supprime tous les épisodes |
| `episode:stats` | Count, dernière extraction, modèle |
| `episode:set-model` | Sauvegarde le modèle d'extraction |
| `episode:extract-now` | Force extraction manuelle (debug/test) |

Validation Zod sur tous les payloads. 7 méthodes `window.api.episode*` exposées via `contextBridge`.

### 2.5 Table `oneiric_runs`

Traçabilité de chaque pipeline de consolidation onirique :

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | text PK | nanoid |
| `status` | text | enum: `running`, `completed`, `failed`, `cancelled` |
| `trigger` | text | enum: `scheduled`, `manual`, `quit` |
| `modelId` | text | Modèle LLM utilisé (format `providerId::modelId`) |
| `chunksAnalyzed/Merged/Deleted` | integer | Stats phase sémantique |
| `episodesAnalyzed/Reinforced/Staled/Deleted/Created/Updated` | integer | Stats phases épisodique + croisée |
| `tokensIn` / `tokensOut` / `cost` | integer/real | Consommation LLM totale |
| `durationMs` | integer | Durée totale du run |
| `errorMessage` | text \| null | Message d'erreur si `failed` |
| `actions` | text JSON | Tableau détaillé des actions appliquées (`OneiricAction[]`) |
| `startedAt` / `completedAt` | integer | Timestamps |

Colonne `lastOneiricRunAt` ajoutée sur la table `conversations` : timestamp du dernier passage de la phase sémantique. Sert à identifier les conversations à consolider (`lastOneiricRunAt IS NULL OR updatedAt > lastOneiricRunAt`).

## 3. Recherche Plein Texte (FTS5)

Cruchot intègre une recherche plein texte rapide sur l'ensemble des messages, basée sur l'extension **FTS5** de SQLite.

### 2.1 Table Virtuelle et Synchronisation

Une table virtuelle `messages_fts` (FTS5) est créée avec `content='messages'` et `content_rowid='rowid'`. Des triggers SQLite (`messages_ai`, `messages_au`, `messages_ad`) maintiennent automatiquement l'index FTS5 en sync avec la table `messages` lors de chaque INSERT / UPDATE / DELETE.

Le mode **prefix matching** est activé (`prefix='2,3'`), ce qui permet des recherches partielles : taper `arti` remonte les messages contenant `article`, `articles`, etc.

### 2.2 Query et Filtres

La fonction `searchMessages(query, filters?)` dans `src/main/db/queries/search.ts` :

- **Sanitise** la query FTS5 (échappe les caractères spéciaux, ajoute le suffixe `*` pour le prefix matching).
- Accepte un objet `SearchFilters` optionnel : `{ role?: 'user' | 'assistant', projectId?: string }`.
- Retourne les résultats avec `snippet` FTS5 (extrait contextuel de 10 tokens, terme en gras), ainsi que `conversationId`, `conversationTitle`, `projectId`, `createdAt`, `role` et `modelId`.
- Les résultats sont groupés par conversation côté renderer.

### 2.3 IPC Handler

Le handler `search.ipc.ts` expose `search:messages` — il accepte un payload `{ query: string, filters?: SearchFilters }` et retourne un tableau de `SearchResult`.

## 4. Base Vectorielle et Mémoire Sémantique (Qdrant)

Pour offrir des fonctionnalités de RAG (Retrieval-Augmented Generation) et de "Mémoire Sémantique" à long terme, Cruchot embarque un binaire **Qdrant** compilé pour l'OS cible.

### 2.1 Gestion du Processus Qdrant
Le service `qdrant-process.ts` se charge de démarrer le binaire Qdrant en tâche de fond sur un port dédié (`QDRANT_PORT_NUMBER`). Il surveille l'état du processus et gère son arrêt propre à la fermeture de l'application.

### 2.2 Ingestion des Conversations (`qdrant-memory.service.ts`)
Le `QdrantMemoryService` agit comme un singleton pour gérer la mémoire sémantique :
- **Ingestion asynchrone** : Les messages (utilisateur et assistant) suffisamment longs sont placés dans une file d'attente (Queue).
- **Chunking intelligent** : Les textes trop longs sont découpés en morceaux (chunks) avec un chevauchement (overlap) pour préserver le contexte, en respectant les limites de phrases et de paragraphes.
- **Synchronisation SQLite/Qdrant** : La table `vectorSyncState` permet de suivre l'état d'indexation de chaque message (pending, indexed, failed).

### 2.3 Recherche Sémantique (Recall)
Lorsqu'un utilisateur pose une question, Cruchot peut interroger Qdrant pour retrouver les anciens messages pertinents. La recherche utilise le "Cosine Similarity" et peut être filtrée par projet, ou exclure la conversation courante.

## 5. Modèles d'Embeddings Locaux

Pour transformer le texte en vecteurs (embeddings) à stocker dans Qdrant sans envoyer les données privées dans le cloud, Cruchot utilise des modèles d'embeddings locaux.

### 3.1 Exécution Off-Thread (`embedding.service.ts`)
L'inférence d'embeddings via des modèles ONNX (via `@huggingface/transformers`) est intensive en CPU. Pour ne pas bloquer le processus principal d'Electron (Main thread), le service d'embedding tourne dans un **Worker Thread** Node.js séparé (`embedding.worker.js`).

### 3.2 Dimensions et Modèles
Deux modèles d'embeddings sont supportés :
- **Local** : `all-MiniLM-L6-v2` via ONNX, générant des vecteurs de dimension **384**. Utilisé par défaut pour la mémoire sémantique des conversations.
- **Google** : `gemini-embedding-2-preview` via `@ai-sdk/google`, générant des vecteurs de dimension **768**. Sélectionnable par bibliothèque RAG pour une meilleure qualité de recherche.

Chaque collection Qdrant est configurée pour la dimension du modèle choisi (`conversations_memory` = 384d, `library_{id}` = 384d ou 768d selon le modèle de la bibliothèque).

## 6. Applications Autorisées (`allowed_apps`)

La table `allowed_apps` gère la liste des applications locales et sites web que l'utilisateur autorise Cruchot à ouvrir — via la commande `/open` dans le chat ou via le tool `open_app` du Gemini Live Voice.

### 6.1 Table `allowed_apps`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | text PK | UUID |
| `name` | text | Nom affiché ("Zed", "Gmail") |
| `path` | text | Chemin absolu (local) ou URL HTTPS (web) |
| `type` | text | enum: `local` \| `web` |
| `description` | text \| null | Aide optionnelle pour la reconnaissance vocale |
| `isEnabled` | integer | Boolean — désactiver sans supprimer |
| `createdAt` / `updatedAt` | integer | Timestamps (mode: timestamp) |

Index : `idx_allowed_apps_enabled` sur `is_enabled`.

### 6.2 Sécurité

- **URLs** : seules les URLs `http:` / `https:` sont acceptées pour le type `web` — validées côté main process avant insertion et avant ouverture.
- **Chemin local** : passé à `shell.openPath()` (Electron) — seules les apps dans la liste peuvent être ouvertes.
- **Pas d'injection** : le renderer ne peut pas appeler `shell.openExternal()` directement — il passe par `applications:open` ou `applications:openByName` validés par Zod.

### 6.3 Queries (`db/queries/applications.ts`)

| Fonction | Usage |
|----------|-------|
| `listAllowedApps()` | Toutes les apps (UI de gestion) |
| `listEnabledApps()` | Apps actives seulement (Gemini Live) |
| `getAllowedAppByName(name)` | Recherche insensible à la casse (tool vocal) |
| `createAllowedApp(data)` | Création (IPC handler) |
| `updateAllowedApp(id, data)` | Mise à jour (IPC handler) |
| `toggleAllowedApp(id, bool)` | Activer / désactiver |
| `deleteAllowedApp(id)` | Suppression |
