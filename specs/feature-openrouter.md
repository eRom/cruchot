# Feature : OpenRouter — Provider multi-modèles

> Date : 2026-03-14
> Auteur : Claude
> Statut : En attente d'approbation

## Résumé

Intégrer OpenRouter comme provider cloud avec gestion dynamique des modèles (CRUD utilisateur).
Contrairement aux autres providers (modèles statiques dans `registry.ts`), OpenRouter n'a aucun modèle prédéfini — l'utilisateur ajoute/modifie/supprime ses modèles manuellement.

## Spécifications fonctionnelles

### Provider OpenRouter
- **Type** : `cloud` (requiert une clé API)
- **ID** : `openrouter`
- **Icône** : SVG OpenRouter (logo officiel) dans `ProviderIcon.tsx`
- **URL clé API** : `https://openrouter.ai/settings/keys`
- **Modèles** : aucun par défaut — CRUD utilisateur

### Gestion des modèles (CRUD)

L'utilisateur configure ses modèles OpenRouter dans Settings > Providers > OpenRouter.

**Champs par modèle :**

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `label` | string | oui | Nom d'affichage (ex: "Claude Sonnet via OR") |
| `modelId` | string | oui | ID OpenRouter (ex: `anthropic/claude-sonnet-4`) |
| `type` | enum | oui | `text` ou `image` |

**Actions :**
- **Créer** : formulaire inline (label + modelId + type)
- **Modifier** : édition inline du label, modelId, type
- **Supprimer** : suppression avec confirmation
- **Lister** : affichage de tous les modèles configurés

> **Pas de prix** : les modèles OpenRouter ne trackeront pas les coûts (prix à 0). L'utilisateur consulte ses coûts sur le dashboard OpenRouter.

### Comportement dans le ModelSelector

- Tous les modèles OpenRouter utilisent l'icône OpenRouter (pas l'icône du provider sous-jacent)
- Les modèles apparaissent dans la liste plate comme les autres, regroupés sous leur provider "OpenRouter"
- Un modèle OpenRouter est sélectionnable uniquement si la clé API est configurée

## Plan d'implémentation

### Étape 1 — Dépendance npm

```bash
npm install @openrouter/ai-sdk-provider
```

> Package communautaire officiel OpenRouter (`@openrouter/ai-sdk-provider`).
> **Pas** `@ai-sdk/openrouter` — ce dernier n'existe pas officiellement.

### Étape 2 — Table SQLite pour les modèles custom

**Fichier** : `src/main/db/schema.ts`

Ajouter une table `custom_models` pour stocker les modèles ajoutés par l'utilisateur :

```typescript
export const customModels = sqliteTable('custom_models', {
  id: text('id').primaryKey(),                    // UUID généré
  providerId: text('provider_id').notNull(),       // 'openrouter' (extensible à d'autres providers custom)
  label: text('label').notNull(),                  // Nom d'affichage
  modelId: text('model_id').notNull(),             // ID API (ex: 'anthropic/claude-sonnet-4')
  type: text('type', { enum: ['text', 'image'] }).notNull().default('text'),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
```

Puis générer la migration :
```bash
npm run db:generate
npm run db:migrate
```

### Étape 3 — Provider dans le registre

**Fichier** : `src/main/llm/registry.ts`

Ajouter OpenRouter au tableau `PROVIDERS` (entre `perplexity` et `ollama`) :

```typescript
{
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'cloud',
  description: 'Passerelle multi-modèles — ajoutez vos modèles',
  requiresApiKey: true,
  icon: 'openrouter'  // identifiant pour ProviderIcon
}
```

**Aucun modèle dans `MODELS[]`** — les modèles viennent de la table `custom_models`.

### Étape 4 — Factory provider AI SDK

**Fichier** : `src/main/llm/providers.ts`

Ajouter la factory :

```typescript
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export function getOpenRouterProvider() {
  const apiKey = getApiKeyForProvider('openrouter')
  if (!apiKey) throw new Error('OpenRouter API key not configured')
  return createOpenRouter({ apiKey })
}
```

