# Feature : Integration DeepSeek + Alibaba Qwen

> Date : 2026-03-10 (session 12)

## Objectif

Ajouter 2 nouveaux providers LLM cloud : **DeepSeek** (modeles V3.2 ultra-competitifs en prix) et **Alibaba Qwen** (famille Qwen3/3.5 avec fenetre de contexte massive jusqu'a 1M tokens).

## Approche technique

- **DeepSeek** : package officiel `@ai-sdk/deepseek` (maintenu par Vercel) — thinking fonctionnel via providerOptions
- **Qwen** : `createOpenAICompatible` (deja installe via `@ai-sdk/openai-compatible`) vers DashScope international — thinking decoratif (built-in comme Magistral)

## Providers

| id | name | type | API endpoint | icon Lucide |
|---|---|---|---|---|
| `deepseek` | DeepSeek | cloud | `https://api.deepseek.com` | `layers` |
| `qwen` | Alibaba Qwen | cloud | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `cloud` |

## Modeles

### DeepSeek

| id | displayName | context | input $/1M | output $/1M | thinking | notes |
|---|---|---|---|---|---|---|
| `deepseek-chat` | DeepSeek Chat | 128K | $0.28 | $0.42 | oui (via providerOptions) | Mode general, thinking activable |
| `deepseek-reasoner` | DeepSeek Reasoner | 128K | $0.28 | $0.42 | oui (always-on) | Reasoning toujours actif |

### Qwen (Alibaba Cloud DashScope)

| id | displayName | context | input $/1M | output $/1M | thinking | notes |
|---|---|---|---|---|---|---|
| `qwen3-max` | Qwen3 Max | 262K | $1.20 | $6.00 | decoratif | Flagship, hybrid thinking |
| `qwen3.5-plus` | Qwen3.5 Plus | 131K | $0.40 | $2.40 | decoratif | Thinking actif par defaut |
| `qwen3.5-flash` | Qwen3.5 Flash | 131K | $0.10 | $0.40 | decoratif | Rapide et economique |
| `qwq-plus` | QwQ Plus (Reasoning) | 131K | $1.20 | $6.00 | decoratif | Reasoning always-on |

Tous : `type: 'text'`, `supportsImages: false`, `supportsStreaming: true`, `supportsThinking: true`.

## Fichiers a modifier

### 1. `package.json`

Nouvelle dependance :
```json
"@ai-sdk/deepseek": "^2.0.21"
```

### 2. `src/main/llm/registry.ts`

- 2 providers dans `PROVIDERS[]` (entre `xai` et `openrouter`)
- 6 modeles dans `MODELS[]` (avant la section Image Generation)

### 3. `src/main/llm/providers.ts`

2 nouvelles factory functions :

```typescript
import { createDeepSeek } from '@ai-sdk/deepseek'

export function getDeepSeekProvider() {
  const apiKey = getApiKeyForProvider('deepseek')
  if (!apiKey) throw new Error('DeepSeek API key not configured')
  return createDeepSeek({ apiKey })
}

export function getQwenProvider() {
  const apiKey = getApiKeyForProvider('qwen')
  if (!apiKey) throw new Error('Qwen API key not configured')
  return createOpenAICompatible({
    name: 'qwen',
    baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    headers: { Authorization: `Bearer ${apiKey}` }
  })
}
```

### 4. `src/main/llm/router.ts`

2 cases dans le switch `getModel()` :

```typescript
case 'deepseek':
  return getDeepSeekProvider()(modelId)

case 'qwen':
  return getQwenProvider()(modelId)
```

### 5. `src/main/llm/thinking.ts`

Nouveau case + builder pour DeepSeek :

```typescript
case 'deepseek':
  return buildDeepSeekThinking(effort)
```

Thinking DeepSeek = binaire (enabled/disabled, pas de budget tokens) :
- `off` → `undefined`
- `low`/`medium`/`high` → `{ deepseek: { thinking: { type: 'enabled' } } }`

Qwen : PAS de case (tombe dans `default: return undefined`). Thinking decoratif, meme pattern que Magistral Medium.

## Ce qui ne change PAS

- `cost-calculator.ts` — prix lus depuis la registry automatiquement
- `chat.ipc.ts` — les `reasoning-delta` chunks DeepSeek geres par le handler existant
- `preload/types.ts` — types generiques
- `image.ts` — ni DeepSeek ni Qwen ne font d'images
- CSP — appels API dans le main process (Node.js), pas soumis au CSP renderer
- `electron.vite.config.ts` — `externalizeDepsPlugin()` gere `@ai-sdk/deepseek` automatiquement

## Notes techniques

- **DeepSeek Reasoner** : raisonne toujours, meme si ThinkingSelector est sur "off". Le providerOptions n'affecte que `deepseek-chat`.
- **Qwen thinking** : param non-standard `enable_thinking` non supportable via `createOpenAICompatible`. Les modeles `qwen3.5-*` et `qwq-plus` raisonnent par defaut.
- **Qwen endpoint** : `dashscope-intl.aliyuncs.com` (international Singapore). Endpoint Chine (`dashscope.aliyuncs.com`) possible en amelioration future via baseUrl custom.
- **Pricing Qwen** : certains modeles ont du tiered pricing. On utilise le prix du premier tier (suffisant pour app desktop).
- **DeepSeek reasoning chunks** : le package `@ai-sdk/deepseek` emet des `reasoning-delta` chunks natifs, geres par le handler `onChunk` existant dans `chat.ipc.ts`.

## Verification

1. `npm install` — `@ai-sdk/deepseek` s'installe sans erreur
2. `npm run typecheck` — zero erreur TypeScript
3. `npm run build` — build Electron passe
4. Test DeepSeek : configurer cle API, selectionner DeepSeek Chat, envoyer un message, verifier streaming + cout
5. Test thinking DeepSeek : activer thinking "high", verifier ReasoningBlock affiche
6. Test Qwen : configurer cle DashScope, selectionner Qwen3.5 Flash, envoyer un message
