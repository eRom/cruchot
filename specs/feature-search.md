# Feature — Mode Search (Perplexity Search Tool)

> Date : 2026-03-12
> Ref : [AI SDK Tools Registry — Perplexity Search](https://ai-sdk.dev/tools-registry/perplexity-search)

## Objectif

Ajouter un mode "Search" activable/désactivable dans l'InputZone qui injecte l'outil Perplexity Search dans le `streamText()`. Quand activé, le LLM (n'importe quel provider) peut décider d'effectuer des recherches web via l'API Perplexity pour enrichir ses réponses avec des sources.

**Point clé** : ce n'est PAS un changement de provider/modèle. C'est un **outil supplémentaire** (comme les workspace tools ou MCP tools) disponible pour le modèle actif. Le LLM utilise le modèle choisi par l'utilisateur et a accès à l'outil de recherche Perplexity en plus.

---

## Architecture

### Package

- **`@perplexity-ai/ai-sdk`** — fournit la fonction `perplexitySearch()` qui retourne un outil AI SDK standard
- Installation : `npm install @perplexity-ai/ai-sdk`
- Ce package est un **outil AI SDK** (pas un provider) — il s'injecte dans `tools: { search: perplexitySearch() }`

### Flux

```
InputZone [toggle Search ON]
  → sendMessage({ ..., searchEnabled: true })
  → chat.ipc.ts: handleChatMessage()
    → si searchEnabled:
        1. Récupérer la clé API Perplexity via getApiKeyForProvider('perplexity')
        2. Créer l'outil : perplexitySearch({ apiKey })
        3. Merger dans tools : { ...workspaceTools, ...mcpTools, search: perplexitySearch({ apiKey }) }
    → streamText({ model, tools, ... })
      → le LLM décide quand chercher (tool call "search")
      → résultats de recherche retournés dans tool-result
      → le LLM synthétise et répond avec les infos trouvées
      → sources extraites des metadata et affichées via PerplexitySources
```

### Clé API

La clé Perplexity existe déjà dans le système (provider `perplexity` dans `providers.ts`). Même clé réutilisée — `getApiKeyForProvider('perplexity')` dans `providers.ipc.ts`.

**Condition** : le toggle Search n'est disponible que si la clé API Perplexity est configurée. Sinon, le toggle est masqué (même pattern que `supportsThinking`).

---

## Plan d'implémentation

### Phase 1 — Installation & Intégration backend

#### 1.1 — Installer le package

```bash
npm install @perplexity-ai/ai-sdk
```

**Attention** : vérifier si le package est ESM-only. Si oui :
- Ajouter dans `external` de `electron.vite.config.ts` (même pattern que `@ai-sdk/mcp`)
- Dynamic import dans `chat.ipc.ts` : `const { perplexitySearch } = await import('@perplexity-ai/ai-sdk')`
- Ajouter dans `files` de `electron-builder.yml` pour le packaging

Si le package est CJS-compatible, import statique possible.

#### 1.2 — Modifier `SendMessagePayload`

**Fichier** : `src/preload/types.ts`

Ajouter le champ optionnel :

```typescript
export interface SendMessagePayload {
  // ... existant
  searchEnabled?: boolean
}
```

#### 1.3 — Modifier le schema Zod

**Fichier** : `src/main/ipc/chat.ipc.ts`

Ajouter dans `sendMessageSchema` :

```typescript
searchEnabled: z.boolean().optional()
```

#### 1.4 — Injecter l'outil search dans `handleChatMessage()`

**Fichier** : `src/main/ipc/chat.ipc.ts`

Après le merge `{ ...workspaceTools, ...mcpTools }` (ligne ~293), ajouter :

```typescript
// Inject Perplexity Search tool if search mode is enabled
if (searchEnabled) {
  const perplexityApiKey = getApiKeyForProvider('perplexity')
  if (perplexityApiKey) {
    const { perplexitySearch } = await import('@perplexity-ai/ai-sdk')
    tools = { ...tools, search: perplexitySearch({ apiKey: perplexityApiKey }) }
  }
}
```

**Impacts** :
- `hasTools` sera `true` automatiquement → `maxSteps: 50` et `stopWhen: stepCountIs(50)` s'activent
- Le LLM voit l'outil `search` dans sa liste d'outils et peut l'invoquer
- Les tool-call/tool-result chunks transitent normalement via le streaming existant
- Le tool approval gate Remote (Telegram/WebSocket) enveloppe aussi l'outil search

#### 1.5 — Ajouter le preload

**Fichier** : `src/preload/index.ts`

Pas de nouvelle méthode nécessaire — `sendMessage()` passe déjà le payload complet. Juste ajouter le champ `searchEnabled` dans l'appel côté renderer.

### Phase 2 — UI Toggle dans InputZone

#### 2.1 — Créer le composant `SearchToggle`

**Fichier** : `src/renderer/src/components/chat/SearchToggle.tsx`

Pattern visuel : **bouton toggle** (pas un Select comme ThinkingSelector — c'est un booléen on/off).

```
┌──────────────────────────────────────┐
│  [🔍 Search]   ← toggle actif       │
│  [🔍]          ← toggle inactif     │
└──────────────────────────────────────┘
```

Comportement :
- **Actif** : fond `bg-primary/10`, texte `text-primary`, icône `Search` (lucide-react)
- **Inactif** : fond transparent, texte `text-muted-foreground/60`
- Click : toggle le booléen dans le store settings
- **Masqué si** : pas de clé API Perplexity configurée OU mode image actif
- **Disabled si** : `isBusy` (stream en cours)

#### 2.2 — Store settings

**Fichier** : `src/renderer/src/stores/settings.store.ts`

Ajouter :

```typescript
searchEnabled: boolean           // default: false
setSearchEnabled: (value: boolean) => void
```

Persisté dans localStorage via Zustand `persist` (pattern existant).

**Gotcha** : Zustand persist → au 1er chargement après ajout, la valeur est `undefined`. Utiliser `?? false` dans le composant.

#### 2.3 — Intégrer dans InputZone

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx`

Placement dans la toolbar (entre ThinkingSelector et RoleSelector) :

```tsx
{hasPerplexityKey && !isImageMode && (
  <SearchToggle disabled={isBusy} />
)}
```

Pour `hasPerplexityKey` : ajouter une méthode IPC `providers:hasApiKey(providerId)` ou réutiliser la donnée déjà disponible dans `providers.store.ts`.

**Option simplifiée** : lire `providers` depuis le store et vérifier si perplexity a une clé configurée (l'info est déjà dans `configuredProviderIds[]` ou similaire).

#### 2.4 — Passer `searchEnabled` dans le payload

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx`

Dans `handleSend()`, ajouter au payload :

```typescript
await window.api.sendMessage({
  // ... existant
  searchEnabled: searchEnabled || undefined  // n'envoyer que si true
})
```

### Phase 3 — Affichage des résultats

#### 3.1 — Tool Call UI pour Search

Le ToolCallBlock existant affiche déjà les tool calls. Il faut :

**Fichier** : `src/renderer/src/hooks/useStreaming.ts`

- Ajouter `'search'` dans `TOOL_LABELS` : `{ search: 'Recherche web' }`
- Ajouter dans `TOOL_CONFIG` : `{ search: { icon: 'Search', color: 'text-violet-500' } }`
- Aucun changement dans le parser `getToolLabel()` car `search` n'a pas de préfixe MCP

**Fichier** : `src/renderer/src/components/chat/MessageItem.tsx`

- Importer l'icône `Search` de lucide-react et l'ajouter dans le mapping d'icônes du ToolCallBlock

#### 3.2 — Sources Perplexity dans les réponses

Le composant `PerplexitySources.tsx` existe déjà mais n'est pas utilisé. Il faut le brancher.

**Problème** : les sources Perplexity Search arrivent dans le `tool-result` (pas dans les metadata du message). Le résultat de l'outil contient les URLs, titres et snippets des résultats de recherche.

**Approche** :
1. Dans `onChunk` quand `chunk.type === 'tool-result'` et `toolName === 'search'` → extraire les sources du résultat
2. Forward les sources au renderer via un chunk custom `{ type: 'search-sources', sources: [...] }`
3. Dans `useStreaming`, accumuler les sources et les exposer dans le store messages
4. Dans `MessageItem`, afficher `<PerplexitySources>` si des sources sont présentes

**Alternative plus simple** : stocker les sources dans `contentData` du message assistant en DB, et les afficher dans MessageItem via `contentData.searchSources`.

#### 3.3 — Persistance des sources

**Fichier** : `src/main/ipc/chat.ipc.ts`

Quand le stream se termine (après `await result.text`), si des sources de recherche ont été accumulées :

```typescript
const contentData = {
  ...(accumulatedToolCalls.length > 0 ? { toolCalls: accumulatedToolCalls } : {}),
  ...(searchSources.length > 0 ? { searchSources } : {})
}
```

Les sources sont sauvées en DB dans `contentData` et rechargées au switch de conversation.

### Phase 4 — System prompt enrichi

#### 4.1 — Instruction search

Quand le mode search est activé, injecter un court prompt système pour guider le LLM :

```
Vous disposez d'un outil de recherche web. Utilisez-le pour trouver des informations récentes
ou factuelles quand la question le nécessite. Citez vos sources dans la réponse.
```

Ce prompt est ajouté au system prompt existant dans `handleChatMessage()` (même pattern que le workspace context prompt).

---

## Fichiers à modifier

### Nouveaux fichiers (2)

| Fichier | Rôle |
|---------|------|
| `src/renderer/src/components/chat/SearchToggle.tsx` | Composant toggle Search dans InputZone |
| — | — |

### Fichiers modifiés (~10)

| Fichier | Modifications |
|---------|--------------|
| `package.json` | Ajouter `@perplexity-ai/ai-sdk` |
| `electron.vite.config.ts` | Potentiellement ajouter dans `external` (si ESM) |
| `electron-builder.yml` | Potentiellement ajouter dans `files` node_modules |
| `src/preload/types.ts` | Ajouter `searchEnabled?: boolean` dans `SendMessagePayload` |
| `src/preload/index.ts` | Rien à changer (payload passé tel quel) |
| `src/main/ipc/chat.ipc.ts` | Zod schema + injection outil search + extraction sources + prompt système |
| `src/renderer/src/stores/settings.store.ts` | Ajouter `searchEnabled` + `setSearchEnabled` |
| `src/renderer/src/components/chat/InputZone.tsx` | Intégrer `SearchToggle`, passer `searchEnabled` dans payload |
| `src/renderer/src/hooks/useStreaming.ts` | Ajouter label + config pour l'outil `search` |
| `src/renderer/src/components/chat/MessageItem.tsx` | Brancher `PerplexitySources` + icône Search dans ToolCallBlock |

---

## Points de vigilance

### Package `@perplexity-ai/ai-sdk`

- **ESM vs CJS** : à vérifier. Si ESM-only → dynamic import + externals (pattern éprouvé avec `@ai-sdk/mcp` et `chokidar`)
- **Dépendances transitives** : vérifier si le package tire des deps lourdes

### Clé API

- La clé Perplexity est déjà gérée par le système existant (provider `perplexity` dans `providers.ts`)
- Pas de nouveau champ safeStorage à créer
- Le toggle UI est masqué si la clé n'est pas configurée → pas d'erreur possible

### Coût

- Perplexity Search = **facturation par requête** (pas par token) — le coût n'est PAS traçable via `result.usage`
- Option : ne pas tracker le coût de l'outil search séparément (c'est un coût fixe par appel, pas proportionnel aux tokens)
- Alternative : ajouter un compteur d'appels search dans les statistiques (future amélioration)

### Tool approval (Remote)

- L'outil search sera automatiquement enveloppé par `wrapToolsWithApproval()` quand Remote est connecté
- Catégorie à définir : probablement `autoApproveMcp` (outil externe) ou nouveau toggle `autoApproveSearch`
- **Recommandation** : utiliser `autoApproveMcp` pour éviter un 6ème toggle — l'outil search est conceptuellement similaire aux outils MCP (appel API externe)

### Compatibilité multi-provider

- L'outil search fonctionne avec **n'importe quel provider** (OpenAI, Anthropic, Google, etc.) car c'est un outil AI SDK standard
- Le LLM reçoit la définition de l'outil et décide quand l'appeler
- Les providers qui ne supportent pas les tools (ex: certains modèles Perplexity Sonar eux-mêmes) ne pourront pas utiliser le mode search → le toggle devrait être masqué pour les modèles `type: 'image'` et potentiellement pour les modèles sans support tools

### Streaming & affichage

- Le tool call `search` sera visible dans le ToolCallBlock (icône Search, couleur violet)
- Le résultat du tool call contient les sources → les extraire pour `PerplexitySources`
- Le LLM continue de répondre après le tool result → l'UX est naturelle (le LLM cherche, puis répond)

---

## Questions ouvertes

1. **Placement exact du toggle** : entre ModelSelector et ThinkingSelector ? Ou après RoleSelector ? (recommandation : juste avant ThinkingSelector, car c'est un mode de fonctionnement comme thinking)

2. **Persistance du toggle par conversation** : le search mode devrait-il être persisté par conversation (comme le rôle) ou rester global (comme thinkingEffort) ? Recommandation : global dans settings, comme thinkingEffort.

3. **Nombre de résultats** : faut-il exposer `max_results` dans l'UI ou garder le défaut (10) ? Recommandation : garder le défaut pour la v1, ajouter les options avancées plus tard.

4. **Search prompt** : le prompt système injecté quand search est actif devrait-il être configurable (comme le summary prompt) ? Recommandation : non pour la v1, prompt fixe.

---

## Estimation de complexité

- **Phase 1** (backend) : ~2h — installation, types, injection outil, Zod
- **Phase 2** (UI toggle) : ~1h — composant simple, store, intégration InputZone
- **Phase 3** (affichage résultats) : ~2h — extraction sources, persistance, branchement PerplexitySources
- **Phase 4** (system prompt) : ~30min — injection conditionnelle

**Total estimé** : ~5-6h de développement

---

## Résumé

Le mode Search est architecturalement **simple** car il s'insère dans le pipeline de tools existant :
- Un booléen dans le payload → un outil injecté dans `tools` → le LLM décide quand chercher
- L'UI existante (ToolCallBlock, PerplexitySources) est déjà prête ou quasi-prête
- La clé API est déjà gérée par le système existant
- Pas de nouvelle table DB, pas de nouveau service, pas de nouveau IPC handler
