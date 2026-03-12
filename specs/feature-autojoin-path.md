# Feature — @mention de fichiers workspace dans InputZone

> Date : 2026-03-12
> Statut : **En attente d'approbation**

## Objectif

Permettre a l'utilisateur de taper `@` dans le textarea de chat pour declencher un autocomplete des fichiers/dossiers du workspace actif. Le fichier selectionne est automatiquement attache au message (meme mecanique que le clic droit dans FileTree).

**Si aucun workspace n'est ouvert, le `@` ne declenche rien** (caractere saisi normalement).

---

## Comportement utilisateur

1. L'utilisateur tape `@` dans le textarea
2. Un popover d'autocomplete apparait au-dessus du curseur
3. L'utilisateur continue de taper pour filtrer (`@coll` → filtre les fichiers/dossiers commencant par "coll")
4. Navigation clavier (fleches haut/bas, Enter pour selectionner, Escape pour fermer)
5. A la selection :
   - Le fichier est ajoute a `workspace.store.attachedFiles` (meme mecanique qu'aujourd'hui)
   - Le badge `FileReference` apparait au-dessus du textarea
   - Le texte `@chemin/fichier` est **retire** du textarea (remplace par rien — le badge fait foi)
6. L'utilisateur peut chainer : taper `@` a nouveau pour attacher un autre fichier
7. A l'envoi, les fichiers attaches sont charges via `getAttachedFileContexts()` — **zero changement backend**

### Cas particuliers

- **Noms avec espaces** : `@mon fichier.txt` → le filtre matche "mon fichier.txt", l'autocomplete gere les espaces dans les noms
- **Chemins profonds** : `@src/components/chat/` → navigation hierarchique, affiche le contenu du dossier
- **Dossier selectionne** : attache tous les fichiers du dossier (1 niveau, pas recursif) — meme comportement que si on attachait chaque fichier manuellement
- **Fichier deja attache** : grise dans la liste, non re-attachable
- **Max 10 fichiers** : coherent avec la limite existante dans InputZone
- **Fichiers ignores/sensibles** : respecter les memes filtres que WorkspaceService (isIgnored, isSensitive)

---

## Architecture technique

### Vue d'ensemble

```
InputZone.tsx
  ├── useFileMention(content, cursorPosition, hasWorkspace)
  │     ├── detecte "@" + extrait query
  │     ├── filtre l'arbre workspace (workspace.store.tree)
  │     └── retourne { isOpen, query, results, selectedIndex, position }
  │
  └── <FileMentionPopover>
        ├── Liste filtree (fichiers + dossiers)
        ├── Navigation clavier (ArrowUp/Down/Enter/Escape/Tab)
        └── Clic → attachFile() + cleanup texte
```

### Composants a creer/modifier

#### 1. Nouveau hook : `useFileMention.ts`

**Fichier** : `src/renderer/src/hooks/useFileMention.ts`

**Responsabilites** :
- Detecter le pattern `@` suivi de caracteres dans le textarea
- Extraire la query (texte apres le dernier `@` non-resolu)
- Filtrer l'arbre workspace (`FileNode`) — fuzzy ou prefix match
- Gerer l'etat du popover (ouvert/ferme, index selectionne)
- Exposer les handlers clavier (keydown interceptor)

**Logique de detection** :
```
1. A chaque changement de `content` ou `cursorPosition` :
   - Scanner en arriere depuis le curseur pour trouver le dernier `@`
   - Verifier qu'il n'est pas precede d'un caractere alphanum (eviter email@domain)
   - Extraire la query = texte entre `@` et le curseur
   - Si query vide → afficher racine du workspace
   - Si query contient `/` → naviguer dans l'arbre (ex: `src/comp` → chercher dans src/)
2. Si aucun workspace → ne rien faire (early return)
3. Si `@` detecte → ouvrir le popover, lancer le filtrage
```

**Filtrage de l'arbre** :
- Fonction recursive `filterTree(node: FileNode, query: string): FileNode[]`
- Si query contient `/` : split par `/`, descendre dans l'arbre niveau par niveau
- Match case-insensitive sur `node.name`
- Prefix match prioritaire, puis includes match
- Exclure les fichiers ignores (node_modules, .git, etc.) — reutiliser la logique existante
- Limiter a 20 resultats max (perf)
- Trier : dossiers d'abord, puis fichiers, alphabetique

