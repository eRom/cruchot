# Feature Spec — Memory Fragments

> Date : 2026-03-11
> Statut : Draft
> Auteur : Trinity + Romain

## 1. Vue d'ensemble

Système de "mémoire partagée" sous forme de fragments textuels définis par l'utilisateur. Chaque fragment est un bloc de contexte personnel (identité, préférences, contexte métier, etc.) qui peut être activé/désactivé individuellement. Les fragments actifs sont injectés dans le system prompt de **toutes les conversations**, indépendamment du modèle, du provider ou du projet.

### Exemples de fragments

| Contenu | Actif |
|---------|-------|
| "Je suis Romain, architecte logiciel, 49 ans" | ✅ |
| "Mon fils, Ethan, a 12 ans" | ❌ |
| "Je préfère les réponses concises et directes" | ✅ |
| "Stack principale : TypeScript, React, Electron" | ✅ |

### Principes

- **Global** : les fragments s'appliquent à toutes les conversations (pas par projet/modèle)
- **Additif** : les fragments se cumulent au rôle actif, ils ne le remplacent pas
- **Ordre déterministe** : l'utilisateur contrôle l'ordre des fragments via drag & drop
- **Persistant** : stocké en DB SQLite, pas dans localStorage
- **Sécurisé** : validation taille/contenu, pas d'injection de rôle système

---

## 2. Architecture — Construction du System Prompt

### Ordre d'injection actuel (chat.ipc.ts)

```
1. systemPrompt (du rôle actif, optionnel)
2. + workspace-files XML (fichiers attachés, optionnel)
3. + WORKSPACE_TOOLS_PROMPT (si workspace actif)
```

### Nouvel ordre avec Memory Fragments

```
1. MEMORY FRAGMENTS (tous les fragments actifs, concaténés)    ← NOUVEAU
2. + systemPrompt du rôle actif (optionnel)
3. + workspace-files XML (fichiers attachés, optionnel)
4. + WORKSPACE_TOOLS_PROMPT (si workspace actif)
```

### Justification de l'ordre

Les fragments mémoire passent **en premier** car ils représentent le contexte utilisateur permanent (identité, préférences). Le rôle vient ensuite car il définit le comportement spécifique pour la session. Les fichiers workspace et tools sont du contexte technique éphémère.

### Format d'injection

```xml
<user-memory>
Je suis Romain, architecte logiciel, 49 ans.
Je préfère les réponses concises et directes.
Stack principale : TypeScript, React, Electron.
</user-memory>
```

Les fragments actifs sont joints par `\n` dans un bloc `<user-memory>`. Le tag XML délimite clairement la zone mémoire du reste du system prompt. Pas de formatage intermédiaire — chaque fragment est injecté tel quel.

### Concaténation avec le rôle

Le system prompt final dans `aiMessages[0]` sera :

```
<user-memory>
[fragment 1]
[fragment 2]
...
</user-memory>

[system prompt du rôle, si actif]

[workspace-files, si fichiers attachés]

[WORKSPACE_TOOLS_PROMPT, si workspace actif]
```

Si aucun fragment actif ET aucun rôle : pas de message `system` (comportement actuel inchangé).

---

## 3. Modèle de données

### Nouvelle table : `memory_fragments`

```typescript
export const memoryFragments = sqliteTable('memory_fragments', {
  id: text('id').primaryKey(),                    // nanoid
  content: text('content').notNull(),             // Texte du fragment (max 2000 chars)
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull(),      // Ordre d'affichage et d'injection
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

### Contraintes

| Champ | Validation |
|-------|-----------|
| `content` | Non vide, max 2000 caractères, trimmed |
| `sortOrder` | Entier >= 0, unique (géré par l'app) |
| `isActive` | Booléen, default `true` |

### Pas de champ `label` / `title`

Choix délibéré : un fragment = un contenu texte brut. Pas de titre séparé — le contenu est suffisamment court pour être auto-descriptif. Ça simplifie l'UI et la DB.

---

## 4. Couche DB — Queries

### Fichier : `src/main/db/queries/memory-fragments.ts`

```typescript
// Queries principales
getAllMemoryFragments(): MemoryFragment[]          // ORDER BY sortOrder ASC
getActiveMemoryFragments(): MemoryFragment[]       // WHERE isActive = true ORDER BY sortOrder ASC
createMemoryFragment(content, isActive?): MemoryFragment
updateMemoryFragment(id, { content?, isActive? }): MemoryFragment
deleteMemoryFragment(id): void
reorderMemoryFragments(orderedIds: string[]): void // Bulk update sortOrder
toggleMemoryFragment(id): MemoryFragment           // Flip isActive
```

### Fonction utilitaire : `buildMemoryBlock()`

```typescript
/**
 * Construit le bloc <user-memory> à partir des fragments actifs.
 * Retourne null si aucun fragment actif.
 */
