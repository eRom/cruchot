# Spec : Refonte de l'affichage des Tool Uses dans le Chat

> Date : 2026-04-01
> Statut : Validé

## Contexte

L'affichage actuel des tool uses dans le chat est une liste plate dans un accordion unique. Avec 50 tools, c'est illisible et n'offre aucun détail sur ce qui s'est passé (seulement nom + statut). La référence Open Code (voir `specs/migration-chat-display/reference-open-code-tools-display.md`) montre des patterns de groupement et de rendu délégué qui résolvent ce problème.

## Décisions de design

| Question | Décision |
|----------|----------|
| Approche globale | **Hybride** : groupement intelligent des tools consécutifs identiques + détail inline pour les singletons |
| Contenu expandé | **Résumé par défaut, résultat complet en option** (3 niveaux d'expand) |
| Comportement streaming | **Mixte** : tool actif toujours visible en singleton, passé se compacte progressivement |
| Rendu du détail V1 | **Résumé + résultat brut monospace** expandable |
| Rendu du détail V2 | Rendu adapté par type de tool (diff, tree, matches...) — hors scope V1 |

## 1. Modèle de données

### 1.1 ToolCallDisplay enrichi

```typescript
interface ToolCallDisplay {
  toolName: string
  args?: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  error?: string
  // ── Nouveau ──
  result?: string          // résultat brut (tronqué à ~10KB)
  resultMeta?: {           // résumé structuré
    duration?: number      // ms
    exitCode?: number      // bash
    lineCount?: number     // readFile
    byteSize?: number      // readFile
    matchCount?: number    // GrepTool
    fileCount?: number     // listFiles, GlobTool
  }
}
```

### 1.2 Capture des résultats

- Dans `chat.ipc.ts`, le chunk `tool-result` contient le résultat. On le stocke (tronqué à 10KB) au lieu de le jeter.
- Une fonction `extractToolMeta(toolName, result)` côté main extrait le `resultMeta` structuré avant l'envoi IPC.
- Persistance dans `contentData.toolCalls` en DB (déjà JSON). Pas de migration — les anciens messages n'ont pas de `result`/`resultMeta`.

### 1.3 Store actions

- `addToolCall(msgId, toolCall)` — inchangé
- `updateLastToolCallStatus(msgId, status)` — inchangé
- `updateLastToolCallResult(msgId, result, resultMeta)` — **nouveau**, appelé sur chunk `tool-result`

## 2. Logique de groupement

### 2.1 Fonction pure `groupToolCalls()`

Groupement côté renderer uniquement, dans un `useMemo`. Règle : les tool calls **consécutifs de même `toolName`** sont regroupés.

```
bash, bash, bash, readFile, bash, bash → [bash×3], [readFile×1], [bash×2]
```

### 2.2 Structures de sortie

```typescript
type ToolCallGroup = {
  type: 'group'
  toolName: string
  items: ToolCallDisplay[]  // 2+ items
}

type ToolCallSingleton = {
  type: 'singleton'
  item: ToolCallDisplay
}

type GroupedToolCall = ToolCallGroup | ToolCallSingleton
```

### 2.3 Seuil

Un groupe de 1 seul item est un singleton (pas affiché comme groupe). Seuil de groupement : >= 2 items consécutifs de même type.

## 3. Composants React

### 3.1 Arbre de composants

```
ToolCallBlock (refactorisé)
├── header button (inchangé : compteur + statut global)
└── ToolCallList (nouveau)
    ├── ToolCallGroupRow (groupe × N)
    │   ├── ligne résumée : icône + label + "× N" + chevron
    │   ├── aperçu condensé (3 premières commandes/paths en gris)
    │   └── [expanded] → liste des items avec résumé chacun
    │       └── [expanded item] → résultat brut dans bloc code
    ├── ToolCallSingletonRow (item isolé)
    │   ├── ligne : icône + label + détail (commande/path/query)
    │   ├── résumé meta inline (durée, exit code, taille...)
    │   └── [expanded] → résultat brut dans bloc code
    └── ToolCallRunningRow (tool en cours)
        ├── spinner + label + détail
        └── pas expandable
```

### 3.2 Localisation

Tout reste dans `MessageItem.tsx`. Le `ToolCallBlock` actuel fait ~70 lignes, le nouveau fera ~200 lignes.

### 3.3 Niveaux d'expand

3 niveaux indépendants, chacun un `useState` local :

1. **Bloc global** : header → liste groupée (comme aujourd'hui)
2. **Groupe** : ligne résumée → items du groupe
3. **Item** : résumé → résultat brut monospace

### 3.4 Résultat brut

- Affiché dans un `<pre>` monospace avec `max-height: 160px` et `overflow-y: auto`
- Bouton "voir" / "masquer" pour toggle
- Tronqué à 10KB côté données, indicateur "[tronqué]" si applicable

## 4. Comportement streaming

### 4.1 Flux

1. `tool-call` chunk arrive → `addToolCall()` avec status `running`
2. Tool en cours = toujours affiché comme `ToolCallRunningRow` (singleton, spinner)
3. `tool-result` chunk arrive → `updateLastToolCallResult()` + `updateLastToolCallStatus()`
4. `groupToolCalls()` recalculé → le tool terminé est absorbé dans un groupe adjacent si même type, sinon reste singleton

### 4.2 Séquence visuelle

```
t0: bash "npm install" arrive    → [singleton: bash "npm install" 🔄]
t1: bash termine                 → [singleton: bash "npm install" ✓ — 2.3s]
t2: bash "mkdir" arrive          → [groupe: bash ×1 ✓], [running: bash "mkdir" 🔄]
t3: bash "mkdir" termine         → [groupe: bash ×2 ✓]
t4: readFile arrive              → [groupe: bash ×2 ✓], [running: readFile 🔄]
t5: readFile termine             → [groupe: bash ×2 ✓], [singleton: readFile ✓]
```

### 4.3 Auto-collapse

Comportement existant conservé : le bloc s'ouvre pendant le streaming, se ferme quand tous les tools terminent.

## 5. Styles

- Palette actuelle conservée : cyan pour le header/container, emerald pour succès, red pour erreur
- Groupes : background `bg-card` ou équivalent dark, `rounded-lg`, légèrement distinct des singletons
- Badge compteur : `text-muted-foreground`, background subtle, `rounded-full`
- Aperçu condensé dans les groupes : `text-muted-foreground` taille réduite, `truncate`
- Résultat brut : `font-mono`, `bg-background`, `border`, `rounded-md`, `max-h-40 overflow-y-auto`
- Lien "voir" / "masquer" : `text-primary` taille réduite

## 6. Scope

### V1 (cette session)

- `ToolCallDisplay` enrichi (`result`, `resultMeta`)
- Capture résultats dans `chat.ipc.ts` + `extractToolMeta()`
- Store action `updateLastToolCallResult()`
- Chunk IPC enrichi avec result + resultMeta
- `groupToolCalls()` fonction pure
- Refacto `ToolCallBlock` → sous-composants inline
- 3 niveaux d'expand
- Comportement streaming (running = singleton visible)

### V2 (future)

- Rendu adapté par type : diff coloré (FileEdit), tree (listFiles), matches highlight (GrepTool), preview (readFile)
- Pattern de délégation : chaque tool définit `renderResult()` et `renderSummary()`
