# Custom RAG Library — Strategie d'Embedding

> **Date** : 2026-03-14
> **Statut** : Draft — Complement a `feature-custom-rag.md`
> **Contexte** : Choix du modele d'embedding pour les referentiels documentaires

---

## 1. Probleme

Le spec principal (`feature-custom-rag.md`) utilise **all-MiniLM-L6-v2** (384d, local, ONNX) pour l'embedding des referentiels. C'est le meme modele que la memoire semantique S33.

Limites de ce choix :
- **Multilingual faible** : all-MiniLM-L6-v2 est entraine principalement sur l'anglais — resultats mediocres en francais
- **384 dimensions** : resolution semantique limitee pour des documents techniques denses
- **Token limit 256** : les chunks longs sont tronques silencieusement par le modele
- **Qualite retrieval** : correcte mais pas au niveau des modeles cloud modernes

**Gemini Embedding 2** (`gemini-embedding-2-preview`) resout ces 3 problemes :
- **100+ langues** nativement (francais excellent)
- **3072 dimensions** (configurable via `outputDimensionality`)
- **Token limit ~8K** : chunks plus longs sans perte
- **Benchmarks MTEB** : top-tier sur retrieval, classification, clustering

---

## 2. Decision : Modele d'embedding configurable par referentiel

### Principe

L'utilisateur choisit le modele d'embedding **a la creation du referentiel**. Deux options :

| Option | Modele | Dimensions | Requis | Ideal pour |
|---|---|---|---|---|
| **Local** (defaut) | all-MiniLM-L6-v2 | 384 | Rien | Offline, vie privee totale, docs anglais |
| **Google** | gemini-embedding-2 | 768* | Cle API Google | Docs francais, qualite max, multimodal futur |

*\* On utilise `outputDimensionality: 768` au lieu de 3072 — bon compromis qualite/stockage/performance (voir section 4).*

### Pourquoi pas un modele unique ?

- Les collections Qdrant sont **liees a une dimension vectorielle**. On ne peut pas mixer 384d et 768d dans la meme collection.
- Forcer Gemini partout casserait le mode offline et la memoire semantique S33.
- Forcer local partout priverait les utilisateurs de la qualite Gemini Embedding 2.

### Pourquoi configurable par referentiel (et pas globalement) ?

- Un referentiel de docs francais beneficie de Gemini. Un referentiel de code anglais marche bien en local.
- Le choix est fait **une seule fois** a la creation (pas changeable apres — il faudrait re-indexer toute la collection avec une dimension differente).
- Simple a implementer : le `embeddingModel` est un champ de la table `libraries`.

---

## 3. Integration technique

### 3.1 Schema — Extension de la table `libraries`

```typescript
export const libraries = sqliteTable('libraries', {
  // ... champs existants du spec principal ...

  // Embedding config (immutable apres creation)
  embeddingModel: text('embedding_model', {
    enum: ['local', 'google']
  }).notNull().default('local'),

  embeddingDimensions: integer('embedding_dimensions').notNull().default(384),
  // local = 384, google = 768
})
```

### 3.2 Service d'embedding — Abstraction multi-modele

Creer un wrapper qui unifie les deux backends :

```typescript
// src/main/services/library-embedding.service.ts

import { embed as localEmbed, embedBatch as localEmbedBatch } from './embedding.service'
import { getGoogleProvider } from '../llm/providers'
import { embed as aiEmbed, embedMany as aiEmbedMany } from 'ai'

export type EmbeddingModelType = 'local' | 'google'

export async function embedForLibrary(
  text: string,
  modelType: EmbeddingModelType
): Promise<number[]> {
  switch (modelType) {
    case 'local':
      return localEmbed(text)

    case 'google': {
      const google = getGoogleProvider()
      const { embedding } = await aiEmbed({
        model: google.textEmbeddingModel('gemini-embedding-2', {
          outputDimensionality: 768,
          taskType: 'RETRIEVAL_QUERY'
        }),
        value: text
      })
      return embedding
    }
  }
}

export async function embedBatchForLibrary(
  texts: string[],
  modelType: EmbeddingModelType,
  isDocument: boolean = true
): Promise<number[][]> {
  switch (modelType) {
    case 'local':
      return localEmbedBatch(texts)

    case 'google': {
      const google = getGoogleProvider()
      const { embeddings } = await aiEmbedMany({
        model: google.textEmbeddingModel('gemini-embedding-2', {
          outputDimensionality: 768,
          taskType: isDocument ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY'
        }),
        values: texts
      })
      return embeddings
    }
  }
}

export function getDimensions(modelType: EmbeddingModelType): number {
  return modelType === 'google' ? 768 : 384
}
```