**Interface retournee** :
```typescript
interface FileMentionState {
  isOpen: boolean
  query: string
  results: FileMentionResult[]
  selectedIndex: number
  mentionStart: number       // position du @ dans le texte
  popoverPosition: { top: number; left: number }  // position pixel
}

interface FileMentionResult {
  node: FileNode
  fullPath: string           // chemin relatif complet
  isAlreadyAttached: boolean
  depth: number              // pour indentation visuelle
}

interface FileMentionActions {
  selectItem: (index: number) => void
  handleKeyDown: (e: KeyboardEvent) => boolean  // true = event consomme
  close: () => void
}
```

#### 2. Nouveau composant : `FileMentionPopover.tsx`

**Fichier** : `src/renderer/src/components/chat/FileMentionPopover.tsx`

**Responsabilites** :
- Afficher la liste filtree dans un popover positionne au-dessus du curseur
- Icones fichier/dossier (meme icones que FileTree)
- Highlight du match dans le nom
- Item grise si deja attache
- Scroll into view sur navigation clavier
- Max-height avec overflow-y-auto (pas de Radix ScrollArea — meme gotcha que ConversationList)

**Style** :
- Popover flottant, ombre, border, bg-popover (palette existante)
- Max 8 items visibles, scroll si plus
- Largeur ~300px, adaptatif
- Animation fade-in subtile
- Breadcrumb en haut si navigation dans un sous-dossier (ex: `src/components/`)

**Positionnement** :
- Calculer la position pixel du `@` dans le textarea
- Utiliser un `<div>` miroir invisible (meme font, meme padding) pour mesurer la position X/Y du caractere `@`
- Positionner le popover au-dessus du curseur (flip en bas si pas de place)
- Pattern classique "textarea caret position" (cf. technique `getCaretCoordinates`)

#### 3. Modification : `InputZone.tsx`

**Changements** :
- Importer et utiliser `useFileMention`
- Passer `content`, position curseur, et `!!rootPath` au hook
- Intercepter `onKeyDown` du textarea pour deleguer au hook (fleches, Enter, Escape, Tab)
- Rendre `<FileMentionPopover>` conditionnel (si `isOpen`)
- Sur selection : appeler `attachFile(path)` + retirer le texte `@query` du textarea
- Tracker la position du curseur via `onSelect` du textarea (selectionStart)

**Attention** :
- Le `onKeyDown` du hook doit etre prioritaire sur les raccourcis existants (Enter pour envoyer)
- Si le popover est ouvert, Enter = selectionner, PAS envoyer le message
- Escape = fermer le popover, PAS fermer le panel workspace

#### 4. Modification : `workspace.store.ts`

**Changements mineurs** :
- Exposer une methode `getFilteredNodes(query: string): FileNode[]` pour centraliser le filtrage
- Ou : le hook fait le filtrage lui-meme a partir de `tree` (plus simple, pas de changement store)

**Decision** : le hook fait le filtrage — pas de changement au store.

---

### Fichiers impactes

| Fichier | Action | Detail |
|---------|--------|--------|
| `src/renderer/src/hooks/useFileMention.ts` | **Creer** | Hook detection @, filtrage, clavier |
| `src/renderer/src/components/chat/FileMentionPopover.tsx` | **Creer** | Popover autocomplete UI |
| `src/renderer/src/components/chat/InputZone.tsx` | **Modifier** | Integration hook + popover + keydown |
| `src/renderer/src/components/chat/input-caret.ts` | **Creer** | Utilitaire calcul position caret dans textarea |

### Fichiers NON impactes

| Fichier | Raison |
|---------|--------|
| `chat.ipc.ts` | Zero changement — les fileContexts sont deja geres |
| `workspace.ipc.ts` | Zero changement — readFile/getTree existent |
| `workspace.store.ts` | Zero changement — attachFile/detachFile existent |
| `workspace.service.ts` | Zero changement — filtres existants reutilises |
| `preload/index.ts` | Zero changement — aucune nouvelle methode IPC |
| `preload/types.ts` | Zero changement — types existants suffisants |
| `FileReference.tsx` | Zero changement — composant badge inchange |

---

## Securite

### Vecteurs analyses

