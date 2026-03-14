# Feature Spec — Custom RAG Library (Referentiels Documentaires)

> **Date** : 2026-03-14
> **Auteur** : Claude + Romain
> **Statut** : Draft — En attente d'approbation
> **Priorite** : Feature majeure — base de connaissances personnalisee pour le LLM
> **Inspiré de** : NotebookLM (Google) — sans les outils media

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Ce que ca apporte](#2-ce-que-ca-apporte)
3. [Architecture globale](#3-architecture-globale)
4. [Modele de donnees](#4-modele-de-donnees)
5. [Import & Traitement des sources](#5-import--traitement-des-sources)
6. [Chunking & Indexation](#6-chunking--indexation)
7. [Retrieval & Injection dans le chat](#7-retrieval--injection-dans-le-chat)
8. [Sourcing des reponses](#8-sourcing-des-reponses)
9. [Couche IPC](#9-couche-ipc)
10. [UI — Referentiels](#10-ui--referentiels)
11. [Gestion du contexte (tokens)](#11-gestion-du-contexte-tokens)
12. [Securite](#12-securite)
13. [Performance & Limites](#13-performance--limites)
14. [Plan d'implementation](#14-plan-dimplementation)
15. [Decisions techniques](#15-decisions-techniques)
16. [Ce qui ne change PAS](#16-ce-qui-ne-change-pas)
17. [Resume des fichiers](#17-resume-des-fichiers)

---

## 1. Vue d'ensemble

### Probleme

La memoire semantique existante (S33) indexe uniquement les **conversations passees**. L'utilisateur ne peut pas fournir au LLM un corpus de connaissances specifique (documentation technique, notes de recherche, specs, code source, articles) pour qu'il y puise ses reponses au lieu d'halluciner ou de chercher sur internet.

### Solution

Permettre a l'utilisateur de creer des **referentiels documentaires** (= "libraries") qu'il alimente avec ses propres fichiers. Ces referentiels sont **attachables a un message** (1 ou plusieurs). Le LLM effectue une recherche semantique dans les referentiels attaches pour fonder ses reponses sur les documents sources, avec **citation des sources** (fichier, section, ligne).

### Analogie NotebookLM

| NotebookLM | Custom RAG Library |
|---|---|
| Notebook | Referentiel (Library) |
| Sources (PDF, docs, URLs) | Sources (fichiers locaux : PDF, DOCX, TXT, MD, code) |
| Grounded answers + citations | Reponses sourcees avec references fichier/section |
| Podcast, video, infographie | **Hors scope** — chat uniquement |

### Principes

- **100% local** : embedding via all-MiniLM-L6-v2 (ONNX), stockage Qdrant local — zero API externe
- **Reutilise l'existant** : meme Qdrant, meme embedding service, meme infrastructure S33
- **CRUD complet** : creer, lire, modifier, supprimer referentiels + ajouter/retirer sources
- **Multi-attach** : attacher 1 ou N referentiels a un message
- **Token-efficient** : injection minimale, chunks pertinents uniquement, budget token controle
- **Sources tracables** : chaque chunk porte son origine (fichier, position) pour citation

---

## 2. Ce que ca apporte

### Cas d'usage concrets

1. **Documentation projet** : Indexer la doc technique d'un framework → le LLM repond avec les bonnes API, cite la doc
2. **Base de connaissances interne** : Notes de recherche, specs, comptes-rendus → reponses fondees sur les documents
3. **Code review contextuel** : Indexer un repo de code → le LLM comprend l'architecture existante
4. **Apprentissage** : Cours PDF, articles scientifiques → Q&A avec references exactes
5. **Veille** : Articles sauvegardes → synthese + citations

### Comparaison avec l'existant

| Capacite | Memoire semantique (S33) | Custom RAG Library |
|---|---|---|
| Source | Conversations passees (auto) | Documents utilisateur (manuel) |
| Injection | Automatique (chaque message) | Sur demande (referentiel attache) |
| Scope | Global / par projet | Par referentiel, attachable par message |
| Citation | Conversation source | Fichier + section + position |
| Controle | Toggle on/off | CRUD granulaire |

---

## 3. Architecture globale

```
┌─────────────── Renderer ──────────────────────┐
│                                                │
│  LibraryView (CRUD referentiels)               │
│    └─ LibraryDetail (liste sources, stats)     │
│       └─ SourceUpload (ajout fichiers)         │
│                                                │
│  InputZone                                     │
│    └─ LibraryPicker (attacher referentiel)     │
│    └─ LibraryBadge (indicateur dans context)   │
│                                                │
│  MessageItem                                   │
│    └─ SourceCitation (references inline)       │
│                                                │
└──────────────────┬─────────────────────────────┘
                   │ IPC
┌──────────────────┴─────────────────────────────┐
│               Main Process                      │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │         LibraryService                   │   │
│  │  - CRUD referentiels (SQLite)            │   │
│  │  - Import sources (parse fichiers)       │   │
│  │  - Chunking (RecursiveCharacter)         │   │
│  │  - Indexation (embed → Qdrant)           │   │
│  │  - Retrieval (query → top-K chunks)      │   │
│  └──────────┬───────────────┬──────────────┘   │
│             │               │                   │
│  ┌──────────▼──────┐  ┌────▼────────────────┐  │
│  │ EmbeddingService│  │   Qdrant (REST)      │  │
│  │ (all-MiniLM-L6) │  │   Collection par     │  │
│  │ *** EXISTANT *** │  │   referentiel        │  │
│  └─────────────────┘  └─────────────────────┘  │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │         SQLite (Drizzle)                 │   │
│  │  - libraries (metadata)                  │   │
│  │  - library_sources (fichiers source)     │   │
│  │  - library_chunks (tracking chunks)      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  chat.ipc.ts                                    │
│    └─ Si referentiel(s) attache(s) :            │
│       1. Embed la question utilisateur          │
│       2. Query Qdrant (collection du ref.)      │
│       3. Inject <library-context> dans prompt   │
│       4. Le LLM cite ses sources                │
└─────────────────────────────────────────────────┘
```

### Relation avec l'existant (S33)

- **Qdrant** : meme binaire, meme process — on ajoute **des collections supplementaires** (1 par referentiel)
- **EmbeddingService** : reutilise `embed()` et `embedBatch()` — zero duplication
- **Qdrant process management** : reutilise `qdrant-process.ts` tel quel
- **Collection naming** : `library_{libraryId}` (vs `conversations_memory` pour S33)

---

## 4. Modele de donnees

### 4.1 Nouvelles tables SQLite (Drizzle)

```typescript
// ── Libraries (referentiels) ─────────────────────────────

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),                    // nanoid()
  name: text('name').notNull(),                   // "Doc React 19", "Specs projet X"
  description: text('description'),               // Description optionnelle
  color: text('color'),                           // Couleur badge (hex)
  icon: text('icon'),                             // Emoji ou icone
  projectId: text('project_id')                   // Scope optionnel par projet
    .references(() => projects.id),

  // Stats caches (mis a jour apres chaque indexation)
  sourcesCount: integer('sources_count').notNull().default(0),
  chunksCount: integer('chunks_count').notNull().default(0),
  totalSizeBytes: integer('total_size_bytes').notNull().default(0),

  // Etat
  status: text('status', {
    enum: ['empty', 'indexing', 'ready', 'error']
  }).notNull().default('empty'),
  lastIndexedAt: integer('last_indexed_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ── Library Sources (fichiers dans un referentiel) ───────

export const librarySources = sqliteTable('library_sources', {
  id: text('id').primaryKey(),                    // nanoid()
  libraryId: text('library_id')
    .notNull()
    .references(() => libraries.id, { onDelete: 'cascade' }),

  // Fichier source
  filename: text('filename').notNull(),           // "react-hooks.md"
  originalPath: text('original_path').notNull(),  // Path d'origine (pour reference)
  storedPath: text('stored_path').notNull(),      // Path copie dans userData/libraries/
  mimeType: text('mime_type').notNull(),           // "text/markdown"
  sizeBytes: integer('size_bytes').notNull(),

  // Extraction
  extractedText: text('extracted_text'),           // Texte brut extrait
  extractedLength: integer('extracted_length'),    // Longueur en chars

  // Indexation
  chunksCount: integer('chunks_count').notNull().default(0),
  status: text('status', {
    enum: ['pending', 'extracting', 'chunking', 'indexing', 'ready', 'error']
  }).notNull().default('pending'),
  errorMessage: text('error_message'),

  // Hash pour detecter modifications
  contentHash: text('content_hash'),              // SHA-256 du fichier

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

// ── Library Chunks (tracking des chunks dans Qdrant) ─────

export const libraryChunks = sqliteTable('library_chunks', {
  id: text('id').primaryKey(),                    // nanoid()
  libraryId: text('library_id')
    .notNull()
    .references(() => libraries.id, { onDelete: 'cascade' }),
  sourceId: text('source_id')
    .notNull()
    .references(() => librarySources.id, { onDelete: 'cascade' }),

  // Qdrant reference
  pointId: text('point_id').notNull(),            // UUID dans Qdrant

  // Position dans le document source
  chunkIndex: integer('chunk_index').notNull(),   // 0, 1, 2, ...
  startChar: integer('start_char').notNull(),     // Position debut dans extractedText
  endChar: integer('end_char').notNull(),         // Position fin

  // Metadata pour citation
  heading: text('heading'),                        // Titre/section detecte le plus proche
  lineStart: integer('line_start'),                // Ligne debut (si applicable)
  lineEnd: integer('line_end'),                    // Ligne fin

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
})
```

### 4.2 Qdrant — Collection par referentiel

```
Collection name: "library_{libraryId}"
Vectors: { size: 384, distance: "Cosine" }  // Meme modele all-MiniLM-L6-v2

Payload par point:
{
  "sourceId": "src-abc123",         // FK → library_sources.id
  "libraryId": "lib-xyz789",       // FK → libraries.id
  "filename": "react-hooks.md",    // Pour citation rapide
  "heading": "## useEffect",       // Section/titre le plus proche
  "chunkIndex": 3,                 // Index du chunk dans la source
  "startChar": 2400,               // Position debut
  "endChar": 3400,                 // Position fin
  "lineStart": 45,                 // Ligne debut (optionnel)
  "lineEnd": 68,                   // Ligne fin (optionnel)
  "content": "full chunk text...", // Texte complet du chunk
  "contentPreview": "first 200.."  // Preview tronque
}
```

### 4.3 Stockage des fichiers source

```
userData/
  libraries/
    {libraryId}/
      sources/
        {sourceId}-{filename}     # Copie du fichier original
```

**Pourquoi copier ?** Le fichier d'origine peut etre deplace/supprime. La copie garantit la perennite du referentiel et la capacite de re-indexer.

---

## 5. Import & Traitement des sources

### 5.1 Formats supportes

| Format | Extension | Extracteur | Notes |
|---|---|---|---|
| Texte brut | .txt | Lecture directe | UTF-8 |
| Markdown | .md | Lecture directe | Preserve structure heading |
| PDF | .pdf | `pdf-parse` (existant) | Extraction texte, pas OCR |
| Word | .docx | `mammoth` (existant) | Conversion en markdown |
| Code source | .ts, .js, .py, .java, .go, .rs, .c, .cpp, .rb, .php, .swift, .kt, .html, .css, .json, .yaml, .xml, .sql, .sh | Lecture directe | Preserve structure |
| CSV | .csv | Lecture directe | Chaque ligne = entree |

**Hors scope v1** : URLs web, images (OCR), audio, video, Google Docs, Notion.

### 5.2 Pipeline d'import

```
1. Utilisateur selectionne fichier(s) via dialog natif
   │
2. Validation (extension, taille ≤ 20 MB par fichier)
   │
3. Copie dans userData/libraries/{libraryId}/sources/
   │
4. Calcul SHA-256 (contentHash) — pour detecter doublons/modifications
   │
5. Extraction texte brut
   │  - .pdf → pdf-parse
   │  - .docx → mammoth (→ markdown → texte)
   │  - .md/.txt/.code → lecture directe
   │
6. Sauvegarde extractedText dans library_sources
   │
7. Chunking (voir section 6)
   │
8. Embedding + Upsert Qdrant (voir section 6)
   │
9. Mise a jour stats (sourcesCount, chunksCount, status → 'ready')
```

### 5.3 Limites

| Contrainte | Valeur | Justification |
|---|---|---|
| Taille max par fichier | 20 MB | Eviter blocage embedding |
| Fichiers max par referentiel | 100 | Performance Qdrant |
| Referentiels max | 50 | Limiter la proliferation |
| Taille totale extractedText par source | 500 000 chars | ~125K tokens, raisonnable |
| Formats | Liste ci-dessus | Ce que les extracteurs supportent sans deps |

---

## 6. Chunking & Indexation

### 6.1 Strategie de chunking

**Choix : RecursiveCharacterSplitter adapte au type de contenu.**

Les benchmarks 2025 (Vecta, NAACL) montrent que le chunking recursif fixe (512 tokens / ~2000 chars) bat systematiquement le chunking semantique en precision et en cout. On adapte la strategie au type de contenu :

```typescript
interface ChunkingConfig {
  chunkSize: number        // Taille cible en chars
  chunkOverlap: number     // Chevauchement
  separators: string[]     // Separateurs par priorite
}

const CHUNKING_CONFIGS: Record<string, ChunkingConfig> = {
  markdown: {
    chunkSize: 1500,       // Plus gros : respect des sections
    chunkOverlap: 200,
    separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' ']
  },
  code: {
    chunkSize: 2000,       // Fonctions completes
    chunkOverlap: 200,
    separators: ['\nfunction ', '\nclass ', '\nexport ', '\n\n', '\n', ' ']
  },
  plaintext: {
    chunkSize: 1000,       // Standard (meme que S33)
    chunkOverlap: 200,
    separators: ['\n\n', '\n', '. ', ' ']
  },
  csv: {
    chunkSize: 1500,
    chunkOverlap: 100,
    separators: ['\n']     // Ligne par ligne logique
  }
}
```

### 6.2 Extraction de metadata par chunk

Pour chaque chunk, on extrait :
- **heading** : le dernier titre Markdown (`# `, `## `, etc.) rencontre avant le chunk
- **lineStart / lineEnd** : numeros de ligne dans le fichier source
- **startChar / endChar** : positions en caracteres dans `extractedText`

Cela permet des citations precises : *"Source: react-hooks.md, section "useEffect", lignes 45-68"*

### 6.3 Pipeline d'indexation

```typescript
async function indexSource(libraryId: string, sourceId: string): Promise<void> {
  // 1. Charger extractedText depuis SQLite
  // 2. Determiner config chunking selon mimeType
  // 3. Chunker avec RecursiveCharacterSplitter
  // 4. Pour chaque chunk : extraire heading, lineStart, lineEnd
  // 5. embedBatch() tous les chunks (reutilise EmbeddingService existant)
  // 6. Upsert batch dans Qdrant collection "library_{libraryId}"
  // 7. Sauvegarder library_chunks dans SQLite (tracking)
  // 8. Mettre a jour source.status → 'ready', source.chunksCount
  // 9. Mettre a jour library stats (chunksCount, status)
}
```

### 6.4 Re-indexation

Quand l'utilisateur ajoute/supprime une source ou demande un re-index :
1. Supprimer tous les points Qdrant de la source concernee
2. Supprimer les `library_chunks` SQLite correspondants
3. Re-executer le pipeline d'indexation

---

## 7. Retrieval & Injection dans le chat

### 7.1 Declenchement

Le retrieval se declenche **uniquement si l'utilisateur a attache un ou plusieurs referentiels au message**. Ce n'est PAS automatique (contrairement a la memoire semantique S33).

### 7.2 Flow dans `chat.ipc.ts`

```typescript
// Dans handleChatMessage(), APRES la semantic memory et AVANT streamText() :

// 1. Verifier si des referentiels sont attaches
if (libraryIds && libraryIds.length > 0) {
  // 2. Embed la question utilisateur (reutilise embed() existant)
  const queryVector = await embed(content)

  // 3. Query chaque collection Qdrant attachee
  const allChunks: LibraryChunkResult[] = []
  for (const libId of libraryIds) {
    const results = await queryLibraryCollection(libId, queryVector, {
      topK: 5,                    // Top 5 par referentiel
      scoreThreshold: 0.30        // Seuil de pertinence
    })
    allChunks.push(...results)
  }

  // 4. Tri global par score, deduplication, budget token
  const selectedChunks = selectBestChunks(allChunks, {
    maxChunks: 10,                // Max 10 chunks total
    maxTokens: 3000,              // Budget ~3000 tokens pour le context
    diversityWeight: 0.2          // Favoriser la diversite de sources
  })

  // 5. Construire le bloc <library-context>
  const libraryBlock = buildLibraryContextBlock(selectedChunks)

  // 6. Injecter dans le system prompt
  combinedSystemPrompt = libraryBlock + '\n\n' + combinedSystemPrompt
}
```

### 7.3 Format d'injection — `<library-context>`

```xml
<library-context>
Tu as acces aux referentiels documentaires suivants. Base tes reponses sur ces sources.
Cite tes sources avec le format [source:ID] apres chaque affirmation basee sur un document.

<source id="1" file="react-hooks.md" section="useEffect" library="Doc React 19">
useEffect is a React Hook that lets you synchronize a component with an external system.
Call useEffect at the top level of your component to declare an Effect...
</source>

<source id="2" file="api-reference.md" section="useState" library="Doc React 19">
useState is a React Hook that lets you add a state variable to your component.
const [state, setState] = useState(initialState)...
</source>

<source id="3" file="architecture.md" section="Data flow" library="Specs Projet X">
Le flux de donnees suit un pattern unidirectionnel...
</source>
</library-context>
```

### 7.4 Ordre d'injection dans le system prompt

```
1. <library-context>         ← Referentiels attaches (nouveau)
2. <semantic-memory>         ← Qdrant recalls conversations (S33)
3. <user-memory>             ← Memory Fragments manuels
4. [Role system prompt]      ← Role ou system prompt projet
5. <workspace-files>         ← Fichiers @mention / workspace
6. WORKSPACE_TOOLS_PROMPT    ← Doc outils
```

**Justification** : Les referentiels sont la source de verite prioritaire quand l'utilisateur les attache explicitement. Ils passent en premier pour que le LLM les priorise.

---

## 8. Sourcing des reponses

### 8.1 Instruction au LLM

L'instruction dans `<library-context>` demande au LLM de citer ses sources avec `[source:ID]`. Le format est simple et parsable cote renderer.

### 8.2 Parsing des citations dans le renderer

```typescript
// Dans MarkdownRenderer.tsx ou un composant dedie
// Detecter les patterns [source:N] dans le texte de la reponse

const SOURCE_CITATION_REGEX = /\[source:(\d+)\]/g

// Transformer en composant interactif :
// [source:1] → <SourceCitation id={1} file="react-hooks.md" section="useEffect" />
```

### 8.3 Composant `SourceCitation`

```
┌──────────────────────────────────────┐
│ [1] react-hooks.md > useEffect       │  ← Inline badge cliquable
│     Doc React 19                     │
└──────────────────────────────────────┘

Au clic → Popover avec :
- Extrait du chunk source (200 chars)
- Nom complet du fichier
- Section / lignes
- Bouton "Voir le fichier complet"
```

### 8.4 Metadata des sources dans le message

Les sources attachees sont stockees dans `contentData` du message assistant :

```typescript
contentData: {
  librarySources?: Array<{
    id: number              // ID reference dans le message (1, 2, 3...)
    sourceId: string        // FK → library_sources.id
    libraryId: string       // FK → libraries.id
    libraryName: string     // "Doc React 19"
    filename: string        // "react-hooks.md"
    heading: string | null  // "useEffect"
    lineStart: number | null
    lineEnd: number | null
    chunkPreview: string    // Premiers 200 chars du chunk
  }>
}
```

Et dans `contentData` du message utilisateur, on stocke quels referentiels etaient attaches :

```typescript
contentData: {
  libraryIds?: string[]     // ["lib-abc", "lib-xyz"]
}
```

---

## 9. Couche IPC

### 9.1 Nouveaux handlers (main process)

```typescript
// ── CRUD Referentiels ────────────────────────────

ipcMain.handle('library:list', async () => Library[])
ipcMain.handle('library:get', async (_, { id }) => Library | null)
ipcMain.handle('library:create', async (_, { name, description?, color?, icon?, projectId? }) => Library)
ipcMain.handle('library:update', async (_, { id, name?, description?, color?, icon? }) => Library)
ipcMain.handle('library:delete', async (_, { id }) => void)
  // Supprime collection Qdrant + fichiers + chunks + sources SQLite

// ── Sources dans un referentiel ──────────────────

ipcMain.handle('library:add-sources', async (_, { libraryId, filePaths: string[] }) => LibrarySource[])
  // Ouvre le dialog natif si filePaths vide, sinon utilise les paths donnes
  // Copie, extrait, chunk, indexe — retourne les sources creees

ipcMain.handle('library:remove-source', async (_, { libraryId, sourceId }) => void)
  // Supprime fichier + chunks Qdrant + SQLite

ipcMain.handle('library:get-sources', async (_, { libraryId }) => LibrarySource[])

ipcMain.handle('library:reindex-source', async (_, { libraryId, sourceId }) => void)
  // Re-extraction + re-chunking + re-embedding

ipcMain.handle('library:reindex-all', async (_, { libraryId }) => void)

// ── Recherche / Preview ──────────────────────────

ipcMain.handle('library:search', async (_, { libraryId, query, topK? }) => SearchResult[])
  // Recherche semantique dans un referentiel specifique

ipcMain.handle('library:stats', async (_, { libraryId }) => LibraryStats)

// ── Selection fichier (dialog natif) ─────────────

ipcMain.handle('library:pick-files', async () => string[])
  // dialog.showOpenDialog avec filters adaptes
```

### 9.2 Extension du payload chat

```typescript
// sendMessageSchema — ajouter :
libraryIds: z.array(z.string()).max(5).optional()
  // IDs des referentiels a consulter pour ce message
```

### 9.3 Extension du StreamChunk

```typescript
// Ajouter au type StreamChunk :
librarySourcesCount?: number   // Nombre de chunks injectes depuis les referentiels
```

### 9.4 Preload bridge

```typescript
window.api = {
  // ... existant ...

  // Libraries
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryGet: (payload) => ipcRenderer.invoke('library:get', payload),
  libraryCreate: (payload) => ipcRenderer.invoke('library:create', payload),
  libraryUpdate: (payload) => ipcRenderer.invoke('library:update', payload),
  libraryDelete: (payload) => ipcRenderer.invoke('library:delete', payload),

  libraryAddSources: (payload) => ipcRenderer.invoke('library:add-sources', payload),
  libraryRemoveSource: (payload) => ipcRenderer.invoke('library:remove-source', payload),
  libraryGetSources: (payload) => ipcRenderer.invoke('library:get-sources', payload),
  libraryReindexSource: (payload) => ipcRenderer.invoke('library:reindex-source', payload),
  libraryReindexAll: (payload) => ipcRenderer.invoke('library:reindex-all', payload),

  librarySearch: (payload) => ipcRenderer.invoke('library:search', payload),
  libraryStats: (payload) => ipcRenderer.invoke('library:stats', payload),
  libraryPickFiles: () => ipcRenderer.invoke('library:pick-files'),
}
```

---

## 10. UI — Referentiels

### 10.1 Navigation

Ajouter une entree **"Referentiels"** (ou "Bibliotheques") dans le menu lateral, entre "Memoire" et "Projets".

```
Vue: 'libraries' dans useUiStore.currentView
```

### 10.2 LibraryListView — Liste des referentiels

```
┌──────────────────────────────────────────────────┐
│  Referentiels                        [+ Creer]   │
├──────────────────────────────────────────────────┤
│  📚 Doc React 19                    12 sources   │
│     Pret • 847 chunks • 2.3 MB      [···]        │
│                                                   │
│  📖 Specs Projet X                   5 sources   │
│     Pret • 312 chunks • 0.8 MB      [···]        │
│                                                   │
│  🔬 Articles ML                      3 sources   │
│     Indexation... (67%)              [···]        │
└──────────────────────────────────────────────────┘
```

### 10.3 LibraryDetailView — Detail d'un referentiel

```
┌──────────────────────────────────────────────────┐
│  ← Doc React 19                     [Modifier]   │
│  Documentation officielle React 19                │
│  847 chunks • 12 sources • 2.3 MB                 │
├──────────────────────────────────────────────────┤
│  Sources                       [+ Ajouter]        │
│                                                   │
│  📄 react-hooks.md          45 KB   Pret   [×]   │
│  📄 api-reference.md       123 KB   Pret   [×]   │
│  📄 migration-guide.pdf     2.1 MB  Pret   [×]   │
│  📄 changelog.md            89 KB   Erreur [↻×]  │
│                                                   │
├──────────────────────────────────────────────────┤
│  Recherche dans le referentiel                    │
│  ┌──────────────────────────────────────────┐    │
│  │ Comment fonctionne useEffect ?            │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  Resultats :                                      │
│  [0.87] react-hooks.md > useEffect               │
│         "useEffect is a React Hook that..."       │
│  [0.72] api-reference.md > Hooks API              │
│         "The Hooks API reference covers..."       │
└──────────────────────────────────────────────────┘
```

### 10.4 InputZone — Attacher un referentiel

Un nouveau bouton dans la barre d'actions de l'InputZone (a cote des attachments, roles, prompts) :

```
┌─ InputZone ──────────────────────────────────────┐
│ [📎] [📚] [🎭] [⚡] [🔍]           [Envoyer]    │
│       ↑                                           │
│  Library Picker                                   │
│  ┌────────────────────────────┐                   │
│  │ ☐ Doc React 19  (847 ch.) │                   │
│  │ ☑ Specs Projet X (312 ch.)│                   │
│  │ ☐ Articles ML   (156 ch.) │                   │
│  └────────────────────────────┘                   │
│                                                   │
│  [Specs Projet X ×]  ← Badge removable           │
│                                                   │
│  Votre message...                                 │
└──────────────────────────────────────────────────┘
```

### 10.5 ContextWindowIndicator — Badge referentiel

Dans le `ContextWindowIndicator`, ajouter un badge similaire au `SemanticMemoryBadge` :

```
[📚 3 sources injectees]
```

Affiche le nombre de chunks injectes depuis les referentiels pour le dernier message.

### 10.6 MessageItem — Citations inline

Dans le rendu des messages assistant, les `[source:N]` sont transformes en badges cliquables :

```
Le hook useEffect permet de synchroniser un composant avec un systeme
externe [source:1]. Il s'execute apres le rendu du composant et peut
retourner une fonction de nettoyage [source:1]. Pour les effets qui
dependent de valeurs specifiques, utilisez le tableau de dependances [source:2].

──────────────
Sources :
[1] react-hooks.md > useEffect (Doc React 19)
[2] api-reference.md > Hooks API (Doc React 19)
```

---

## 11. Gestion du contexte (tokens)

### 11.1 Probleme

Le context window est la ressource la plus precieuse. Injecter trop de chunks = gaspillage de tokens = degradation des performances + cout.

### 11.2 Strategie de budget token

```typescript
const LIBRARY_CONTEXT_BUDGET = {
  maxTokens: 3000,          // Budget max pour les chunks de referentiels
  maxChunks: 10,            // Jamais plus de 10 chunks
  minScore: 0.30,           // Score minimum pour inclure un chunk
  topKPerLibrary: 5,        // Max 5 chunks par referentiel attache
}
```

### 11.3 Selection des chunks — Algorithme

```
1. Pour chaque referentiel attache :
   - Query Qdrant top-K (K = topKPerLibrary = 5)
   - Filtrer score < minScore

2. Pool tous les chunks des referentiels
   - Trier par score descendant

3. Selection gloutonne avec budget :
   - Ajouter chunk par chunk (meilleur score first)
   - Verifier que totalTokens + chunkTokens <= maxTokens
   - Verifier que totalChunks < maxChunks
   - Stop quand budget epuise

4. Diversite (optionnel) :
   - Si 2+ referentiels, garantir au moins 1 chunk par ref. attache
     (si score >= minScore)
```

### 11.4 Estimation tokens

```typescript
function estimateTokens(text: string): number {
  // Approximation simple : ~4 chars par token (anglais/francais)
  return Math.ceil(text.length / 4)
}
```

### 11.5 Comparaison budget total

```
Context window type (ex: GPT-4o 128K) :

┌─────────────────────────────────────────────┐
│ System prompt complet                        │
│   library-context    : ~3000 tokens (2.3%)   │  ← NOUVEAU
│   semantic-memory    : ~750 tokens  (0.6%)   │
│   user-memory        : ~500 tokens  (0.4%)   │
│   role prompt        : ~500 tokens  (0.4%)   │
│   workspace files    : variable              │
│   tools prompt       : ~200 tokens  (0.2%)   │
├─────────────────────────────────────────────┤
│ Conversation history : ~X tokens             │
│ User message         : ~Y tokens             │
├─────────────────────────────────────────────┤
│ Budget reponse       : reste                 │
└─────────────────────────────────────────────┘
```

Le budget de 3000 tokens pour les referentiels est un bon compromis : assez pour fournir du contexte riche, pas assez pour noyer le LLM.

---

## 12. Securite

### 12.1 Validation IPC (Zod)

Tous les handlers valident strictement les inputs :

```typescript
const libraryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional(),
  projectId: z.string().optional()
})

const addSourcesSchema = z.object({
  libraryId: z.string().min(1),
  filePaths: z.array(z.string().min(1)).max(20)
})
```

### 12.2 Path traversal

- **Copie des fichiers** : les fichiers sont copies dans `userData/libraries/{libraryId}/sources/` — pas de symlink, pas de traversal
- **Validation** : `path.resolve()` + verifier que le path resultant est bien dans `userData/`
- **Pas d'acces fichier depuis le renderer** — tout passe par IPC

### 12.3 Injection XML

Les contenus des chunks injectes dans `<library-context>` sont sanitises :

```typescript
const sanitize = (s: string) => s
  .replace(/<\/source>/gi, '&lt;/source&gt;')
  .replace(/<\/library-context>/gi, '&lt;/library-context&gt;')
```

### 12.4 Suppression securisee

Utiliser `trash` (corbeille) au lieu de `rm` pour les fichiers source, conformement aux regles projet.

---

## 13. Performance & Limites

### 13.1 Indexation

- **Embedding** : all-MiniLM-L6-v2 est rapide (~50ms par chunk CPU)
- **Batch** : `embedBatch()` traite les chunks par lot (meme que S33)
- **Non-bloquant** : l'indexation tourne en arriere-plan, l'UI reste reactive
- **Progress** : un pourcentage d'avancement est envoye au renderer via IPC event

### 13.2 Retrieval

- **Latence** : Qdrant brute-force sur 384d avec <50K vecteurs : <50ms
- **Parallelisme** : queries multi-collection en `Promise.all()`
- **Cache** : pas de cache necessaire — Qdrant est deja rapide

### 13.3 Limites connues

| Aspect | Limite | Mitigation |
|---|---|---|
| all-MiniLM-L6-v2 multilingual | Moyen en francais | Acceptable — la plupart des docs techniques sont en anglais. Possible upgrade vers un modele multilingual (e5-small, BGE) dans une v2 |
| Token limit du modele d'embedding | 256 tokens (~1000 chars) | Chunking <= 1500 chars (bien dans la limite apres tokenization) |
| PDF complexes (tableaux, mise en page) | pdf-parse extrait mal | Limitation connue — l'utilisateur peut pre-convertir en texte |
| Pas d'OCR | Images dans les PDF ignorees | Hors scope v1 |

---

## 14. Plan d'implementation

### Phase 1 — Schema & Service backend (S34-a)

1. **Migration Drizzle** : tables `libraries`, `library_sources`, `library_chunks`
2. **LibraryService** (nouveau singleton) :
   - CRUD referentiels (SQLite)
   - Import sources (copie + extraction texte)
   - Chunking adapte au type
   - Indexation (embed + Qdrant upsert)
   - Retrieval (query + selection budget)
3. **Queries Drizzle** : `src/main/db/queries/libraries.ts`
4. **Tests unitaires** : chunking, extraction, budget selection

### Phase 2 — IPC & Integration chat (S34-b)

5. **Handlers IPC** : `src/main/ipc/library.ipc.ts` (12 handlers)
6. **Validation Zod** pour chaque handler
7. **Preload bridge** : 12 nouvelles methodes
8. **Extension `chat.ipc.ts`** :
   - Ajout `libraryIds` dans `sendMessageSchema`
   - Retrieval + injection `<library-context>` avant `streamText()`
   - Stockage `librarySources` dans `contentData` du message assistant
9. **Extension StreamChunk** : `librarySourcesCount`

### Phase 3 — UI Referentiels (S34-c)

10. **Zustand store** : `library.store.ts`
11. **LibraryListView** : liste des referentiels + creation
12. **LibraryDetailView** : detail + gestion sources + recherche
13. **Dialogs** : creation/edition referentiel, confirmation suppression
14. **Navigation** : ajout vue 'libraries' dans le menu sidebar

### Phase 4 — UI Chat integration (S34-d)

15. **LibraryPicker** : popover de selection dans InputZone
16. **LibraryBadge** : badges attaches sous l'input
17. **SourceCitation** : composant inline dans MarkdownRenderer
18. **ContextWindowIndicator** : badge referentiel
19. **Sources footer** : section sources en bas des messages assistant

### Phase 5 — Polish & Qualite (S34-e)

20. **Progress bar** : indexation avec pourcentage
21. **Gestion d'erreurs** : retry, messages clairs, etats error
22. **Re-indexation** : action manuelle par source ou globale
23. **Integration projets** : scope referentiel par projet (optionnel)
24. **I18n** : traductions fr/en pour toute la feature
25. **Tests E2E** : Playwright pour le flow complet

---

## 15. Decisions techniques

### D1 : Une collection Qdrant par referentiel (vs collection unique)

**Choix : 1 collection par referentiel.**

- (+) Isolation parfaite — supprimer un referentiel = supprimer la collection
- (+) Pas de filtre `libraryId` dans chaque query — plus rapide
- (+) Stats par referentiel triviaux (`collection/info`)
- (-) Plus de collections Qdrant (max 50 referentiels = 51 collections avec S33)
- Qdrant gere tres bien des dizaines de collections

### D2 : Copier les fichiers source (vs reference path)

**Choix : copier dans `userData/libraries/`.**

- (+) Le referentiel survit au deplacement/suppression du fichier original
- (+) Re-indexation toujours possible
- (+) Backup/export du referentiel facile
- (-) Duplication disque — acceptable (20 MB max par fichier)

### D3 : Injection explicite (vs automatique)

**Choix : l'utilisateur attache explicitement les referentiels a chaque message.**

- (+) Zero gaspillage de tokens quand pas besoin
- (+) L'utilisateur controle exactement quel contexte le LLM utilise
- (+) Compatible multi-referentiel (choisir lesquels)
- (-) Friction supplementaire (1 clic de plus)
- **Amelioration future possible** : mode "auto-attach" par conversation ou projet

### D4 : Budget token fixe (3000) vs dynamique

**Choix : budget fixe de 3000 tokens.**

- (+) Previsible, simple a implementer
- (+) Fonctionne bien avec tous les modeles (meme 8K context)
- (-) Pourrait etre trop peu pour certains cas
- **Amelioration future** : slider dans les settings, ou proportionnel au context window du modele

### D5 : Citations `[source:N]` dans le texte (vs metadata separees)

**Choix : citations inline dans le texte du LLM.**

- (+) Simple a parser (regex)
- (+) Le LLM sait naturellement faire ca (c'est un pattern standard)
- (+) L'utilisateur voit les sources en contexte
- (-) Le LLM peut parfois oublier de citer — instruction forte dans le prompt

### D6 : Pas de chunking semantique (modele-based)

**Choix : chunking recursif par caracteres, adapte au type de contenu.**

- Les benchmarks 2025 montrent que le chunking recursif fixe (512 tokens) **bat** le chunking semantique en precision (69% vs 54%)
- Le chunking semantique necessite un appel embedding par phrase — cout CPU prohibitif pour l'indexation
- Le chunking recursif est deterministe, previsible, et suffisant

### D7 : Persistance des referentiels attaches dans l'historique

**Choix : stocker `libraryIds` dans `contentData` du message utilisateur.**

- Permet de savoir quels referentiels etaient actifs pour chaque message
- Pas de re-query automatique des anciens messages — les chunks injectes sont deja dans l'historique de la conversation
- Si l'utilisateur re-pose la question, il doit re-attacher le referentiel

---

## 16. Ce qui ne change PAS

- **Memoire semantique (S33)** : continue de fonctionner independamment
- **Memory Fragments** : inchanges
- **Chat flow global** : meme structure, on ajoute un bloc `<library-context>` quand necessaire
- **Qdrant process** : meme binaire, meme cycle de vie — juste plus de collections
- **EmbeddingService** : reutilise tel quel (meme modele, memes fonctions)
- **Attachments (images, documents dans le chat)** : systeme existant inchange — les referentiels sont un concept separe
- **Workspace tools** : inchanges

---

## 17. Resume des fichiers

### Nouveaux fichiers

| Fichier | Description |
|---|---|
| `src/main/services/library.service.ts` | Service singleton — CRUD, import, chunking, indexation, retrieval |
| `src/main/ipc/library.ipc.ts` | 12 handlers IPC + validation Zod |
| `src/main/db/queries/libraries.ts` | Queries Drizzle pour les 3 tables |
| `src/renderer/src/stores/library.store.ts` | Zustand store |
| `src/renderer/src/components/library/LibraryListView.tsx` | Vue liste des referentiels |
| `src/renderer/src/components/library/LibraryDetailView.tsx` | Vue detail + sources |
| `src/renderer/src/components/library/LibraryCreateDialog.tsx` | Dialog creation/edition |
| `src/renderer/src/components/library/SourceUpload.tsx` | Upload de fichiers source |
| `src/renderer/src/components/chat/LibraryPicker.tsx` | Popover selection dans InputZone |
| `src/renderer/src/components/chat/LibraryBadge.tsx` | Badge referentiel attache |
| `src/renderer/src/components/chat/SourceCitation.tsx` | Citation inline cliquable |

### Fichiers modifies

| Fichier | Modification |
|---|---|
| `src/main/db/schema.ts` | Ajouter tables `libraries`, `library_sources`, `library_chunks` |
| `src/main/ipc/index.ts` | Enregistrer handlers library, ajouter settings keys |
| `src/main/ipc/chat.ipc.ts` | Ajouter `libraryIds` au schema, retrieval + injection `<library-context>` |
| `src/preload/index.ts` | Ajouter 12 methodes library |
| `src/preload/types.ts` | Ajouter types Library, LibrarySource, etc. |
| `src/renderer/src/stores/ui.store.ts` | Ajouter `'libraries'` a `currentView` |
| `src/renderer/src/components/chat/InputZone.tsx` | Ajouter bouton LibraryPicker |
| `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Ajouter LibraryBadge |
| `src/renderer/src/components/chat/MessageItem.tsx` | Integrer SourceCitation |
| `src/renderer/src/components/Sidebar.tsx` | Ajouter navigation "Referentiels" |
| `src/renderer/src/i18n/` | Traductions fr/en |

---

## Annexe — Schemas de validation Zod (reference)

```typescript
// library.ipc.ts

const libraryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional(),
  projectId: z.string().optional()
})

const libraryUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(10).optional()
})

const addSourcesSchema = z.object({
  libraryId: z.string().min(1),
  filePaths: z.array(z.string().min(1).max(1000)).min(1).max(20)
})

const librarySearchSchema = z.object({
  libraryId: z.string().min(1),
  query: z.string().min(1).max(1000),
  topK: z.number().int().min(1).max(20).default(5)
})

// Extension sendMessageSchema
const sendMessageSchemaExtended = sendMessageSchema.extend({
  libraryIds: z.array(z.string()).max(5).optional()
})
```