### 3.3 Vercel AI SDK — Ce qui existe deja

Le `@ai-sdk/google` (v3.0.43) supporte nativement les embeddings :

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { embed, embedMany } from 'ai'

const google = createGoogleGenerativeAI({ apiKey: '...' })

// Embed unique (pour query)
const { embedding } = await embed({
  model: google.textEmbeddingModel('gemini-embedding-2', {
    outputDimensionality: 768,
    taskType: 'RETRIEVAL_QUERY'
  }),
  value: 'Comment fonctionne useEffect ?'
})

// Embed batch (pour indexation documents)
const { embeddings } = await embedMany({
  model: google.textEmbeddingModel('gemini-embedding-2', {
    outputDimensionality: 768,
    taskType: 'RETRIEVAL_DOCUMENT'
  }),
  values: ['chunk 1...', 'chunk 2...', 'chunk 3...']
})
```

**Aucune nouvelle dependance requise** — `ai` et `@ai-sdk/google` sont deja installes.

### 3.4 Task types — RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY

Point critique pour la qualite du retrieval :

- **Indexation** (quand on embed les chunks des documents) : `taskType: 'RETRIEVAL_DOCUMENT'`
- **Recherche** (quand on embed la question utilisateur) : `taskType: 'RETRIEVAL_QUERY'`

Cette asymetrie est une feature de Gemini Embedding 2 — le modele optimise les embeddings selon le contexte d'usage. all-MiniLM-L6-v2 n'a pas cette distinction.

### 3.5 Collection Qdrant — Dimension dynamique

La collection est creee avec la bonne dimension selon le modele choisi :

```typescript
async function createLibraryCollection(libraryId: string, modelType: EmbeddingModelType) {
  const dimensions = getDimensions(modelType)  // 384 ou 768

  await fetch(`http://127.0.0.1:${QDRANT_PORT}/collections/library_${libraryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: dimensions, distance: 'Cosine' }
    })
  })
}
```

### 3.6 Retrieval dans chat.ipc.ts — Adaptation

```typescript
// Quand on query un referentiel attache :
const library = getLibrary(libId)

// Embed la question avec le MEME modele que le referentiel
const queryVector = await embedForLibrary(
  content,
  library.embeddingModel  // 'local' ou 'google'
)

// Query la collection (les dimensions matchent automatiquement)
const results = await queryLibraryCollection(libId, queryVector, { topK: 5 })
```

---

## 4. Choix : 768 dimensions (pas 3072)

Gemini Embedding 2 produit 3072 dimensions par defaut, mais supporte `outputDimensionality` pour reduire.

### Pourquoi 768 et pas 3072 ?

| Aspect | 3072d | 768d |
|---|---|---|
| Stockage Qdrant | ~12 KB/vecteur | ~3 KB/vecteur |
| Latence KNN | ~4x plus lent | Reference |
| RAM Qdrant | ~4x plus | Reference |
| Qualite retrieval | Marginalement meilleur | Excellent (>95% de 3072d sur MTEB) |
| Collection 10K chunks | ~120 MB | ~30 MB |

**768d est le sweet spot** : qualite quasi-identique a 3072d, 4x moins de stockage et de RAM. C'est aussi la dimension de modeles reconnus (BGE, E5-large). Google documente explicitement ce cas d'usage dans `outputDimensionality`.

### Pourquoi pas 384 (meme que local) ?

On pourrait aligner sur 384d pour simplifier, mais on perdrait une part significative de la qualite de Gemini. 768d reste gerable et tire parti du modele.

---

## 5. Gestion de la cle API Google

### Deja en place

La cle API Google est deja geree dans l'app :
- Stockage : `safeStorage` (chiffrement OS) via `credential.service.ts`
- Recuperation : `getApiKeyForProvider('google')` dans le main process
- UI : configuration dans Settings > Providers > Google

### Verification a la creation du referentiel

```typescript
// Quand l'utilisateur choisit "Google" comme modele d'embedding :
if (embeddingModel === 'google') {
  const apiKey = getApiKeyForProvider('google')
  if (!apiKey) {
    throw new Error('Cle API Google requise. Configurez-la dans Reglages > Fournisseurs > Google.')
  }
}
```

### Securite

- La cle API **ne quitte jamais le main process**
- Les embeddings sont generes dans le main process, seuls les vecteurs sont stockes
- Le renderer ne voit jamais la cle — il envoie juste `embeddingModel: 'google'` via IPC

---

## 6. Gestion du mode offline

### Scenario : referentiel Google sans connexion internet

- **Indexation** : impossible offline → message d'erreur clair, retry quand connexion retablie
- **Recherche (retrieval)** : impossible offline → fallback gracieux :
  1. Tenter l'embedding de la query via Google
  2. Si echec reseau : ne pas injecter `<library-context>`, avertir l'utilisateur via un badge "Referentiel indisponible (offline)"
  3. Le chat continue sans le contexte du referentiel

### Detection reseau

```typescript
async function isGoogleReachable(): Promise<boolean> {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    })
    return res.ok
  } catch {
    return false
  }
}
```

---

## 7. Quotas et rate limits — Free tier Google

| Limite | Valeur | Impact |
|---|---|---|
| RPM (requetes/min) | 1500 | Largement suffisant |
| TPM (tokens/min) | 1 000 000 | ~4000 chunks de 250 tokens |
| RPD (requetes/jour) | 10 000 | ~2000 documents de 5 chunks |

**Conclusion** : le free tier est amplement suffisant pour un usage desktop mono-utilisateur. Pas besoin de gerer des quotas complexes.

### Batching optimal

```typescript
// embedMany supporte jusqu'a 100 textes par requete (limite Google)
const GOOGLE_BATCH_SIZE = 100

// Pour un document de 500 chunks :
// → 5 requetes batch de 100
// → ~2-3 secondes total
```

---

## 8. UI — Selection du modele a la creation

### Dialog de creation du referentiel

```
┌──────────────────────────────────────────────────┐
│  Nouveau referentiel                             │
│                                                   │
│  Nom : [Doc React 19                         ]   │
│  Description : [Documentation officielle...  ]   │
│                                                   │
│  Modele d'embedding :                            │
│  ┌────────────────────────────────────────────┐  │
│  │ ○ Local (all-MiniLM-L6-v2)                │  │
│  │   384 dimensions • Hors-ligne • Rapide     │  │
│  │   Ideal pour documents en anglais          │  │
│  │                                            │  │
│  │ ● Google (Gemini Embedding 2)             │  │
│  │   768 dimensions • Requiert cle API        │  │
│  │   Excellent multilingual (FR/EN)           │  │
│  │   Qualite de recherche superieure          │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ⚠ Le modele ne peut pas etre change apres       │
│    la creation (re-indexation totale requise).    │
│                                                   │
│  Projet : [Aucun                        ▼]       │
│                                                   │
│              [Annuler]  [Creer]                   │
└──────────────────────────────────────────────────┘
```

### Indicateur dans la liste des referentiels

```
📚 Doc React 19                    12 sources
   Google • 847 chunks • 2.3 MB    [···]
   ^^^^^^
   Badge indiquant le modele d'embedding
```

---

## 9. Chunking — Adaptation pour Gemini

### all-MiniLM-L6-v2 : chunks courts (1000-1500 chars)

Le modele local a un token limit de **256 tokens** (~1000 chars). Des chunks plus longs sont tronques silencieusement, perdant du contexte.

### Gemini Embedding 2 : chunks plus longs (2000-3000 chars)

Le modele Google supporte **~8K tokens**. On peut utiliser des chunks plus genereux :

```typescript
const CHUNKING_CONFIGS_BY_EMBEDDING: Record<EmbeddingModelType, Record<string, ChunkingConfig>> = {
  local: {
    // Configs actuelles du spec principal (1000-1500 chars)
    markdown: { chunkSize: 1500, chunkOverlap: 200, separators: [...] },
    code:     { chunkSize: 2000, chunkOverlap: 200, separators: [...] },
    plain:    { chunkSize: 1000, chunkOverlap: 200, separators: [...] },
  },
  google: {
    // Chunks plus gros — Gemini les comprend mieux
    markdown: { chunkSize: 3000, chunkOverlap: 300, separators: [...] },
    code:     { chunkSize: 4000, chunkOverlap: 300, separators: [...] },
    plain:    { chunkSize: 2500, chunkOverlap: 300, separators: [...] },
  }
}
```

### Avantage : moins de chunks, meilleure coherence

Un document de 100K chars :
- Local : ~100 chunks (1000 chars) → 100 embeddings locaux (~5s)
- Google : ~40 chunks (2500 chars) → 1 batch API (~1s)

Moins de chunks = meilleure coherence semantique par chunk = meilleur retrieval.

---

## 10. Impact sur la memoire semantique S33

### Ce qui ne change PAS

La memoire semantique (S33 — `conversations_memory`) **reste en local** (all-MiniLM-L6-v2).

Raisons :
- **Volume** : chaque message de chaque conversation est indexe — des milliers de messages
- **Automatique** : pas de controle utilisateur sur le moment de l'indexation
- **Offline** : doit fonctionner sans internet
- **Latence** : le recall doit etre instantane (avant chaque `streamText()`)

### Evolution future possible (hors scope v1)

Un jour, on pourrait proposer un mode "Google" pour S33 aussi — mais c'est un changement plus lourd (migration de collection, re-indexation de tout l'historique).

---

## 11. Modifications au spec principal

### Fichiers additionnels vs spec principal

| Fichier | Impact |
|---|---|
| `src/main/services/library-embedding.service.ts` | **Nouveau** — abstraction multi-modele |
| `src/main/services/library.service.ts` | Utilise `library-embedding.service.ts` au lieu de `embedding.service.ts` directement |
| `src/main/db/schema.ts` | Ajouter `embeddingModel`, `embeddingDimensions` a `libraries` |
| `src/main/ipc/library.ipc.ts` | `library:create` accepte `embeddingModel` |
| `src/renderer/src/components/library/LibraryCreateDialog.tsx` | Radio group pour le choix du modele |
| `src/renderer/src/components/library/LibraryListView.tsx` | Badge modele |
| `src/preload/types.ts` | Ajouter `embeddingModel` au type `Library` |

### Aucun impact sur

- `embedding.service.ts` (inchange — toujours utilise par S33)
- `qdrant-memory.service.ts` (inchange — S33)
- `qdrant-process.ts` (inchange — meme binaire Qdrant)
- `chat.ipc.ts` (le retrieval utilise deja `embedForLibrary()` qui abstrait le modele)

---

## 12. Resume

```
                    ┌──────────────────────────────────┐
                    │          Choix utilisateur         │
                    │     (a la creation du ref.)        │
                    └──────────┬───────────┬────────────┘
                               │           │
                    ┌──────────▼──┐  ┌─────▼──────────┐
                    │   Local     │  │    Google       │
                    │ MiniLM-L6   │  │ Gemini Emb. 2  │
                    │ 384d, ONNX  │  │ 768d, API      │
                    │ Offline OK  │  │ Multilingual++  │
                    └──────┬──────┘  └──────┬──────────┘
                           │                │
                    ┌──────▼────────────────▼──────────┐
                    │     library-embedding.service     │
                    │    embed() / embedBatch()         │
                    │    Abstraction unifiee            │
                    └──────────────┬────────────────────┘
                                  │
                    ┌─────────────▼─────────────────────┐
                    │         Qdrant (local)             │
                    │  library_{id} — dim selon modele   │
                    └───────────────────────────────────┘
```

**En un mot** : le modele d'embedding est un **parametre du referentiel**, transparent pour le reste du systeme. L'abstraction `library-embedding.service.ts` garantit que `LibraryService`, `chat.ipc.ts` et l'UI n'ont pas a connaitre les details du backend d'embedding.

---

## Sources

- [Vercel AI SDK — Embeddings](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)
- [Vercel AI SDK — Google Provider (embeddings)](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Gemini Embedding 2 — Google AI](https://ai.google.dev/gemini-api/docs/embeddings)
- [Qdrant + Gemini Embedding 2](https://qdrant.tech/blog/qdrant-gemini-embedding-2/)
- [Gemini Embedding 2 — Vertex AI dimensions](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/embedding-2)
- [Google Gemini Embeddings with Vercel AI SDK](https://dev.to/danielsogl/generating-and-storing-google-gemini-embeddings-with-vercel-ai-sdk-and-supabase-283d)