| Vecteur | Risque | Mitigation |
|---------|--------|------------|
| Path traversal via `@../../etc/passwd` | Moyen | Le filtrage se fait sur l'arbre `FileNode` deja scanne par WorkspaceService (confine au workspace). Pas de saisie libre de chemin — uniquement selection dans l'arbre. |
| Injection contenu fichier sensible | Faible | Les fichiers sensibles (.env, .key, etc.) sont deja filtres par `isSensitive()` dans WorkspaceService. Les exclure aussi de l'autocomplete. |
| Fichiers binaires | Faible | L'arbre FileTree inclut les binaires mais `readFile` les rejette. Filtrer les extensions non-textuelles dans l'autocomplete. |
| DoS via arbre enorme | Faible | Limiter les resultats a 20 items. Le scan de l'arbre est deja fait (en memoire dans le store). Le filtrage est cote renderer, pas de nouvel IPC. |
| XSS via nom de fichier | Faible | React echappe automatiquement le contenu JSX. Pas de `dangerouslySetInnerHTML`. |

### Decisions securite

1. **Pas de saisie libre de chemin** : l'utilisateur selectionne UNIQUEMENT dans l'arbre workspace pre-scanne. Pas de champ texte libre qui serait envoye comme chemin.
2. **Filtrage des fichiers sensibles** : reutiliser `SENSITIVE_PATTERNS` de WorkspaceService pour exclure .env, .key, credentials, etc. de la liste autocomplete.
3. **Filtrage des fichiers ignores** : reutiliser la logique `isIgnored` (node_modules, .git, dist, etc.).
4. **Limite taille** : la limite existante (50KB/fichier, 200KB total fileContexts) s'applique au moment de l'envoi — pas de changement.
5. **Zero nouvel IPC** : tout le filtrage est cote renderer sur des donnees deja validees. Aucune nouvelle surface d'attaque IPC.

---

## Plan d'implementation

### Phase 1 — Utilitaire caret position (~30 min)

**Fichier** : `src/renderer/src/components/chat/input-caret.ts`

- Fonction `getCaretCoordinates(textarea, position)` → `{ top, left, height }`
- Technique : creer un `<div>` miroir invisible avec les memes styles que le textarea, inserer le texte jusqu'au curseur, mesurer la position du dernier caractere
- Pattern bien connu (cf. `textarea-caret-position` npm), implementation maison legere (~50 lignes)
- Gestion du scroll du textarea (offset scrollTop)

### Phase 2 — Hook useFileMention (~1h)

**Fichier** : `src/renderer/src/hooks/useFileMention.ts`

1. Detection du `@` :
   - `useEffect` sur `content` + `cursorPosition`
   - Scanner en arriere depuis le curseur
   - Regex : le `@` doit etre precede par un espace, debut de ligne, ou debut de texte (pas `a@b`)
   - Extraire `query` = texte entre `@` et curseur

2. Filtrage de l'arbre :
   - Fonction `flattenAndFilter(tree: FileNode, query: string): FileMentionResult[]`
   - Aplatir l'arbre recursivement, exclure ignores/sensibles
   - Si query contient `/` : descendre dans le chemin
   - Match case-insensitive
   - Tri : dossiers first, puis alphabetique
   - Limit 20

3. Gestion clavier :
   - `handleKeyDown(e)` : ArrowUp/Down (navigation), Enter/Tab (selection), Escape (fermer)
   - Retourne `true` si event consomme (InputZone ne doit pas le propager)

4. Position popover :
   - Appeler `getCaretCoordinates()` pour positionner

### Phase 3 — Composant FileMentionPopover (~1h)

**Fichier** : `src/renderer/src/components/chat/FileMentionPopover.tsx`

1. Layout :
   - `position: absolute` relatif au conteneur InputZone
   - `z-50` pour etre au-dessus de tout
   - Border, shadow, rounded, bg-popover
   - Max-height 320px, overflow-y-auto
   - Largeur 320px

2. Contenu :
   - Header breadcrumb si sous-dossier (ex: `src / components /`)
   - Liste items avec :
     - Icone Folder/File (lucide)
     - Nom du fichier/dossier
     - Chemin relatif grise en petits caracteres
     - Highlight de la partie matchee (bold)
     - Grise + disabled si deja attache
   - Item selectionne : `bg-accent` (meme pattern que CommandPalette)