### Étape 5 — Routeur

**Fichier** : `src/main/llm/router.ts`

Ajouter le case dans le switch :

```typescript
case 'openrouter':
  return getOpenRouterProvider()(modelId)
```

### Étape 6 — IPC handlers pour le CRUD custom_models

**Fichier** : `src/main/ipc/custom-models.ipc.ts` (nouveau fichier)

Handlers IPC :

| Canal | Méthode | Description |
|-------|---------|-------------|
| `custom-models:list` | `invoke` | Liste les modèles custom (filtrable par providerId) |
| `custom-models:create` | `invoke` | Crée un modèle custom |
| `custom-models:update` | `invoke` | Met à jour un modèle custom |
| `custom-models:delete` | `invoke` | Supprime un modèle custom |

**Validation Zod** sur chaque handler :
- `label` : string, min 1, max 100
- `modelId` : string, min 1, max 200, format `provider/model-name`
- `type` : enum `['text', 'image']`

**Enregistrer les handlers** dans `src/main/index.ts` (import du fichier IPC).

### Étape 7 — Intégration avec getModels existant

**Fichier** : `src/main/ipc/providers.ipc.ts`

Modifier le handler `providers:getModels` pour fusionner les modèles statiques (`MODELS[]`) avec les modèles custom de la table `custom_models` :

```typescript
// Dans le handler 'models:list'
const staticModels = getModelsForProvider(providerId)
const customModels = db.select().from(customModelsTable)
  .where(eq(customModelsTable.providerId, providerId))
  .all()

// Mapper les custom models au format ModelInfo
const mapped = customModels.map(cm => ({
  id: cm.modelId,          // Utiliser modelId comme id pour le routeur
  providerId: cm.providerId,
  name: cm.modelId,
  displayName: cm.label,
  type: cm.type,
  contextWindow: 0,        // Inconnu pour OpenRouter
  inputPrice: 0,
  outputPrice: 0,
  supportsImages: false,
  supportsStreaming: true,
  supportsThinking: false
}))

return [...staticModels, ...mapped]
```

### Étape 8 — Bridge IPC (preload)

**Fichier** : `src/preload/index.ts`

Ajouter dans `contextBridge.exposeInMainWorld('api', { ... })` :

```typescript
// Custom Models (OpenRouter)
getCustomModels: (providerId?: string) => ipcRenderer.invoke('custom-models:list', providerId),
createCustomModel: (data) => ipcRenderer.invoke('custom-models:create', data),
updateCustomModel: (id, data) => ipcRenderer.invoke('custom-models:update', id, data),
deleteCustomModel: (id) => ipcRenderer.invoke('custom-models:delete', id),
```

**Fichier** : `src/preload/types.ts`

Ajouter les types dans `ElectronAPI` :

```typescript
// Custom Models
getCustomModels: (providerId?: string) => Promise<CustomModelInfo[]>
createCustomModel: (data: { providerId: string; label: string; modelId: string; type: 'text' | 'image' }) => Promise<CustomModelInfo>
updateCustomModel: (id: string, data: { label?: string; modelId?: string; type?: 'text' | 'image' }) => Promise<CustomModelInfo | undefined>
deleteCustomModel: (id: string) => Promise<void>
```

Et le type :

```typescript
export interface CustomModelInfo {
  id: string
  providerId: string
  label: string
  modelId: string
  type: 'text' | 'image'
  isEnabled: boolean
  createdAt: Date
  updatedAt: Date
}
```

### Étape 9 — UI Settings > Providers > OpenRouter

**Fichier** : `src/renderer/src/components/settings/ProvidersSection.tsx`

OpenRouter est un provider cloud avec `requiresApiKey: true`, donc il apparaît automatiquement dans la liste `CloudProviders` avec le composant `ApiKeyRow` existant.

**Modifications supplémentaires :**