export function buildMemoryBlock(): string | null {
  const fragments = getActiveMemoryFragments()
  if (fragments.length === 0) return null

  const joined = fragments.map(f => f.content).join('\n')
  return `<user-memory>\n${joined}\n</user-memory>`
}
```

Cette fonction est appelée dans `chat.ipc.ts` au moment de construire `aiMessages`.

---

## 5. Couche IPC

### Handlers : `src/main/ipc/memory-fragments.ipc.ts`

| Channel | Params | Retour | Description |
|---------|--------|--------|-------------|
| `memory:list` | — | `MemoryFragment[]` | Tous les fragments (triés par sortOrder) |
| `memory:get-active-block` | — | `string \| null` | Bloc `<user-memory>` pré-construit |
| `memory:create` | `{ content, isActive? }` | `MemoryFragment` | Créer un fragment |
| `memory:update` | `{ id, content?, isActive? }` | `MemoryFragment` | Modifier un fragment |
| `memory:delete` | `{ id }` | `void` | Supprimer un fragment |
| `memory:reorder` | `{ orderedIds: string[] }` | `void` | Réordonner tous les fragments |
| `memory:toggle` | `{ id }` | `MemoryFragment` | Toggle active/inactive |

### Validation Zod

```typescript
const createSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  isActive: z.boolean().optional().default(true),
})

const updateSchema = z.object({
  id: z.string().min(1),
  content: z.string().trim().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
})

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(100),
})
```

---

## 6. Preload Bridge

### Ajouts dans `src/preload/index.ts`

```typescript
// Memory Fragments
listMemoryFragments: () => ipcRenderer.invoke('memory:list'),
getActiveMemoryBlock: () => ipcRenderer.invoke('memory:get-active-block'),
createMemoryFragment: (payload) => ipcRenderer.invoke('memory:create', payload),
updateMemoryFragment: (payload) => ipcRenderer.invoke('memory:update', payload),
deleteMemoryFragment: (payload) => ipcRenderer.invoke('memory:delete', payload),
reorderMemoryFragments: (payload) => ipcRenderer.invoke('memory:reorder', payload),
toggleMemoryFragment: (payload) => ipcRenderer.invoke('memory:toggle', payload),
```

### Types dans `src/preload/types.ts`

```typescript
export interface MemoryFragment {
  id: string
  content: string
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}
```

---

## 7. Store Zustand

### Fichier : `src/renderer/src/stores/memory.store.ts`

```typescript
interface MemoryState {
  fragments: MemoryFragment[]
  isLoaded: boolean

  // Actions
  loadFragments: () => Promise<void>
  createFragment: (content: string, isActive?: boolean) => Promise<void>
  updateFragment: (id: string, updates: Partial<Pick<MemoryFragment, 'content' | 'isActive'>>) => Promise<void>
  deleteFragment: (id: string) => Promise<void>
  toggleFragment: (id: string) => Promise<void>
  reorderFragments: (orderedIds: string[]) => Promise<void>
}
```

**Pas de `persist`** — les données sont en DB SQLite, pas localStorage. Le store est un cache mémoire chargé au démarrage (`loadFragments()` dans `useInitApp`).

---

## 8. Modification de `chat.ipc.ts`

### Changement principal

Dans le handler `chat:send`, **avant** l'injection du `systemPrompt` du rôle :

```typescript
// 1. Memory Fragments (contexte permanent utilisateur)
const memoryBlock = buildMemoryBlock()

// 2. System prompt du rôle (si fourni)
// 3. Construction du message system combiné
let systemContent = ''
if (memoryBlock) systemContent += memoryBlock
if (systemPrompt) {
  if (systemContent) systemContent += '\n\n'
  systemContent += systemPrompt
}

if (systemContent) {
  aiMessages.push({ role: 'system', content: systemContent })
}

// Le reste (workspace files, tools prompt) s'ajoute comme avant
```

### Flux complet mis à jour

```
buildMemoryBlock() → fragments actifs concaténés en <user-memory>
         ↓
systemPrompt du rôle (déjà résolu avec variables)
         ↓
Concaténation : memory + role → premier message system
         ↓
+ workspace-files XML (append)
         ↓
+ WORKSPACE_TOOLS_PROMPT (append)
         ↓
