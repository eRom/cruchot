# Données, Base Relationnelle et Stockage Vectoriel

Cruchot est une application "Local-First". Toutes les données utilisateurs (conversations, paramètres, clés, documents) restent sur la machine. Pour gérer cette complexité, l'application s'appuie sur une base de données relationnelle (SQLite) couplée à une base vectorielle (Qdrant) pour la mémoire sémantique.

## 1. La Base de Données Relationnelle (SQLite + Drizzle)

La base de données principale est gérée par **Better-SQLite3** et l'ORM **Drizzle**. Le fichier de base de données est stocké dans le profil utilisateur (`~/.cruchot/db/main.db`).

### 1.1 Le Schéma (`schema.ts`)
Le schéma est complet et gère toutes les entités de l'application :
- **Configuration** : `providers`, `models`, `settings`.
- **Chat** : `projects`, `conversations`, `messages`, `attachments`, `images`.
- **IA & Context** : `roles`, `prompts`, `memoryFragments`, `slashCommands`.
- **RAG & Librairies** : `libraries`, `librarySources`, `libraryChunks`.
- **Outils & Extension** : `mcpServers`, `skills`, `permissionRules`, `bardas`.
- **Opérations** : `scheduledTasks`, `statistics`, `ttsUsage`, `arenaMatches`, `remoteSessions`.

### 1.2 Migrations et Évolutivité
Les migrations de schéma sont générées par `drizzle-kit` et exécutées automatiquement au lancement de l'application via `runMigrations()`. Cela garantit que la base de données locale de l'utilisateur est toujours à jour avec la version de l'application.

## 2. Base Vectorielle et Mémoire Sémantique (Qdrant)

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

### 3.2 Dimensions et Modèle
Par défaut, le modèle local génère des vecteurs de dimension 384 (`EMBEDDING_DIM`). La base Qdrant est configurée pour accepter exactement cette dimension lors de la création de la collection.
