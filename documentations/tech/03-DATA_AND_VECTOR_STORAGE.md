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

Le schéma totalise **27 tables** Drizzle.

### 1.2 Migrations et Évolutivité
Les migrations sont gérées par des instructions SQL manuelles dans `migrate.ts` (pattern `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` avec gestion d'idempotence). Elles sont exécutées automatiquement au lancement de l'application via `runMigrations()`. Cela garantit que la base de données locale de l'utilisateur est toujours à jour avec la version de l'application.

## 2. Recherche Plein Texte (FTS5)

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

## 3. Base Vectorielle et Mémoire Sémantique (Qdrant)

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

## 3. Modèles d'Embeddings Locaux

Pour transformer le texte en vecteurs (embeddings) à stocker dans Qdrant sans envoyer les données privées dans le cloud, Cruchot utilise des modèles d'embeddings locaux.

### 3.1 Exécution Off-Thread (`embedding.service.ts`)
L'inférence d'embeddings via des modèles ONNX (via `@huggingface/transformers`) est intensive en CPU. Pour ne pas bloquer le processus principal d'Electron (Main thread), le service d'embedding tourne dans un **Worker Thread** Node.js séparé (`embedding.worker.js`).

### 3.2 Dimensions et Modèles
Deux modèles d'embeddings sont supportés :
- **Local** : `all-MiniLM-L6-v2` via ONNX, générant des vecteurs de dimension **384**. Utilisé par défaut pour la mémoire sémantique des conversations.
- **Google** : `gemini-embedding-2-preview` via `@ai-sdk/google`, générant des vecteurs de dimension **768**. Sélectionnable par bibliothèque RAG pour une meilleure qualité de recherche.

Chaque collection Qdrant est configurée pour la dimension du modèle choisi (`conversations_memory` = 384d, `library_{id}` = 384d ou 768d selon le modèle de la bibliothèque).