1. **Ajouter l'URL** dans `API_KEY_URLS` :
   ```typescript
   openrouter: 'https://openrouter.ai/settings/keys'
   ```

2. **Section modèles custom** : Après la row API key d'OpenRouter, afficher une section CRUD pour les modèles. Créer un composant `OpenRouterModelsManager` qui s'affiche **sous** l'`ApiKeyRow` d'OpenRouter quand la clé est configurée.

   **Composant `OpenRouterModelsManager`** :
   - Liste des modèles configurés (label + modelId + type + boutons edit/delete)
   - Bouton "Ajouter un modèle" qui ouvre un formulaire inline
   - Formulaire : 3 champs (label, modelId, type select)
   - Actions : sauvegarder, annuler, supprimer (avec toast de confirmation)

3. **Modifier `CloudProviders`** pour détecter le provider `openrouter` et rendre le composant `OpenRouterModelsManager` sous sa row.

### Étape 10 — Icône OpenRouter

**Fichier** : `src/renderer/src/components/chat/ProviderIcon.tsx`

Ajouter le case `'openrouter'` dans le switch avec le SVG du logo officiel OpenRouter.

### Étape 11 — CSP

**Fichier** : `src/main/index.ts` (ou config CSP)

Ajouter `https://openrouter.ai` dans la directive `connect-src` de la CSP :

```
connect-src 'self' https://*.openai.com https://*.anthropic.com https://*.googleapis.com https://*.x.ai https://*.mistral.ai https://*.perplexity.ai https://openrouter.ai
```

> Déjà présent dans la CSP documentée dans CLAUDE.md — vérifier que c'est bien implémenté dans le code.

## Fichiers impactés (résumé)

| Fichier | Action |
|---------|--------|
| `package.json` | Ajouter `@openrouter/ai-sdk-provider` |
| `src/main/db/schema.ts` | Ajouter table `custom_models` |
| `src/main/llm/registry.ts` | Ajouter provider OpenRouter dans `PROVIDERS[]` |
| `src/main/llm/providers.ts` | Ajouter `getOpenRouterProvider()` |
| `src/main/llm/router.ts` | Ajouter case `'openrouter'` |
| `src/main/ipc/custom-models.ipc.ts` | **Nouveau** — CRUD handlers |
| `src/main/ipc/providers.ipc.ts` | Fusionner modèles custom dans `getModels` |
| `src/main/index.ts` | Importer `custom-models.ipc.ts` + vérifier CSP |
| `src/preload/index.ts` | Ajouter 4 méthodes custom models |
| `src/preload/types.ts` | Ajouter `CustomModelInfo` + méthodes dans `ElectronAPI` |
| `src/renderer/src/components/settings/ProvidersSection.tsx` | URL + `OpenRouterModelsManager` |
| `src/renderer/src/components/chat/ProviderIcon.tsx` | Ajouter SVG OpenRouter |

## Hors scope

- **Pas de fetch automatique** de la liste des modèles OpenRouter (GET `/api/v1/models`) — l'utilisateur saisit manuellement le `modelId`
- **Pas de vérification de crédit** (GET `/api/v1/key`) — peut-être dans une future itération
- **Pas de calcul de coût** — prix à 0 pour les modèles OpenRouter
- **Pas d'auto-routing** (`openrouter/auto`) — l'utilisateur choisit explicitement son modèle
- **Pas de Zero Data Retention** (ZDR) — future itération

## Ordre d'implémentation recommandé

1. `npm install @openrouter/ai-sdk-provider`
2. Schema DB (`custom_models`) + migration
3. Provider dans `registry.ts`
4. Factory dans `providers.ts`
5. Case dans `router.ts`
6. IPC handlers (`custom-models.ipc.ts`)
7. Fusion dans `providers.ipc.ts` (getModels)
8. Import IPC dans `index.ts`
9. Preload bridge + types
10. Icône SVG dans `ProviderIcon.tsx`
11. UI `OpenRouterModelsManager` dans `ProvidersSection.tsx`
12. Vérification CSP
