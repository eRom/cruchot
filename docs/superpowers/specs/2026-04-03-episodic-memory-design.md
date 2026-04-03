# Mémoire Épisodique — Design Spec

> Feature #7 — Mem0-style behavioral memory
> Date : 2026-04-03 (S55)
> Statut : Design validé

## Objectif

Ajouter une troisième couche de mémoire à Cruchot : la mémoire **épisodique**. Contrairement à la mémoire sémantique (RAG vectoriel sur les conversations) et aux fragments manuels, la mémoire épisodique **distille automatiquement** des faits comportementaux sur l'utilisateur à partir des conversations.

Exemples d'épisodes : "Préfère les réponses courtes", "Expert TypeScript", "Utilise trash au lieu de rm", "Ton sec et humour noir".

Gain attendu : +26% accuracy (recherche Mem0), stickiness utilisateur.

## Architecture — SQLite pur

Pas de Qdrant pour les épisodes. Les faits comportementaux sont courts, universels, et doivent être injectés en totalité (pas de recherche par similarité). Stockage SQLite, injection exhaustive dans le system prompt.

## Modèle de données

### Nouvelle table `episodes`

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | text PK | nanoid |
| `content` | text | Le fait distillé ("Préfère les réponses courtes") |
| `category` | text | enum: `preference`, `behavior`, `context`, `skill`, `style` |
| `confidence` | real | Score 0.0 - 1.0 fourni par le LLM |
| `occurrences` | integer | Nombre de fois observé (default 1) |
| `projectId` | text \| null | null = global, sinon scopé au projet |
| `sourceConversationId` | text | Conversation d'origine (pas de FK — l'épisode survit à la suppression de la conversation) |
| `isActive` | integer | Boolean (default 1) |
| `createdAt` | integer | Timestamp seconds |
| `updatedAt` | integer | Timestamp seconds |

Index : `idx_episodes_active_project` sur `(isActive, projectId)`.

### Catégories

- `preference` — "Préfère X à Y", "Déteste les docstrings non demandées"
- `behavior` — "Code en TypeScript le matin", "Utilise trash au lieu de rm"
- `context` — "Travaille chez Acme Corp", "Projet principal = Cruchot"
- `skill` — "Expert TypeScript", "Débutant en Rust"
- `style` — "Ton sec et direct", "Réponses courtes"

### Nouvelle colonne sur `conversations`

```
lastEpisodeMessageId: text | null
```

Pointe vers le dernier message traité pour l'extraction. Permet de ne traiter que le delta.

### Scope des épisodes

- `projectId IS NULL` → épisode global (majorité des cas)
- `projectId = "xxx"` → épisode scopé à un projet
- Au recall : globaux + ceux du projet actif

## Service de déclenchement — `EpisodeTriggerService`

Singleton isolé. Toute la logique de "quand extraire" est ici, découplée de l'extraction elle-même.

### 3 déclencheurs

1. **Switch de conversation** — quand l'utilisateur change de conversation active, extraction du delta sur la conversation quittée
2. **Idle timeout 5 minutes** — timer reset à chaque message, extraction au timeout sur la conversation active
3. **Fermeture app** — `before-quit` lifecycle, extraction des conversations avec delta non traité

### Guard (dans le trigger)

- Delta < 4 messages depuis `lastEpisodeMessageId` → skip
- Extraction déjà en cours sur cette conversation → skip (flag `extractingSet: Set<string>`)
- Mémoire épisodique désactivée dans settings → skip

### Interface

- `onConversationLeft(convId)` — fire-and-forget
- `onMessageSent(convId)` — reset idle timer
- `onAppQuitting()` — extraction synchrone
- `dispose()` — cleanup timers

## Service d'extraction — `EpisodeExtractorService`

Singleton. Prend un delta de messages + épisodes existants, appelle le LLM, applique les actions.

### Flux