streamText({ messages: aiMessages, ... })
```

---

## 9. Interface utilisateur

### Emplacement : Personnalition > nouvel onglet "Mémoire" (juste après MCP)

### Layout de l'onglet Mémoire

```
┌─────────────────────────────────────────────────────────┐
│ Mémoire                                                 │
│                                                         │
│ Fragments de contexte personnel injectés dans toutes    │
│ les conversations. Glisser pour réordonner.             │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ≡  [ON ] Je suis Romain, architecte logiciel, 49…  │ │
│ │         [Éditer] [Supprimer]                 hover  │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ≡  [OFF] Mon fils, Ethan, a 12 ans                  │ │
│ │         [Éditer] [Supprimer]                 hover  │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ≡  [ON ] Je préfère les réponses concises…          │ │
│ │         [Éditer] [Supprimer]                 hover  │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [+ Ajouter un fragment]                                 │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│ Aperçu mémoire active          [2 fragments actifs]     │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ <user-memory>                                       │ │
│ │ Je suis Romain, architecte logiciel, 49 ans.        │ │
│ │ Je préfère les réponses concises et directes.       │ │
│ │ </user-memory>                                      │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Composants

| Composant | Fichier | Description |
|-----------|---------|-------------|
| `MemoryView` | `components/settings/MemoryView.tsx` | Vue principale, liste + aperçu |
| `MemoryFragmentCard` | `components/settings/MemoryFragmentCard.tsx` | Carte fragment avec toggle/edit/delete |
| `MemoryFragmentForm` | `components/settings/MemoryFragmentForm.tsx` | Formulaire inline create/edit (textarea) |
| `MemoryPreview` | `components/settings/MemoryPreview.tsx` | Aperçu readonly du bloc `<user-memory>` |

### Interactions

- **Toggle ON/OFF** : bouton custom (pattern TaskCard, pas de Switch shadcn)
- **Drag & Drop** : `≡` handle à gauche, réordonne les fragments. Lib : `@dnd-kit/core` + `@dnd-kit/sortable` (déjà utilisé ? sinon natif HTML5 DnD)
- **Éditer** : inline — le contenu de la carte devient un textarea (pattern subView existant)
- **Supprimer** : confirmation inline "Supprimer ce fragment ?" + bouton Confirmer
- **Ajouter** : textarea vide en bas de la liste, auto-focus, bouton "Enregistrer"
- **Aperçu** : bloc code readonly qui montre le XML tel qu'il sera injecté. Se met à jour en temps réel quand on toggle/reorder

### Navigation

Ajouter `'memory'` dans le type `SettingsTab` du `ui.store.ts`.

---

## 10. Sécurité

### 10.1 Validation du contenu

| Règle | Détail |
|-------|--------|
| Taille max | 2000 caractères par fragment |
| Nombre max | 50 fragments maximum |
| Taille totale max | 10 000 caractères (somme des fragments actifs) |
| Trim | Espaces début/fin supprimés |
| Pas de vide | Contenu non-vide après trim |

### 10.2 Pas d'injection système

Les fragments sont du **contenu utilisateur** injecté dans le system prompt. Risque théorique : un utilisateur pourrait écrire un fragment qui "overrides" les instructions du rôle. Mais comme c'est mono-utilisateur et que **l'utilisateur écrit lui-même** les fragments, ce n'est pas un risque réel (pas de vecteur d'attaque externe).

Néanmoins, par prudence :
- Les fragments sont injectés dans un bloc XML `<user-memory>` clairement délimité
- Le rôle vient **après** la mémoire — il a donc la "dernière parole" sur les instructions comportementales
- Aucun parsing/exécution du contenu des fragments côté main process

### 10.3 Validation IPC

Tous les handlers IPC valident via Zod :
- `content` : `z.string().trim().min(1).max(2000)`
- `id` : `z.string().min(1)`
- `orderedIds` : `z.array().max(100)`
- Pas de SQL injection (Drizzle ORM paramétré)

### 10.4 Pas de données sensibles en clair

Les fragments sont stockés en **clair** en SQLite (pas chiffrés via safeStorage). C'est acceptable car :
- Mono-utilisateur, données locales
- Le contenu est du contexte personnel, pas des secrets (API keys, mots de passe)
- Les rôles sont déjà stockés en clair avec le même niveau de risque

Si un utilisateur stocke des données sensibles dans un fragment, c'est sa responsabilité — comme pour les rôles.

---

## 11. Limites et garde-fous

### Taille du system prompt

Chaque fragment ajoute des tokens au system prompt. Avec les limites ci-dessus :
- Max 50 fragments × 2000 chars = 100K chars théorique
- Limite réaliste : 10 000 chars total pour les fragments actifs
- Estimation : ~2500 tokens pour 10K chars

Ce budget est raisonnable par rapport aux context windows des modèles (128K+ pour la plupart).

### Pas d'impact sur le coût

Les tokens du system prompt sont facturés comme `inputTokens`. L'ajout de mémoire augmente légèrement le coût par message. Pas d'avertissement UI nécessaire — les fragments sont courts par design (2000 chars max chacun).

---

## 12. Plan d'implémentation

### Phase 1 — Backend (DB + IPC)

