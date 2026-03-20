# Fork de Discussion — Plan d'implementation

## Objectif

Permettre de dupliquer une conversation existante (messages, role, modele, projet, workspace...) pour bifurquer sur une autre piste. Les 2 discussions sont totalement independantes apres le fork.

## Acces

1. **Bouton UI** — icone "fork" (GitFork) dans les actions hover de `ConversationItem`
2. **Slash commande** `/fork` — commande builtin qui fork la conversation active

---

## Etapes d'implementation

### Etape 1 — Backend : query `forkConversation`

**Fichier** : `src/main/db/queries/conversations.ts`

Ajouter une fonction `forkConversation(sourceId: string): Conversation` qui :

1. Lit la conversation source (`getConversation(sourceId)`)
2. Cree une nouvelle conversation avec :
   - `id` : `nanoid()`
   - `title` : `"{titre original} (fork)"`
   - `projectId` : copie du source
   - `modelId` : copie du source
   - `roleId` : copie du source
   - `activeLibraryId` : copie du source
   - `isFavorite` : `false` (pas de copie du favori)
   - `isArena` : `false`
   - `createdAt` / `updatedAt` : `new Date()`
3. Lit tous les messages de la conversation source (`getMessagesForConversation(sourceId)`)
4. Insere chaque message dans la nouvelle conversation :
   - Nouveau `id` (nanoid) pour chaque message
   - `conversationId` : id de la nouvelle conversation
   - `parentMessageId` : remapper vers les nouveaux IDs (via un Map old→new)
   - Copie integrale : `role`, `content`, `contentData`, `modelId`, `providerId`, `tokensIn`, `tokensOut`, `cost`, `responseTimeMs`
   - `createdAt` : conserver les timestamps originaux (pour garder l'ordre)
5. Retourne la nouvelle conversation

> **Note** : Les attachments ne sont PAS copies (ils referent des fichiers physiques). Les messages gardent la reference `contentData` mais les fichiers ne sont pas dupliques. A preciser dans le tooltip UI.

### Etape 2 — IPC handler `conversations:fork`

**Fichier** : `src/main/ipc/conversations.ipc.ts`

Ajouter dans `registerConversationsIpc()` :

```typescript
ipcMain.handle('conversations:fork', async (_event, id: string) => {
  idSchema.parse(id)
  return forkConversation(id)
})
```

### Etape 3 — Preload bridge

**Fichier** : `src/preload/index.ts`

Ajouter dans l'objet `api` :

```typescript
forkConversation: (id: string) => ipcRenderer.invoke('conversations:fork', id),
```

**Fichier** : `src/preload/types.ts`

Ajouter dans `ElectronAPI` :

```typescript
forkConversation(id: string): Promise<Conversation>
```

### Etape 4 — Store Zustand

**Fichier** : `src/renderer/src/stores/conversations.store.ts`

Pas de changement structurel — la nouvelle conversation est ajoutee via `addConversation()` deja existant apres l'appel IPC.

### Etape 5 — Bouton UI dans ConversationItem

**Fichier** : `src/renderer/src/components/conversations/ConversationItem.tsx`

1. Ajouter la prop `onFork?: (id: string) => void` dans `ConversationItemProps`
2. Ajouter l'icone `GitFork` (import depuis lucide-react)
3. Ajouter un bouton dans le groupe d'actions hover (entre "Renommer" et "Supprimer") :

```tsx
<button
  onClick={handleFork}
  className="rounded p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
  title="Forker la discussion"
>
  <GitFork className="size-3" />
</button>
```

### Etape 6 — Propagation de l'action fork

**Fichier** : `src/renderer/src/components/conversations/ConversationList.tsx`

1. Ajouter la prop `onForkConversation?: (id: string) => void` dans `ConversationListProps`
2. Passer `onFork={onForkConversation}` a chaque `<ConversationItem />`

**Fichier** : `src/renderer/src/components/layout/Sidebar.tsx`

Ajouter le handler :

```typescript
const handleFork = async (id: string) => {
  const forked = await window.api.forkConversation(id)
  if (forked) {
    addConversation(forked)
    setActiveConversation(forked.id)
  }
}
```

### Etape 7 — Slash commande `/fork` (builtin)

**Fichier** : `src/main/commands/builtin.ts`

Ajouter `'fork'` dans `RESERVED_COMMAND_NAMES` (car c'est une action, pas un prompt LLM).

> **Attention** : `/fork` n'est PAS une slash commande classique (pas un prompt envoye au LLM). C'est une **commande d'action** executee cote client. Il faut la traiter comme un cas special dans le renderer.

**Fichier** : `src/renderer/src/hooks/useSlashCommands.ts`

Dans la logique de resolution, ajouter un cas pour les commandes d'action :

```typescript
// Commandes d'action (pas de prompt LLM)
const ACTION_COMMANDS = [
  { name: 'fork', description: 'Forker cette discussion' }
]
```

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx`

Dans `handleSendText()`, avant l'envoi IPC, intercepter `/fork` :

```typescript
if (resolvedCommand?.name === 'fork') {
  // Executer le fork au lieu d'envoyer un message
  await handleForkCurrentConversation()
  return
}
```

Ou plus proprement — dans le hook `useSlashCommands`, retourner un type `{ type: 'action', action: 'fork' }` vs `{ type: 'prompt', content: '...' }` pour distinguer les deux cas.

### Etape 8 — Feedback utilisateur

Apres un fork reussi :
- Naviguer automatiquement vers la nouvelle conversation (deja gere par `setActiveConversation`)
- Afficher un toast/notification ephemere : "Discussion forkee avec succes"
- La conversation forkee apparait dans la sidebar avec le titre "{original} (fork)"

---

## Schema des fichiers impactes

| Fichier | Modification |
|---|---|
| `src/main/db/queries/conversations.ts` | + `forkConversation()` |
| `src/main/ipc/conversations.ipc.ts` | + handler `conversations:fork` |
| `src/preload/index.ts` | + `forkConversation` bridge |
| `src/preload/types.ts` | + type dans `ElectronAPI` |
| `src/renderer/src/components/conversations/ConversationItem.tsx` | + bouton GitFork + prop `onFork` |
| `src/renderer/src/components/conversations/ConversationList.tsx` | + prop `onForkConversation` propagee |
| `src/renderer/src/components/chat/InputZone.tsx` | + interception `/fork` |
| `src/renderer/src/hooks/useSlashCommands.ts` | + commande action `/fork` |
| `src/main/commands/builtin.ts` | + `'fork'` dans RESERVED_COMMAND_NAMES |
| `src/renderer/src/components/layout/Sidebar.tsx` | + handler `handleFork` |

---

## Ce qui n'est PAS copie (scope V1)

- **Attachments physiques** (fichiers sur disque) — seules les references dans `contentData` sont copiees
- **Indexation Qdrant** (memoire semantique) — la nouvelle conversation sera indexee au fur et a mesure de ses propres messages
- **Statistiques** — les stats restent liees a la conversation originale
- **Arena matches** — non copiees

## Points d'attention

1. **Performance** — Pour les conversations longues (>1000 messages), faire l'insertion par batch (`better-sqlite3` est synchrone, donc un gros insert bloque l'event loop). Utiliser une transaction Drizzle pour atomicite.
2. **parentMessageId remapping** — Construire un Map `oldId → newId` pendant la copie pour remapper correctement les parentMessageId.
3. **FTS5** — Si l'index FTS est `content=messages`, les nouveaux messages seront automatiquement indexes. Verifier que le trigger est en place.
