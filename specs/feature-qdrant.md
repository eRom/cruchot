# Feature Spec — Qdrant Vector Memory (RAG local)

> **Date** : 2026-03-13
> **Auteur** : Trinity + Romain
> **Statut** : Draft — Plan d'architecture
> **Priorite** : Feature majeure — memoire semantique long-terme pour le LLM

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Ce que ca apporte](#2-ce-que-ca-apporte)
3. [Architecture globale](#3-architecture-globale)
4. [Qdrant — Binaire local Rust](#4-qdrant--binaire-local-rust)
5. [Embeddings locaux — Transformers.js](#5-embeddings-locaux--transformersjs)
6. [Modele de donnees](#6-modele-de-donnees)
7. [Service QdrantMemory](#7-service-qdrantmemory)
8. [Ingestion automatique](#8-ingestion-automatique)
9. [Retrieval — Injection dans le chat](#9-retrieval--injection-dans-le-chat)
10. [Couche IPC](#10-couche-ipc)
11. [UI — Memoire semantique](#11-ui--memoire-semantique)
12. [Securite](#12-securite)
13. [Performance & Limites](#13-performance--limites)
14. [Plan d'implementation](#14-plan-dimplementation)
15. [Questions ouvertes](#15-questions-ouvertes)
16. [Ce qui ne change PAS](#16-ce-qui-ne-change-pas)
17. [Resume des fichiers](#17-resume-des-fichiers)

---

## 1. Vue d'ensemble

### Probleme

Aujourd'hui, la "memoire" du LLM se limite a :
- **Memory Fragments** : fragments textuels manuels injectes dans le system prompt (~50 fragments, 2000 chars max chacun)
- **Historique de conversation** : les messages de la conversation active uniquement
- **Workspace context** : fichiers attaches + auto-injection CLAUDE.md etc.

Le LLM n'a **aucune memoire inter-conversations**. Il ne peut pas "se souvenir" de ce qui a ete dit dans une conversation precedente, ni retrouver un contexte pertinent automatiquement.

### Solution

Integrer une **base vectorielle locale Qdrant** (binaire Rust) + un **modele d'embedding local** (Transformers.js / ONNX) pour creer une memoire semantique persistante :

```
Messages de conversation → Embedding local → Qdrant (vecteurs sur disque)
                                                    ↓
Nouveau message utilisateur → Embedding → Query Qdrant → Top-K resultats
                                                    ↓
                                        Injection dans le system prompt
                                        comme <semantic-memory> block
```

### Principes

- **100% local** : zero appel API pour l'embedding — ONNX runtime dans Node.js
- **Zero Docker** : Qdrant tourne comme binaire natif, gere par l'app Electron
- **Transparent** : l'utilisateur peut voir et gerer ce que le LLM "retient"
- **Opt-in** : la memoire semantique est activable/desactivable (par defaut activee)
- **Complementaire** : ne remplace pas les Memory Fragments (manuels) — s'ajoute

---

## 2. Ce que ca apporte

### Situation actuelle vs. avec Qdrant

| Capacite | Avant | Apres |
|----------|-------|-------|
| Memoire inter-conversations | Aucune | Rappel semantique des echanges passes |
| Recherche dans l'historique | FTS5 (mots-cles, conversation active) | Recherche semantique cross-conversations |
| Contexte LLM | Manuel (Memory Fragments) | Automatique (RAG) + Manuel |
| "Tu te souviens quand on a parle de X ?" | Impossible | Retrouve et injecte le contexte |

### Cas d'usage concrets

1. **Continuite** : "Reprends le travail qu'on avait fait sur le parser JSON" → retrouve les messages pertinents d'une ancienne conversation
2. **Preferences apprises** : Le LLM detecte des patterns recurrents ("Romain prefere toujours X") et les retrouve
3. **Base de connaissances** : Les reponses detaillees du LLM deviennent une base de connaissances interrogeable
4. **Projet multi-session** : Un projet etale sur 10 conversations garde un contexte semantique continu

---

## 3. Architecture globale

```
┌─────────────── Renderer ──────────────────────┐
│                                                │
│  Chat (InputZone)                              │
│  Settings > Memoire > "Memoire semantique"     │
│  MemoryExplorer (recherche + gestion)          │
│                                                │
└──────────────────┬─────────────────────────────┘
                   │ IPC
┌──────────────────┴─────────────────────────────┐
│               Main Process                      │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  QdrantMemoryService (singleton)          │  │
│  │                                           │  │
│  │  - init() → start Qdrant + load model     │  │
│  │  - ingest(message) → embed + upsert       │  │
│  │  - recall(query, topK) → search + return  │  │
│  │  - forget(pointIds) → delete              │  │
│  │  - getStats() → collection info           │  │
│  │  - stop() → graceful shutdown             │  │
│  └──────┬──────────────┬─────────────────────┘  │
│         │              │                         │
│  ┌──────┴──────┐  ┌───┴───────────────────┐     │
│  │ Qdrant      │  │ Transformers.js       │     │
│  │ Binary      │  │ (ONNX Runtime)        │     │
│  │ localhost:   │  │                       │     │
│  │ 6333        │  │ all-MiniLM-L6-v2      │     │
│  │             │  │ 384 dimensions        │     │
│  └──────┬──────┘  └───────────────────────┘     │
│         │                                        │
│    ┌────┴─────┐                                  │
│    │ storage/ │  ← donnees vectorielles          │
│    │ qdrant/  │     dans app.getPath('userData') │
│    └──────────┘                                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Flux principal

```
1. Utilisateur envoie un message
2. chat.ipc.ts → QdrantMemoryService.recall(content, topK=5)
3. Resultats pertinents → injection <semantic-memory> dans system prompt
4. streamText() avec contexte enrichi
5. Apres reponse (await result.text) → QdrantMemoryService.ingest(userMsg + assistantMsg)
6. Embeddings stockes dans Qdrant pour rappel futur
```

---

## 4. Qdrant — Binaire local Rust

### Pourquoi Qdrant

| Critere | Qdrant | Alternatives |
|---------|--------|-------------|
| **Performance** | Rust, SIMD, io_uring | chroma (Python), milvus (lourd) |
| **Footprint** | ~50 MB binaire, ~20 MB RAM idle | chroma ~500 MB+, milvus ~1 GB+ |
| **Local-first** | Binaire standalone, zero dependance | chroma = Python runtime |
| **Quantization** | Scalar, binary, product quantization | Variable |
| **API** | REST (port 6333) + gRPC (port 6334) | Variable |
| **Licence** | Apache 2.0 | Variable |

### Distribution du binaire

**Approche** : inclure le binaire Qdrant via `extraResources` dans electron-builder, telecharge au premier lancement si absent.

#### Option A — Bundle dans l'app (recommandee)

```yaml
# electron-builder.yml
extraResources:
  - from: "vendor/qdrant/${os}-${arch}/"
    to: "qdrant/"
    filter:
      - "qdrant*"
```

Le binaire est pre-telecharge dans `vendor/qdrant/` lors du build :
- `vendor/qdrant/darwin-arm64/qdrant` (~50 MB)
- `vendor/qdrant/darwin-x64/qdrant` (~50 MB)
- `vendor/qdrant/linux-x64/qdrant` (~50 MB)
- `vendor/qdrant/win32-x64/qdrant.exe` (~50 MB)

**Script de setup** : `scripts/download-qdrant.sh` telecharge depuis GitHub Releases (`qdrant/qdrant`) la version pinee (ex: v1.17.0).

#### Option B — Telecharger au premier lancement (alternative)

Au premier demarrage, si le binaire n'est pas present dans `userData/qdrant/`, le service le telecharge depuis GitHub Releases. Avantage : app plus legere. Inconvenient : premiere experience degradee (attente telecharement).

**Recommandation** : Option A pour l'experience utilisateur. Option B en fallback si le binaire n'est pas present (ex: dev mode).

### Demarrage du binaire

```typescript
// qdrant-process.ts
import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'

const QDRANT_PORT = 6333
const QDRANT_GRPC_PORT = 6334

function getQdrantBinaryPath(): string {
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'qdrant')
    : path.join(__dirname, '../../vendor/qdrant', `${process.platform}-${process.arch}`)

  const binary = process.platform === 'win32' ? 'qdrant.exe' : 'qdrant'
  return path.join(resourcesPath, binary)
}

function startQdrant(): ChildProcess {
  const storagePath = path.join(app.getPath('userData'), 'qdrant-storage')

  return spawn(getQdrantBinaryPath(), [
    '--port', String(QDRANT_PORT),
    '--grpc-port', String(QDRANT_GRPC_PORT),
    '--storage-path', storagePath,
    '--disable-telemetry'
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { HOME: app.getPath('userData') }  // env minimal
  })
}
```

### Configuration Qdrant

```yaml
# config/qdrant-config.yaml (embarque dans extraResources)
storage:
  storage_path: ./storage  # overridden par --storage-path
  optimizers:
    memmap_threshold_kb: 20000  # basculer en mmap apres 20 MB
  performance:
    max_search_threads: 2  # limiter sur desktop
log_level: WARN

service:
  enable_tls: false         # localhost uniquement
  host: 127.0.0.1           # jamais 0.0.0.0
  http_port: 6333
  grpc_port: 6334

telemetry_disabled: true     # zero telemetrie
```

### Health check

Au demarrage, le service attend que Qdrant reponde sur `http://127.0.0.1:6333/healthz` avant de considerer le service pret. Timeout 30s, retry toutes les 500ms.

### Arret propre

```typescript
// app.on('will-quit')
async function stopQdrant(process: ChildProcess): Promise<void> {
  process.kill('SIGTERM')
  // Attendre 5s max pour arret propre
  await Promise.race([
    new Promise<void>(resolve => process.on('exit', resolve)),
    new Promise<void>(resolve => setTimeout(resolve, 5000))
  ])
  if (!process.killed) process.kill('SIGKILL')
}
```

---

## 5. Embeddings locaux — Transformers.js

### Pourquoi local

- **Zero cout** : pas de facturation par token d'embedding (OpenAI ada-002 = $0.10/1M tokens)
- **Zero latence reseau** : embedding instantane (~5-15ms par phrase sur CPU)
- **Zero fuite de donnees** : les messages restent sur la machine
- **Offline** : fonctionne sans Internet

### Modele choisi : `all-MiniLM-L6-v2`

| Propriete | Valeur |
|-----------|--------|
| **Dimensions** | 384 |
| **Taille modele** | ~23 MB (ONNX quantize) |
| **Vitesse** | ~5-15 ms/phrase (CPU, batch=1) |
| **Qualite** | Top tier sur MTEB (sentence similarity) |
| **Licence** | Apache 2.0 |
| **Runtime** | ONNX via `@huggingface/transformers` |

### Alternative future : `nomic-embed-text-v1.5`

| Propriete | Valeur |
|-----------|--------|
| **Dimensions** | 768 (Matryoshka — tronquable a 384/256/128) |
| **Taille modele** | ~130 MB |
| **Qualite** | Superieure a MiniLM sur les benchmarks recents |

Pour la V1, `all-MiniLM-L6-v2` est le meilleur compromis taille/qualite/vitesse. Migration possible vers `nomic-embed-text-v1.5` en V2 sans perte (re-embedding).

### Integration dans l'app

```typescript
// embedding.service.ts
import { pipeline, env } from '@huggingface/transformers'

// Desactiver le telechargement de modeles distants en production
// Les modeles sont pre-telecharges dans extraResources
env.localModelPath = path.join(process.resourcesPath, 'models')
env.allowRemoteModels = !app.isPackaged

let extractor: Awaited<ReturnType<typeof pipeline>> | null = null

export async function initEmbedding(): Promise<void> {
  extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    { quantized: true }
  )
}

export async function embed(text: string): Promise<number[]> {
  if (!extractor) throw new Error('Embedding model not loaded')
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data)
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!extractor) throw new Error('Embedding model not loaded')
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  // Reshape flat array into array of vectors
  const dim = 384
  const vectors: number[][] = []
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(output.data.slice(i * dim, (i + 1) * dim)))
  }
  return vectors
}
```

### Distribution du modele ONNX

**Approche** : pre-telecharger le modele et le bundler dans `extraResources`.

```
vendor/models/Xenova/all-MiniLM-L6-v2/
  ├── config.json
  ├── tokenizer.json
  ├── tokenizer_config.json
  └── onnx/
      └── model_quantized.onnx   (~23 MB)
```

```yaml
# electron-builder.yml
extraResources:
  - from: "vendor/models/"
    to: "models/"
```

En dev mode, `@huggingface/transformers` telecharge automatiquement le modele depuis HuggingFace Hub (cache dans `~/.cache/huggingface/`).

---

## 6. Modele de donnees

### Collection Qdrant : `conversations_memory`

Chaque point dans Qdrant represente un **message** (ou un chunk de message long).

```typescript
interface MemoryPoint {
  // Vecteur
  vector: number[]           // 384 dimensions (all-MiniLM-L6-v2)

  // Payload (metadata filtrables)
  payload: {
    messageId: string        // ID du message SQLite
    conversationId: string   // ID de la conversation
    projectId: string | null // Projet associe (filtrage par scope)
    role: 'user' | 'assistant'
    content: string          // Texte original (pour affichage)
    contentPreview: string   // Troncature 200 chars (pour UI compacte)
    modelId: string | null   // Modele utilise (assistant uniquement)
    createdAt: number        // Timestamp Unix
    chunkIndex: number       // 0 si message non-chunke, N sinon
  }
}
```

### Pourquoi pas dans SQLite ?

SQLite n'a pas d'index vectoriel natif. Les extensions `sqlite-vss` ou `sqlite-vec` existent mais sont :
- Moins performantes que Qdrant pour la recherche ANN (Approximate Nearest Neighbor)
- Plus complexes a integrer avec better-sqlite3 (native modules sur native modules)
- Sans quantization ni HNSW optimise

Qdrant est le bon outil pour cette tache.

### Table SQLite complementaire : `vector_sync_state`

Pour tracker la synchronisation entre SQLite (source de verite des messages) et Qdrant :

```typescript
export const vectorSyncState = sqliteTable('vector_sync_state', {
  id: text('id').primaryKey(),                     // nanoid
  messageId: text('message_id').notNull().unique(), // FK vers messages
  conversationId: text('conversation_id').notNull(),
  status: text('status', { enum: ['pending', 'indexed', 'failed'] }).notNull(),
  pointId: text('point_id'),                        // ID du point dans Qdrant
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }),
})
```

Cette table permet de :
- Savoir quels messages ont ete indexes
- Re-indexer apres un crash
- Diagnostiquer les erreurs d'embedding

---

## 7. Service QdrantMemoryService

### Fichier : `src/main/services/qdrant-memory.service.ts`

Singleton, meme pattern que `McpManagerService` et `TelegramBotService`.

```typescript
class QdrantMemoryService extends EventEmitter {
  private qdrantProcess: ChildProcess | null = null
  private client: QdrantClient | null = null
  private isReady: boolean = false

  // ── Lifecycle ──────────────────────────────────

  async init(): Promise<void>
  // 1. Start Qdrant binary (spawn)
  // 2. Wait for healthcheck (http://127.0.0.1:6333/healthz)
  // 3. Init @qdrant/js-client-rest
  // 4. Ensure collection "conversations_memory" exists
  // 5. Init embedding model (@huggingface/transformers)
  // 6. Process pending sync queue
  // 7. Emit 'ready'

  async stop(): Promise<void>
  // 1. Flush pending operations
  // 2. Close Qdrant client
  // 3. SIGTERM → wait 5s → SIGKILL

  getStatus(): 'stopped' | 'starting' | 'ready' | 'error'

  // ── Ingestion ──────────────────────────────────

  async ingest(message: {
    id: string
    conversationId: string
    projectId: string | null
    role: 'user' | 'assistant'
    content: string
    modelId: string | null
    createdAt: Date
  }): Promise<void>
  // 1. Chunk si content > 1000 chars
  // 2. Embed chaque chunk
  // 3. Upsert dans Qdrant
  // 4. Update vector_sync_state

  async ingestBatch(messages: Message[]): Promise<void>
  // Batch embed + batch upsert (pour re-indexation)

  // ── Retrieval ──────────────────────────────────

  async recall(query: string, options?: {
    topK?: number              // default 5
    scoreThreshold?: number    // default 0.35
    projectId?: string | null  // filtrer par projet
    conversationId?: string    // exclure la conversation active
    maxAge?: number            // anciennete max en jours
  }): Promise<MemoryRecallResult[]>
  // 1. Embed query
  // 2. Search Qdrant avec filtres
  // 3. Retourne top-K avec score + payload

  async search(query: string, options?: {
    topK?: number
    projectId?: string | null
  }): Promise<MemorySearchResult[]>
  // Meme que recall mais sans exclusion — pour l'UI Explorer

  // ── Management ─────────────────────────────────

  async forget(pointIds: string[]): Promise<void>
  // Delete points dans Qdrant + update sync state

  async forgetConversation(conversationId: string): Promise<void>
  // Delete tous les points d'une conversation

  async forgetAll(): Promise<void>
  // Delete collection entiere + recree vide

  async getStats(): Promise<{
    totalPoints: number
    indexedConversations: number
    collectionSize: string      // "12.3 MB"
    status: string
  }>

  async reindex(): Promise<void>
  // Re-embed + re-upsert tous les messages depuis SQLite
}
```

### Chunking strategy

Les messages longs (> 1000 chars) sont decoupes en chunks avec chevauchement :

```
Message de 3000 chars
  → Chunk 0 : chars 0-1000
  → Chunk 1 : chars 800-1800  (overlap 200 chars)
  → Chunk 2 : chars 1600-2600
  → Chunk 3 : chars 2400-3000
```

- **Taille chunk** : 1000 caracteres (~250 tokens)
- **Overlap** : 200 caracteres (continuite semantique)
- **Decoupage** : au paragraphe si possible, sinon a la phrase, sinon hard cut

---

## 8. Ingestion automatique

### Quand indexer

L'ingestion se fait **apres** chaque echange complet (pas pendant le streaming) :

```
chat.ipc.ts — handleChatMessage()
  → streamText() → await result.text → save messages DB
  → QdrantMemoryService.ingest(userMessage)      // async, non-bloquant
  → QdrantMemoryService.ingest(assistantMessage)  // async, non-bloquant
```

L'ingestion est **fire-and-forget** avec error logging — elle ne doit jamais bloquer le flux de chat ni provoquer d'erreur visible.

### Filtrage a l'ingestion

Pas tous les messages meritent d'etre memorises :

| Regle | Detail |
|-------|--------|
| Messages trop courts | < 20 chars ignores (ex: "ok", "merci") |
| Messages systeme | Jamais indexes |
| Messages d'erreur | Jamais indexes (contentData.error = true) |
| Conversations ephemeres | Opt-out par conversation possible |

### Queue de synchronisation

Une queue async (simple array + setInterval) traite les messages en attente :

```typescript
private syncQueue: SyncJob[] = []
private syncInterval: NodeJS.Timeout | null = null

startSyncLoop(): void {
  this.syncInterval = setInterval(async () => {
    if (this.syncQueue.length === 0) return
    const batch = this.syncQueue.splice(0, 50)  // max 50 par batch
    await this.ingestBatch(batch)
  }, 2000)  // toutes les 2s
}
```

Cela decouple l'ingestion du chat et permet le batch embedding (plus efficace).

---

## 9. Retrieval — Injection dans le chat

### Modification de `chat.ipc.ts`

Le recall s'execute **avant** la construction du system prompt :

```typescript
// Dans handleChatMessage(), apres buildMemoryBlock()

// Semantic memory recall (si active)
let semanticMemoryBlock = ''
if (isSemanticMemoryEnabled()) {
  try {
    const recalls = await qdrantMemoryService.recall(content, {
      topK: 5,
      scoreThreshold: 0.35,
      projectId: conversation.projectId,
      conversationId,  // exclure la conversation active
    })

    if (recalls.length > 0) {
      semanticMemoryBlock = buildSemanticMemoryBlock(recalls)
    }
  } catch (err) {
    // Silencieux — la memoire semantique ne doit jamais bloquer le chat
    console.warn('Semantic memory recall failed:', err)
  }
}
```

### Format d'injection

```xml
<semantic-memory>
Souvenirs pertinents de conversations precedentes :

[2026-03-10, conversation "Refactoring parser"] (score: 0.82)
[Utilisateur] : J'ai besoin de parser le JSON en streaming, pas tout d'un coup
[Assistant] : Voici une approche avec un parser iteratif SAX-like...

[2026-03-08, conversation "Architecture API"] (score: 0.71)
[Utilisateur] : On utilise Zod pour la validation des schemas
[Assistant] : Zod est deja integre dans le projet, voici le pattern...

</semantic-memory>
```

### Ordre d'injection mis a jour

```
1. <semantic-memory> (rappels Qdrant, automatique)   ← NOUVEAU
2. <user-memory> (Memory Fragments, manuels)
3. System prompt du role actif
4. Workspace files XML
5. Workspace context (auto-read)
6. WORKSPACE_TOOLS_PROMPT
```

La memoire semantique passe en **premier** car elle est contextuelle au message. Les Memory Fragments (permanents) viennent ensuite.

### Budget tokens

Le bloc `<semantic-memory>` est limite a **3000 caracteres** (~750 tokens). Si les 5 resultats depassent ce budget, on tronque en partant du moins pertinent (score le plus bas).

---

## 10. Couche IPC

### Handlers : `src/main/ipc/qdrant-memory.ipc.ts`

| Channel | Params | Retour | Description |
|---------|--------|--------|-------------|
| `memory:semantic-status` | — | `{ status, totalPoints, collectionSize }` | Etat du service |
| `memory:semantic-search` | `{ query, topK?, projectId? }` | `MemorySearchResult[]` | Recherche manuelle |
| `memory:semantic-forget` | `{ pointIds }` | `void` | Supprimer des souvenirs |
| `memory:semantic-forget-conversation` | `{ conversationId }` | `void` | Oublier une conversation |
| `memory:semantic-forget-all` | — | `void` | Tout oublier (reset) |
| `memory:semantic-reindex` | — | `void` | Re-indexer depuis SQLite |
| `memory:semantic-toggle` | `{ enabled }` | `void` | Activer/desactiver |
| `memory:semantic-stats` | — | `{ totalPoints, indexedConversations, collectionSize, pendingSync }` | Stats detaillees |

### Validation Zod

```typescript
const searchSchema = z.object({
  query: z.string().min(1).max(10_000),
  topK: z.number().int().min(1).max(50).optional().default(10),
  projectId: z.string().optional(),
})

const forgetSchema = z.object({
  pointIds: z.array(z.string().min(1)).min(1).max(100),
})
```

### Preload bridge

```typescript
// Memory Semantique (Qdrant)
semanticMemoryStatus: () => ipcRenderer.invoke('memory:semantic-status'),
semanticMemorySearch: (payload) => ipcRenderer.invoke('memory:semantic-search', payload),
semanticMemoryForget: (payload) => ipcRenderer.invoke('memory:semantic-forget', payload),
semanticMemoryForgetConversation: (payload) => ipcRenderer.invoke('memory:semantic-forget-conversation', payload),
semanticMemoryForgetAll: () => ipcRenderer.invoke('memory:semantic-forget-all'),
semanticMemoryReindex: () => ipcRenderer.invoke('memory:semantic-reindex'),
semanticMemoryToggle: (payload) => ipcRenderer.invoke('memory:semantic-toggle', payload),
semanticMemoryStats: () => ipcRenderer.invoke('memory:semantic-stats'),
```

---

## 11. UI — Memoire semantique

### 11.1 Indicateur dans la vue Memoire existante

La vue "Memoire" (NavGroup Personnalisation) est enrichie avec une section "Memoire semantique" sous les Memory Fragments :

```
┌─────────────────────────────────────────────────────────┐
│ Memoire                                                  │
│                                                          │
│ ── Fragments manuels ─────────────────────────────────── │
│ [... fragments existants ...]                            │
│                                                          │
│ ── Memoire semantique (Qdrant) ──────────────────────── │
│                                                          │
│ [ON/OFF]  Memoriser automatiquement les conversations    │
│                                                          │
│ ● Pret — 1,247 souvenirs indexes                        │
│ 📁 12.3 MB sur disque                                    │
│ 🔄 3 messages en attente d'indexation                    │
│                                                          │
│ [Rechercher dans la memoire...]          🔍              │
│                                                          │
│ [Re-indexer tout]  [Tout oublier]                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Explorateur de memoire (MemoryExplorer)

Un panneau de recherche semantique accessible depuis la vue Memoire :

```
┌─────────────────────────────────────────────────────────┐
│ ← Retour                                                │
│                                                          │
│ Rechercher dans la memoire                               │
│ ┌─────────────────────────────────────────────── 🔍 ─┐  │
│ │ parser JSON streaming                              │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Filtre projet : [Tous les projets          ▼]           │
│                                                          │
│ 5 resultats                                              │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ 🟢 0.82  "Refactoring parser" — 10 mars 2026      │  │
│ │                                                    │  │
│ │ [User] J'ai besoin de parser le JSON en streaming, │  │
│ │ pas tout d'un coup. Le fichier peut faire 500 MB.  │  │
│ │                                                    │  │
│ │                     [Voir conversation] [Oublier]  │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ 🟡 0.71  "Architecture API" — 8 mars 2026         │  │
│ │                                                    │  │
│ │ [Assistant] Zod est deja integre dans le projet,   │  │
│ │ voici le pattern de validation pour les schemas... │  │
│ │                                                    │  │
│ │                     [Voir conversation] [Oublier]  │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 11.3 Badge dans ContextWindowIndicator

Quand des souvenirs sont injectes dans un message, un petit indicateur apparait :

```
[🧠 5 souvenirs] ═══ ~318 / 1.0M tokens <$0.01
```

Tooltip : "5 souvenirs de conversations precedentes ont ete injectes dans le contexte"

### 11.4 Settings > General

Toggle global : "Memoire semantique" ON/OFF, persiste dans settings.store.ts.

---

## 12. Securite

### 12.1 Qdrant bind localhost

Qdrant ecoute **uniquement** sur `127.0.0.1:6333` — jamais sur `0.0.0.0`. Aucun acces reseau externe.

Configuration forcee via `--host 127.0.0.1` au demarrage.

### 12.2 Donnees en clair

Les vecteurs et payloads dans Qdrant sont en **clair sur disque** (comme SQLite). C'est acceptable car :
- Mono-utilisateur, donnees locales
- Meme niveau de securite que la DB SQLite existante
- Les messages sont deja en clair dans SQLite

### 12.3 Pas de fuite de cles API

Le contenu indexe est le **texte des messages** uniquement. Les cles API ne sont jamais dans les messages (elles sont dans safeStorage).

### 12.4 Sanitization avant injection

Le bloc `<semantic-memory>` est construit cote main process avec sanitization :
- Pas de raw HTML dans les resultats
- Troncature des contenus longs
- Sanitize `</semantic-memory>` dans le contenu (meme pattern que workspace-files)

### 12.5 Process Qdrant isole

Le process Qdrant tourne avec un env minimal (meme pattern que Git, MCP) :
- `HOME` = userData
- Pas d'heritage de `process.env`
- `--disable-telemetry`

### 12.6 IPC validation

Tous les handlers IPC valident via Zod (meme pattern que partout ailleurs).

### 12.7 Arret propre

Qdrant est arrete proprement via SIGTERM dans `app.on('will-quit')`, avant la fermeture de SQLite. Sequence : stop sync loop → flush pending → close client → SIGTERM → wait → SIGKILL.

---

## 13. Performance & Limites

### Empreinte memoire

| Composant | RAM estimee |
|-----------|-------------|
| Qdrant idle | ~20-40 MB |
| Qdrant 10K points | ~50-80 MB |
| Qdrant 100K points | ~150-250 MB |
| Modele ONNX charge | ~50 MB |
| **Total (10K messages)** | **~100-130 MB** |

### Empreinte disque

| Composant | Taille |
|-----------|--------|
| Binaire Qdrant | ~50 MB |
| Modele ONNX | ~23 MB |
| 10K vecteurs (384d, float32) | ~15 MB |
| 100K vecteurs | ~150 MB |
| Payloads (metadata) | ~variable |

### Latences

| Operation | Latence estimee |
|-----------|-----------------|
| Embedding 1 phrase | 5-15 ms |
| Embedding batch 50 | 50-100 ms |
| Search top-5 (10K points) | < 5 ms |
| Search top-5 (100K points) | < 10 ms |
| Startup Qdrant | 1-3 s |
| Chargement modele ONNX | 2-5 s |

### Limites

| Limite | Valeur | Justification |
|--------|--------|---------------|
| Points max | 500K | Au-dela, RAM > 500 MB (desktop) |
| Score threshold | 0.35 | En dessous, resultats non pertinents |
| Top-K max (chat) | 10 | Budget tokens system prompt |
| Top-K max (search UI) | 50 | UX raisonnable |
| Chunk size | 1000 chars | Optimal pour all-MiniLM |
| Budget semantic-memory | 3000 chars | ~750 tokens |
| Messages min pour indexer | 20 chars | Filtrer le bruit |

### Quantization (optimisation future)

Pour reduire l'empreinte memoire de ~4x, activer la scalar quantization :

```typescript
await client.updateCollection('conversations_memory', {
  quantization_config: {
    scalar: { type: 'int8', quantile: 0.99, always_ram: true }
  }
})
```

384d float32 → 384d int8 = **4x moins de RAM** avec ~1-2% de perte de precision.

---

## 14. Plan d'implementation

### Phase 1 — Infrastructure (Qdrant + Embedding)

| Etape | Fichier | Description |
|-------|---------|-------------|
| 1.1 | `scripts/download-qdrant.sh` | Script telechargement binaire Qdrant (pin v1.17.0) |
| 1.2 | `vendor/qdrant/` | Binaires par plateforme (gitignore, telecharges par script) |
| 1.3 | `src/main/services/qdrant-process.ts` | Spawn/kill du binaire Qdrant, healthcheck |
| 1.4 | `src/main/services/embedding.service.ts` | Init Transformers.js, embed(), embedBatch() |
| 1.5 | `package.json` | `npm install @qdrant/js-client-rest @huggingface/transformers` |
| 1.6 | `electron.vite.config.ts` | Ajouter `@huggingface/transformers` + ONNX runtime aux externals |
| 1.7 | `electron-builder.yml` | `extraResources` pour binaire Qdrant + modele ONNX |

### Phase 2 — Service memoire

| Etape | Fichier | Description |
|-------|---------|-------------|
| 2.1 | `src/main/services/qdrant-memory.service.ts` | Singleton — init, ingest, recall, forget, stats |
| 2.2 | `src/main/db/schema.ts` | Table `vector_sync_state` |
| 2.3 | `src/main/db/queries/vector-sync.ts` | CRUD sync state |
| 2.4 | `src/main/index.ts` | Init QdrantMemoryService au startup (apres DB) |

### Phase 3 — Integration chat

| Etape | Fichier | Description |
|-------|---------|-------------|
| 3.1 | `src/main/ipc/chat.ipc.ts` | Recall avant construction system prompt |
| 3.2 | `src/main/ipc/chat.ipc.ts` | Ingest apres save messages (fire-and-forget) |
| 3.3 | `src/main/llm/memory-prompt.ts` | `buildSemanticMemoryBlock()` — formatte les recalls en XML |

### Phase 4 — IPC + Preload + Store

| Etape | Fichier | Description |
|-------|---------|-------------|
| 4.1 | `src/main/ipc/qdrant-memory.ipc.ts` | 8 handlers IPC (Zod) |
| 4.2 | `src/main/ipc/index.ts` | Enregistrer les handlers |
| 4.3 | `src/preload/index.ts` | 8 methodes bridge |
| 4.4 | `src/preload/types.ts` | Types MemorySearchResult, MemoryStats |
| 4.5 | `src/renderer/src/stores/semantic-memory.store.ts` | Store Zustand |

### Phase 5 — UI

| Etape | Fichier | Description |
|-------|---------|-------------|
| 5.1 | `src/renderer/src/components/memory/SemanticMemorySection.tsx` | Section dans MemoryView |
| 5.2 | `src/renderer/src/components/memory/MemoryExplorer.tsx` | Recherche semantique + resultats |
| 5.3 | `src/renderer/src/components/memory/MemoryResultCard.tsx` | Carte resultat (score, preview, actions) |
| 5.4 | `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Badge souvenirs injectes |
| 5.5 | `src/renderer/src/stores/settings.store.ts` | Toggle `semanticMemoryEnabled` |

### Phase 6 — Polish & robustesse

| Etape | Description |
|-------|-------------|
| 6.1 | Gestion crash Qdrant (restart automatique, max 3 retries) |
| 6.2 | Migration : indexer l'historique existant (batch background) |
| 6.3 | Cleanup : purger les vecteurs des conversations supprimees |
| 6.4 | Integration factory reset : `forgetAll()` dans `data.ipc.ts` |
| 6.5 | Integration `cleanup.ts` : `forgetConversation()` quand conversation supprimee |

### Dependances a installer

```bash
npm install @qdrant/js-client-rest @huggingface/transformers
```

### Impact sur la taille de l'app

| Composant | Taille ajoutee |
|-----------|---------------|
| Binaire Qdrant | +50 MB (par plateforme) |
| Modele ONNX | +23 MB |
| `@huggingface/transformers` | +5 MB (JS) |
| ONNX Runtime (wasm) | +15 MB |
| `@qdrant/js-client-rest` | +1 MB |
| **Total** | **~95 MB supplementaires** |

App actuelle ~200 MB → ~295 MB. Acceptable pour une app desktop.

---

## 15. Questions ouvertes

| # | Question | Options | Recommandation |
|---|----------|---------|----------------|
| Q1 | **Distribution du binaire Qdrant ?** | A) Bundle dans l'app, B) Telecharge au 1er lancement, C) Les deux (bundle + fallback download) | C — bundle en prod, download en dev |
| Q2 | **Modele d'embedding ?** | A) all-MiniLM-L6-v2 (23 MB, 384d), B) nomic-embed-text-v1.5 (130 MB, 768d), C) bge-small-en-v1.5 (23 MB, 384d) | A — meilleur compromis V1, migration possible |
| Q3 | **Granularite d'indexation ?** | A) Chaque message, B) Paires user+assistant, C) Resume de conversation | A — plus flexible pour la recherche |
| Q4 | **Score threshold par defaut ?** | A) 0.25 (plus permissif), B) 0.35 (equilibre), C) 0.50 (strict) | B — ajustable dans settings |
| Q5 | **Scope memoire ?** | A) Globale uniquement, B) Filtrable par projet | B — meme pattern que MCP |
| Q6 | **Memoire semantique active par defaut ?** | A) Oui, B) Non (opt-in explicite) | A — la valeur est dans l'automatisme |
| Q7 | **ONNX Runtime backend ?** | A) WASM (portable), B) Native (plus rapide, deps binaires) | A — WASM pour la portabilite cross-platform |
| Q8 | **Faut-il montrer les recalls dans le chat ?** | A) Non (invisible), B) Oui (badge discret), C) Oui (bloc collapsible) | B — badge dans ContextWindowIndicator |
| Q9 | **Embedding multilingue ?** | A) all-MiniLM-L6-v2 (anglais optimise, FR correct), B) paraphrase-multilingual-MiniLM-L12-v2 (117 MB, vrai multilingue) | A pour V1 — FR fonctionne, perf acceptable |

---

## 16. Ce qui ne change PAS

- **Memory Fragments** : systeme manuel inchange, complementaire
- **FTS5** : recherche mots-cles dans la conversation active, inchangee
- **Conversation history** : chargement des messages inchange
- **Roles** : injection system prompt inchangee
- **SendMessagePayload** : pas de nouveau champ — le recall est cote main process
- **Cost calculator** : pas de changement (l'embedding est gratuit/local)
- **streamText()** : pas de modification — seul le system prompt est enrichi

---

## 17. Resume des fichiers

### Nouveaux fichiers (12)

```
scripts/download-qdrant.sh                              # Telechargement binaire
src/main/services/qdrant-process.ts                     # Spawn/kill binaire Qdrant
src/main/services/embedding.service.ts                  # Transformers.js wrapper
src/main/services/qdrant-memory.service.ts              # Singleton memoire semantique
src/main/db/queries/vector-sync.ts                      # Queries sync state
src/main/ipc/qdrant-memory.ipc.ts                       # 8 handlers IPC
src/main/llm/memory-prompt.ts                           # buildSemanticMemoryBlock()
src/renderer/src/stores/semantic-memory.store.ts        # Store Zustand
src/renderer/src/components/memory/SemanticMemorySection.tsx
src/renderer/src/components/memory/MemoryExplorer.tsx
src/renderer/src/components/memory/MemoryResultCard.tsx
vendor/qdrant/.gitkeep                                  # Placeholder binaires
```

### Fichiers modifies (10)

```
package.json                              # +2 deps
electron.vite.config.ts                   # externals
electron-builder.yml                      # extraResources (qdrant + model)
src/main/db/schema.ts                     # table vector_sync_state
src/main/db/migrate.ts                    # CREATE TABLE vector_sync_state
src/main/index.ts                         # init QdrantMemoryService
src/main/ipc/index.ts                     # enregistrement handlers
src/main/ipc/chat.ipc.ts                  # recall + ingest
src/preload/index.ts                      # 8 methodes bridge
src/preload/types.ts                      # types MemorySearchResult, MemoryStats
src/renderer/src/stores/settings.store.ts # toggle semanticMemoryEnabled
src/renderer/src/components/memory/MemoryView.tsx        # section semantique
src/renderer/src/components/chat/ContextWindowIndicator.tsx # badge souvenirs
```

### Dependances externes (2)

```
@qdrant/js-client-rest    # Client REST officiel Qdrant
@huggingface/transformers # Transformers.js (ONNX Runtime, embeddings locaux)
```

---

*Document genere le 2026-03-13. Versions : Qdrant v1.17.0, @huggingface/transformers v3.x, all-MiniLM-L6-v2 (ONNX quantized).*