| Étape | Fichier | Description |
|-------|---------|-------------|
| 1.1 | `src/main/db/schema.ts` | Ajouter table `memoryFragments` |
| 1.2 | `src/main/db/queries/memory-fragments.ts` | Queries CRUD + `buildMemoryBlock()` |
| 1.3 | `src/main/ipc/memory-fragments.ipc.ts` | 7 handlers IPC avec validation Zod |
| 1.4 | `src/main/ipc/index.ts` | Enregistrer les handlers memory |
| 1.5 | `src/main/ipc/chat.ipc.ts` | Injecter `buildMemoryBlock()` dans la construction du system prompt |

### Phase 2 — Bridge + Store

| Étape | Fichier | Description |
|-------|---------|-------------|
| 2.1 | `src/preload/types.ts` | Type `MemoryFragment` |
| 2.2 | `src/preload/index.ts` | 7 méthodes bridge |
| 2.3 | `src/renderer/src/stores/memory.store.ts` | Store Zustand (pas persist) |
| 2.4 | `src/renderer/src/hooks/useInitApp.ts` | Charger fragments au démarrage |

### Phase 3 — UI

| Étape | Fichier | Description |
|-------|---------|-------------|
| 3.1 | `src/renderer/src/stores/ui.store.ts` | Ajouter `'memory'` à `SettingsTab` |
| 3.2 | `src/renderer/src/components/settings/SettingsView.tsx` | Nouvel onglet "Mémoire" |
| 3.3 | `src/renderer/src/components/settings/MemoryView.tsx` | Vue principale (liste + aperçu) |
| 3.4 | `src/renderer/src/components/settings/MemoryFragmentCard.tsx` | Carte fragment |
| 3.5 | `src/renderer/src/components/settings/MemoryFragmentForm.tsx` | Formulaire create/edit |
| 3.6 | `src/renderer/src/components/settings/MemoryPreview.tsx` | Aperçu XML |

### Phase 4 — Drag & Drop (optionnelle, peut venir après)

| Étape | Description |
|-------|-------------|
| 4.1 | Intégrer `@dnd-kit/sortable` ou HTML5 DnD natif |
| 4.2 | Handle `≡` sur `MemoryFragmentCard` |
| 4.3 | Appel `reorderFragments()` au drop |

---

## 13. Ce qui ne change PAS

- **Roles** : aucune modification. Les rôles restent indépendants de la mémoire.
- **Workspace** : injection fichiers inchangée.
- **Conversation history** : les messages passés ne sont pas affectés.
- **SendMessagePayload** : pas de nouveau champ — la mémoire est lue côté main process directement.
- **Coût calculator** : pas de changement.
- **ModelSelector / InputZone** : pas de changement.

---

## 14. Questions ouvertes

### Q1 : Faut-il un indicateur visuel dans le chat ?

Option A : Rien — la mémoire est invisible dans le chat (comme les rôles actuellement).
Option B : Un petit badge/indicateur dans le footer du message montrant "Mémoire active (3 fragments)".

**Recommandation** : Option A pour la V1. La mémoire est un contexte implicite, pas besoin de le rappeler à chaque message.

### Q2 : Faut-il une limite "soft" avec avertissement ?

Quand la taille totale des fragments actifs dépasse un seuil (ex: 5000 chars), afficher un avertissement dans l'UI ?

**Recommandation** : Oui, avertissement non-bloquant dans `MemoryPreview` : "Attention : X caractères — impact sur le coût et la fenêtre de contexte."

### Q3 : Drag & Drop — lib externe ou natif ?

- `@dnd-kit` : robuste, accessible, mais dépendance supplémentaire
- HTML5 DnD natif : zero dépendance, mais moins smooth

**Recommandation** : HTML5 natif pour la V1 (simplicité), migration vers `@dnd-kit` si besoin.

---

## 15. Résumé des fichiers à créer/modifier

### Nouveaux fichiers (6)

```
src/main/db/queries/memory-fragments.ts
src/main/ipc/memory-fragments.ipc.ts
src/renderer/src/stores/memory.store.ts
src/renderer/src/components/settings/MemoryView.tsx
src/renderer/src/components/settings/MemoryFragmentCard.tsx
src/renderer/src/components/settings/MemoryPreview.tsx
```

### Fichiers modifiés (6)

```
src/main/db/schema.ts              → nouvelle table
src/main/ipc/index.ts              → enregistrement handlers
src/main/ipc/chat.ipc.ts           → injection mémoire dans system prompt
src/preload/index.ts               → 7 méthodes bridge
src/preload/types.ts               → type MemoryFragment
src/renderer/src/stores/ui.store.ts → SettingsTab 'memory'
src/renderer/src/components/settings/SettingsView.tsx → onglet Mémoire
src/renderer/src/hooks/useInitApp.ts → chargement initial
```

### Aucune dépendance externe requise (V1)