1. Charger les épisodes actifs depuis SQLite
2. Charger le delta de messages (depuis `lastEpisodeMessageId` jusqu'au dernier message)
3. `generateText()` avec le modèle configuré (`settings.episodeModelId`)
4. Parser le JSON retourné
5. Appliquer les actions :
   - `create` → INSERT nouvel épisode
   - `reinforce` → UPDATE `occurrences += 1`, `confidence`, `updatedAt`
   - `update` → UPDATE `content`, `confidence`, `updatedAt` (le fait a évolué)
6. Mettre à jour `lastEpisodeMessageId` sur la conversation

### Prompt d'extraction

```
Tu es un analyseur comportemental. À partir de cet échange, extrais les faits
notables sur l'utilisateur (préférences, habitudes, compétences, style, contexte).

Épisodes déjà connus :
<existing-episodes>
[id: "abc"] (x3, 0.85) preference: "Préfère les réponses courtes"
[id: "def"] (x1, 0.60) skill: "Expert TypeScript"
</existing-episodes>

Conversation à analyser :
<conversation-delta>
[user]: ...
[assistant]: ...
</conversation-delta>

Retourne un JSON array. Chaque élément est soit :
- { "action": "create", "content": "...", "category": "...", "confidence": 0.0-1.0 }
- { "action": "reinforce", "episodeId": "...", "confidence": 0.0-1.0 }
- { "action": "update", "episodeId": "...", "content": "...", "confidence": 0.0-1.0 }

Retourne [] si rien de notable.
```

### Dédup à l'extraction

Le LLM reçoit les épisodes existants en contexte. Il doit :
- `create` seulement si le fait est nouveau
- `reinforce` si le fait existe déjà et est re-observé
- `update` si le fait existe mais a évolué ("Débutant Rust" → "Intermédiaire Rust")

### Modèle configurable

- Stocké dans `settings.episodeModelId` (format `providerId::modelId`)
- Sélecteur dans l'onglet Profil de la MemoryView
- Fallback : premier provider configuré avec un petit modèle disponible

## Injection dans le system prompt

### Ordre d'injection

```
1. <library-context>      ← RAG référentiel sticky
2. <semantic-memory>       ← Recall Qdrant conversations
3. <user-profile>          ← Épisodes actifs (NOUVEAU)
4. <user-memory>           ← Memory fragments manuels
5. Role system prompt      ← Persona
```

### Format du bloc

```xml
<user-profile>
Profil comportemental de l'utilisateur :

[preference] (confiance: 95%, vu 12x) Préfère les réponses courtes
[style] (confiance: 87%, vu 5x) Ton sec et direct, humour noir
[skill] (confiance: 80%, vu 3x) Expert TypeScript, débutant Rust
[behavior] (confiance: 72%, vu 2x) Utilise trash au lieu de rm
</user-profile>
```

### Règles d'injection

- `buildEpisodeProfileBlock()` dans `episode-prompt.ts`
- Seulement `isActive = true`
- Scope : globaux + projet actif
- Seuil : `confidence >= 0.3`
- Tri : `confidence * log(occurrences + 1)` desc
- Cap : 100 épisodes max, ~2500 tokens max
- Sanitization XML (même pattern que semantic-memory)

## IPC

### Handlers (`episode.ipc.ts`)

| Channel | Description |
|---------|-------------|
| `episode:list` | Liste épisodes (filtres: projectId, category, isActive) |
| `episode:toggle` | Toggle isActive |
| `episode:delete` | Supprime un épisode |
| `episode:delete-all` | Supprime tous les épisodes |
| `episode:stats` | Count, dernière extraction, modèle |
| `episode:set-model` | Sauvegarde le modèle d'extraction |
| `episode:extract-now` | Force extraction manuelle (debug/test) |

Validation Zod sur tous les payloads.

### Preload

7 méthodes `window.api.episode*` dans `contextBridge`.

### Store Zustand

`episode.store.ts` : `episodes[]`, `isLoading`, `stats`, `loadEpisodes()`, `toggleEpisode()`, `deleteEpisode()`.

## UI — Refonte MemoryView

### Tabs : Notes · Souvenirs · Profil

```
┌─────────────────────────────────────────┐
│  Notes  ·  Souvenirs  ·  Profil        │
├─────────────────────────────────────────┤
│  (contenu de l'onglet actif)            │
└─────────────────────────────────────────┘
```

- **Notes** : actuel MemoryView (fragments). Aucun changement fonctionnel.
- **Souvenirs** : actuel SemanticMemorySection (stats Qdrant, toggle, reindex, search). Contenu complet ici. Le Right Panel garde un indicateur compact (status + points count) avec lien "Voir détails" qui ouvre Personnaliser > Mémoire > Souvenirs.
- **Profil** : nouveau.

### Onglet Profil

- Sélecteur de modèle en haut
- Stats compactes (N épisodes, dernière extraction)
- Épisodes groupés par catégorie, triés par confidence desc
- Chaque épisode : toggle actif/inactif, supprimer, metadata (occurrences, date, confidence %)
- Badge catégorie coloré
- État vide : "Aucun épisode détecté. Cruchot apprendra à te connaître au fil des conversations."

## Cleanup

- Zone orange (partiel) : DELETE FROM episodes
- Zone rouge (factory reset) : idem + conversations.lastEpisodeMessageId = null
- Pas de FK vers conversations — les épisodes survivent à la suppression de la conversation source

## Fichiers à créer

- `src/main/services/episode-extractor.service.ts`
- `src/main/services/episode-trigger.service.ts`
- `src/main/ipc/episode.ipc.ts`
- `src/main/llm/episode-prompt.ts`
- `src/main/db/queries/episodes.ts`
- `src/renderer/src/stores/episode.store.ts`
- `src/renderer/src/components/memory/ProfileTab.tsx`

## Fichiers à modifier

- `src/main/db/schema.ts` — table `episodes` + colonne `lastEpisodeMessageId`
- `src/main/db/migrate.ts` — CREATE TABLE + ALTER TABLE
- `src/main/ipc/chat.ipc.ts` — injection `<user-profile>` + notification trigger
- `src/main/ipc/index.ts` — register episode handlers
- `src/main/ipc/data.ipc.ts` — cleanup episodes
- `src/main/index.ts` — init trigger service + before-quit hook
- `src/preload/index.ts` — 7 méthodes episode*
- `src/preload/types.ts` — types Episode, EpisodeCategory
- `src/renderer/src/components/memory/MemoryView.tsx` — refactor en tabs
- `src/renderer/src/components/customize/CustomizeView.tsx` — si impact

## Ce qui ne change PAS

- Mémoire sémantique Qdrant (pipeline inchangé)
- Memory fragments (inchangés, juste dans un onglet)
- Pipeline chat existant (une ligne d'injection ajoutée)
- Right Panel (indicateur compact Souvenirs remplace la section complète)