3. Interactions :
   - Clic → selection
   - Hover → highlight visuel (mais pas de changement d'index — uniquement clavier)
   - Ref pour scroll-into-view sur changement d'index

### Phase 4 — Integration InputZone (~45 min)

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx`

1. Importer `useFileMention` et `FileMentionPopover`
2. Tracker `cursorPosition` via `onSelect` du textarea :
   ```typescript
   const [cursorPos, setCursorPos] = useState(0)
   // onSelect={() => setCursorPos(textareaRef.current?.selectionStart ?? 0)}
   ```
3. Appeler le hook :
   ```typescript
   const mention = useFileMention({
     content,
     cursorPosition: cursorPos,
     hasWorkspace: !!rootPath,
     tree: workspaceTree,
     attachedFiles: workspaceAttachedFiles,
   })
   ```
4. Modifier `onKeyDown` du textarea :
   ```typescript
   const handleKeyDown = (e: KeyboardEvent) => {
     if (mention.isOpen && mention.handleKeyDown(e)) return
     // ... logique existante (Enter pour envoyer, etc.)
   }
   ```
5. Sur selection d'un item :
   - Appeler `attachFile(result.fullPath)` (ou pour un dossier, attacher les fichiers enfants)
   - Retirer le texte `@query` du textarea :
     ```typescript
     const before = content.slice(0, mention.mentionStart)
     const after = content.slice(cursorPos)
     setContent(before + after)
     ```
6. Rendre le popover :
   ```tsx
   {mention.isOpen && (
     <FileMentionPopover
       results={mention.results}
       selectedIndex={mention.selectedIndex}
       position={mention.popoverPosition}
       onSelect={mention.selectItem}
       onClose={mention.close}
     />
   )}
   ```

### Phase 5 — Polish & edge cases (~30 min)

1. **Dossier selection** : quand un dossier est selectionne, 2 options :
   - Option A : "entrer" dans le dossier (mettre a jour la query pour naviguer dedans)
   - Option B : attacher tous les fichiers du dossier (1 niveau)
   - **Decision** : Option A par defaut (Enter sur un dossier = naviguer dedans). Un bouton/icone secondaire pour "attacher tout".

2. **Fermeture auto** : fermer le popover si :
   - L'utilisateur efface le `@` (backspace)
   - L'utilisateur clique en dehors
   - Le textarea perd le focus
   - Le workspace est ferme

3. **Raccourci** : pas de raccourci supplementaire — `@` suffit

4. **Empty state** : si aucun resultat, afficher "Aucun fichier trouve" dans le popover

5. **Perf** : `useMemo` sur le filtrage si l'arbre est gros (>1000 fichiers)

---

## Estimation

| Phase | Temps estime |
|-------|-------------|
| Phase 1 — Caret position | ~30 min |
| Phase 2 — Hook useFileMention | ~1h |
| Phase 3 — Composant popover | ~1h |
| Phase 4 — Integration InputZone | ~45 min |
| Phase 5 — Polish & edge cases | ~30 min |
| **Total** | **~3h45** |

---

## Alternatives envisagees

### A. Popover inline dans le texte (comme Slack/GitHub)
- Le `@fichier.txt` resterait visible dans le textarea comme un "chip" inline
- **Rejete** : les textarea HTML ne supportent pas les elements inline. Il faudrait un `contentEditable` div, ce qui casserait toute la logique existante de InputZone.

### B. Slash command `/file`
- Taper `/file nom` pour attacher
- **Rejete** : moins intuitif que `@`, pas le pattern standard (Cursor, VSCode, etc.)

### C. Nouvel IPC pour recherche serveur-side
- Le filtrage serait fait dans le main process
- **Rejete** : l'arbre est deja en memoire dans le store Zustand. Ajouter un IPC serait une sur-architecture pour zero benefice.

---

## Questions ouvertes (a valider)

1. **Dossier** : Enter sur un dossier = naviguer dedans ou attacher ses fichiers ?
   → Proposition : naviguer dedans (plus intuitif). Attacher = icone secondaire ou dernier niveau.
Romain réponse : naviguer dedans

2. **Fichiers sensibles** : les afficher grises dans l'autocomplete ou les masquer completement ?
   → Proposition : les masquer completement (comme FileTree qui les ignore).
Romain réponse : Proposition OK

3. **Limite fichiers** : garder la limite de 10 fichiers attaches max ?
   → Proposition : oui, coherent avec l'existant.
Romain réponse : Proposition OK

4. **@ dans du code** : si l'utilisateur tape du code avec des `@` (decorateurs Python, annotations Java), le popover va s'ouvrir. Faut-il detecter le contexte (code block) ?
   → Proposition : le popover s'ouvre mais se ferme des que le texte ne matche rien dans l'arbre. L'utilisateur peut aussi presser Escape. C'est le meme comportement que GitHub Issues.
Romain réponse : Proposition OK
