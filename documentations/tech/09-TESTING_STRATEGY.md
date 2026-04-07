# Stratégie de Tests (Sablier 3-tier)

Ce document décrit la stratégie de tests de Cruchot, son organisation en couches, les conventions d'écriture, l'automatisation locale et CI, ainsi que les décisions de design qui ont façonné l'approche actuelle.

## 1. Philosophie : le sablier, pas la pyramide

Cruchot adopte une **stratégie sablier** (hourglass) en 3 couches plutôt que la pyramide classique. Le rationnel :

- **Solo dev** : minimiser le nombre de couches à maintenir
- **70 % de la complexité Cruchot vit dans le main process** (Electron, AI SDK, Drizzle, services), pas dans le renderer React
- **Le scénario "UI cassée silencieusement"** demande un test E2E réel sur le binaire Electron — c'est non-négociable
- **Pas de TDD strict** sur le renderer : la phase de brainstorming Romain × Claude couvre la majorité des risques de design

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3 — E2E Flows (Playwright Electron + LLM)                │
│  6 specs · ~1.4 min · Ollama qwen3.5:4b · LOCAL ONLY            │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2 — E2E Security (Playwright Electron, no LLM)           │
│  22 + 2 skipped · ~12s · Local + CI (chaque PR)                 │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1 — Unit (Vitest)                                        │
│  251 tests / 10 suites · ~1.5s · Local + CI                     │
└─────────────────────────────────────────────────────────────────┘
                Total : 279 passing + 2 skipped
```

## 2. Layer 1 — Tests unitaires (Vitest)

### 2.1 Périmètre

- 251 tests répartis sur 10 suites dans `src/main/**/__tests__/*.test.ts` et `src/main/__tests__/`
- Cibles principales : `bash-security`, `permission-engine`, `compact.service`, `cost-calculator`, `errors` (withRetry), `episode-extractor`, `live/log-utils`, `test-mode`, `test-helpers.ipc`
- Durée : ~1.5 s en local

### 2.2 Conventions

- `import { describe, it, expect, beforeAll, vi } from 'vitest'` — `globals: true` activé dans `vitest.config.ts`, donc l'import explicite est non-idiomatic (le compilateur l'acceptera mais le pattern projet est globaux implicites)
- Mocks lourds (`electron`, `../../db`) déclarés au top du fichier de test via `vi.mock(...)`
- Assertions sur le **comportement observable**, pas sur l'implémentation interne (typage Drizzle, ordre des arguments, etc.)
- Pas de fixture lourde : chaque test crée ses dépendances ou les mocke

### 2.3 Lancement

```bash
npm test                  # tous les tests, mode run (~1.5s)
npm run test:watch        # mode watch (re-run sur changement)
```

## 3. Layer 2 — E2E Security (Playwright Electron, sans LLM)

### 3.1 Périmètre

22 specs passing + 2 skipped, dans `tests/e2e/security/*.spec.ts`. Lance le binaire Electron réel via le fixture `tests/e2e/fixtures/electron-app.ts` (qui crée un `userDataDir` temporaire isolé par test, lance `out/main/index.js`, puis cleanup).

| Spec | Tests | Validation |
|---|---|---|
| `preload-allowlist.spec.ts` | 3 | snapshot des 295 méthodes `window.api`, `ipcRenderer` non exposé, sanity floor |
| `webpreferences.spec.ts` | 5 (1 skipped) | `require` undefined, devTools fermés, Auxclick disabled (audit S66), iframe cross-origin bloqué, eval CSP **(skipped — voir section 9)** |
| `csp-and-navigation.spec.ts` | 4 | `setWindowOpenHandler` deny, no popup, will-navigate guard, CSP meta tag présent |
| `protocols.spec.ts` | 2 | `local-image://` enregistré, fetch HTTPS externe rejeté |
| `renderer-no-node.spec.ts` | 6 | `require`/`__dirname`/`__filename`/`Buffer`/`global`/`process` tous undefined dans le renderer |
| `dialogs.spec.ts` | 2 | smoke `stubDialog` pour `showOpenDialog`/`showSaveDialog` |
| `fuses.spec.ts` | 1 (skipped en dev) | gated `CRUCHOT_TEST_PACKAGED=1`, vérifie 6 fuses `@electron/fuses` sur le binaire packagé |

### 3.2 Approche behavioral, pas structurelle

Pour valider `webPreferences.sandbox: true` + `nodeIntegration: false` + `contextIsolation: true`, **on ne lit pas la config** (`webContents.getWebPreferences()` n'existe pas dans l'API publique d'Electron 41). Au lieu de ça, on teste l'**effet observable** :

```typescript
test('renderer has no require', async ({ window: page }) => {
  const t = await page.evaluate(() => typeof (window as { require?: unknown }).require)
  expect(t).toBe('undefined')  // valide les 3 flags en 1 check
})
```

Pour Auxclick (audit S66) : on dispatche un `MouseEvent('auxclick', { button: 1 })` sur un `<a target="_blank">` et on vérifie qu'aucune nouvelle window n'apparaît.

### 3.3 Snapshot du preload

`preload-allowlist.spec.ts` snapshote les **295 clés top-level** de `window.api` (sorted) dans `tests/e2e/security/preload-allowlist.spec.ts-snapshots/window-api-keys-darwin.txt`. En `TEST_MODE`, une 296e clé `test` apparaît (snapshot séparé `window-api-keys-with-test-darwin.txt`).

Toute PR qui touche le preload casse le test → le développeur doit explicitement faire `npx playwright test --update-snapshots` et committer le diff.

### 3.4 Lancement

```bash
npm run test:e2e:security              # tous les tests security (~12s)
npm run test:e2e:security -- tests/e2e/security/webpreferences.spec.ts  # un seul spec
npm run test:e2e:headed -- tests/e2e/security/  # avec fenêtre visible (debug)
npm run test:e2e:debug -- tests/e2e/security/preload-allowlist.spec.ts  # Inspector Playwright
npx playwright show-report             # ouvre le HTML report après une failure
```

## 4. Layer 3 — E2E Flows (Playwright Electron + Ollama, local only)

### 4.1 Périmètre

6 specs dans `tests/e2e/flows/*.spec.ts`. Exercent les paths critiques utilisateur en lançant le binaire Electron + en envoyant de vrais messages à un LLM local (Ollama `qwen3.5:4b` par défaut).

| Spec | Phase | Ce qu'il valide |
|---|---|---|
| `01-chat-basic.spec.ts` | 2a (S69) | Envoyer un message → row DB persistée → reload survit |
| `02-multi-provider.spec.ts` | 2b1 T4 (S70) | Switch Ollama → openai (no key) → switch back. Erreur asserted par row absence |
| `03-compact.spec.ts` | 2b1 T6 (S70) | Compact persistence + boundary id + `llm_costs` row (via `summaryOverride` bypass — voir 4.4) |
| `04-conversation-tools.spec.ts` | 2b1 T7 (S70) | Tool approval flow → `writeFile()` créé un fichier marker dans le workspace |
| `05-memory-layers.spec.ts` | 2b1 T9 (S70) | Memory fragment "favorite color blue" → injection `<user-memory>` dans le system prompt (pas de LLM call) |
| `06-export-import-mlx.spec.ts` | 2b1 T10 (S70) | Export → import `.mlx` round-trip (AES-256-GCM, pas un ZIP) |

Total : ~1.4 min en local sur Ollama qwen3.5:4b (4 workers parallèles).

### 4.2 Discipline assertion : side-effects only

**JAMAIS d'assertion sur le contenu textuel d'une réponse LLM.** Les LLM sont non-déterministes. Les assertions légales :

1. Streaming a fonctionné (`chunks.length > 0`)
2. Message final non-vide (`text.length > 0`)
3. Rows DB créées (`dbHelper.count(...)`)
4. Side effects filesystem (`fs.existsSync(...)`)
5. UI displays correct components (`expect(banner).toBeVisible()`)
6. System prompt contient les blocs attendus (via `test:get-system-prompt` IPC helper)
7. Usage tokens > 0
8. IPC return values stable shape (`importResult.conversationsImported === N`)
9. ZIP/encrypted file header bytes (`buffer[0] === 0x50` ou `stat.size > headerSize`)
10. `provider_id` / `model_id` columns sur les message rows

**Cas légitime d'assertion sur du texte** : si le texte est notre INPUT (constante de test type `FAKE_SUMMARY = 'Test compact summary content (truncated for E2E test)'`), l'assertion d'égalité `expect(...).toBe(FAKE_SUMMARY)` est légale. Ce n'est pas un check sur de l'output LLM, c'est un check round-trip de notre propre input.

### 4.3 Provider lock : Ollama qwen3.5:4b uniquement

Les flow specs sont **tightly coupled** au timing et au format de sortie de qwen3.5:4b. Une tentative en CI sur `gemini-3-flash-preview` (run `24067368479`) a fait échouer 5/6 specs :

- `04-conversation-tools` : gemini ne tool-call pas le banner de la même façon
- `01/02/03` : timeouts UI 90s, formats de réponse différents
- `06-export-import-mlx` : race condition `instance-token` (depuis fixée)
- `05-memory-layers` : seul à passer (pas de LLM call)

**Décision (Phase 2b2 PIVOT, S70)** : les flows tournent **uniquement en local** sur Ollama qwen3.5:4b. Pas de provider portability dans le scope actuel. Si un jour le besoin multi-provider apparaît, il faudra soit du code provider-conditional dans chaque spec, soit un re-design des assertions pour ne dépendre que de side effects strictement identiques entre providers.

### 4.4 Le bypass `summaryOverride` pour `03-compact`

`qwen3.5:4b` est un modèle **reasoning-only** : sur le `compactSummaryPrompt` (qui demande de la "structured prose"), il rambles dans `<think>...</think>` pour les 4096 tokens du budget hardcodé dans `compact.service.ts:321` et laisse `result.text` vide. Le call hang ~4 minutes avant `finish_reason: length`.

Pour rendre `03-compact.spec.ts` déterministe, le handler `test:trigger-compact` accepte un paramètre optionnel **`summaryOverride: string`** qui SKIP le `fullCompact()` LLM call mais MIRROR le rounds-walk + boundary computation + persistence + `llm_costs` row creation. Le test asserte `compact_summary === FAKE_SUMMARY` (égalité légale car FAKE_SUMMARY est notre input, pas l'output LLM).

Conséquence : le real `compactService.fullCompact()` LLM call **n'est PAS exercé** par les tests E2E. C'est une dette acceptée — voir section 9.

### 4.5 Pré-requis et lancement

**Pré-requis** : Ollama running avec `qwen3.5:4b` installé.

```bash
ollama pull qwen3.5:4b
ollama serve  # si pas déjà démarré
```

Le script `scripts/test-e2e-setup.sh` (invoqué automatiquement par `npm run test:e2e:flows`) vérifie qu'Ollama est ready et fait un warmup du modèle. Si Ollama est down, le script fail clean avec un message clair.

```bash
npm run test:e2e:flows                 # 6 specs (~1.4 min)
npm run test:e2e:flows -- tests/e2e/flows/03-compact.spec.ts  # un seul spec
npm run test:all                       # vitest + security + flows = 279+2 (~2 min)
```

## 5. Plomberie test-mode

### 5.1 Variables d'environnement

`src/main/test-mode.ts` exporte 5 constantes lues depuis `process.env` au top-level :

| Var | Usage |
|---|---|
| `CRUCHOT_TEST_MODE` | `'1'` active TEST_MODE ; déclenche le throw fail-fast si `TEST_USERDATA` absent |
| `CRUCHOT_TEST_USERDATA` | path vers le `userData` isolé (mkdtemp par test) ; `app.setPath('userData', ...)` AVANT `app.whenReady()` |
| `CRUCHOT_TEST_PROVIDER` | (optionnel) `'google'` pour basculer `TEST_MODEL_ID` |
| `CRUCHOT_TEST_MODEL` | (optionnel) override du modèle |
| `CRUCHOT_TEST_API_KEY` | (optionnel) clé API injectée dans le credential service en test mode |

`assertTestMode()` est exporté pour gater les handlers IPC test-only (defense in depth).

### 5.2 IPC handlers test-only

`src/main/ipc/test-helpers.ipc.ts` expose 4 handlers, **dynamic-imported uniquement quand `CRUCHOT_TEST_MODE=1`** (donc complètement absents du bundle production). Tous gates par `assertTestMode()` première ligne.

| Handler | Phase | Validation Zod | Usage |
|---|---|---|---|
| `test:db-select` | 2a (S69) | SQL string + 7-stage pipeline + `READABLE_TABLES` whitelist (5 tables : `conversations`, `messages`, `memory_fragments`, `llm_costs`, `roles`) + `FORBIDDEN_TOKENS` regex | Read-only SELECT contre la DB SQLite |
| `test:seed-messages` | 2b1 T5 | `conversationId` + `count: int 1..500` + `role: enum user\|assistant` | Insère N messages synthétiques sans LLM |
| `test:trigger-compact` | 2b1 T5/T6 | `conversationId` + `contextWindowOverride?: int 100..1_000_000` + `summaryOverride?: string min 1 max 10_000` | Mirror inline de l'orchestration `compact:run` (le `compactService.runCompact()` n'existe pas — la vraie API est `fullCompact(conversationId, messages, model, contextWindow, summary?)` avec ~30 lignes d'orchestration) |
| `test:get-system-prompt` | 2b1 T8 | `conversationId` + `userMessage: string min 1 max 10_000` | Reuse `buildSystemPrompt` (extrait de `chat.ipc.ts` en Phase 2b1 Task 1), calcule `memory + profile blocks` |

Les 4 handlers utilisent des **lazy imports** dans le body du handler (`await import('...')`) pour éviter de polluer le mocking vitest avec `better-sqlite3` natif et le AI SDK transitif.

### 5.3 Exposition preload

`src/preload/index.ts` expose les 4 méthodes via :

```typescript
const testApi: TestApi | undefined = TEST_MODE
  ? {
      dbSelect: (sql: string) => ipcRenderer.invoke('test:db-select', sql),
      seedMessages: (payload) => ipcRenderer.invoke('test:seed-messages', payload),
      triggerCompact: (payload) => ipcRenderer.invoke('test:trigger-compact', payload),
      getSystemPrompt: (payload) => ipcRenderer.invoke('test:get-system-prompt', payload),
    }
  : undefined
```

L'objet est attaché à `window.api.test`. Comme c'est **une seule clé top-level**, le snapshot preload-allowlist passe de 295 (prod) à 296 lignes en TEST_MODE — pas plus, parce que `seedMessages`/`triggerCompact`/`getSystemPrompt` sont nestées sous `window.api.test`.

### 5.4 Fixtures Playwright

`tests/e2e/fixtures/electron-app.ts` :
- Crée un `mkdtempSync(path.join(os.tmpdir(), 'cruchot-test-'))` par test
- Lance `out/main/index.js` (ou `dist/.app` packagé via `executablePath`) avec env `CRUCHOT_TEST_MODE=1` + `CRUCHOT_TEST_USERDATA`
- Expose `window` (le `firstWindow()` du browser context) + `electronApp` (le main process Electron)
- Try/catch sur `app.close()` pour ne pas leak le tmp dir si Electron crash

`tests/e2e/fixtures/flow-fixtures.ts` :
- Étend le base test
- `dbHelper` : `count(table)`, `selectOne<T>(sql)`, `selectAll<T>(sql)`, `waitFor(probe, predicate, opts)` — tous via `test:db-select`
- `TEST_MODEL_ID` const : `'ollama::qwen3.5:4b'` par défaut, branche `'google::gemini-3-flash-preview'` non utilisée (provider lock, voir 4.3)
- `seedDefaultModel(page, modelId)` helper : seed localStorage zustand persist + `setSetting` IPC + reload (la double-écriture est obligatoire car `useInitApp` lit localStorage AVANT le DB fetch)

## 6. Workflows CI

### 6.1 `.github/workflows/ci.yml` — chaque PR

Runner : `macos-latest` natif (pas xvfb).

```yaml
- npm test                       # vitest (251)
- npm run test:e2e:security      # Playwright (22 + 2 skipped)
```

Sur failure : upload `playwright-security-report` artifact (7 jours de rétention).

**Pas de `e2e-flows`** dans ci.yml — voir section 8.

### 6.2 `.github/workflows/release.yml` — sur tag push (`v*`)

3 jobs séquentiels :

1. **`security-gate`** (~1 min, ubuntu)
   - `npm audit --audit-level=high --omit=dev`
   - `npm run lint:lockfile`
   - Check des PRs Dependabot security ouvertes via `gh pr list --jq 'test("^\\[Security\\]")'`
2. **`release`** matrix 3 OS (mac/win/linux), depend de `security-gate`
   - Typecheck (renderer + main)
   - Build & package (electron-builder)
   - Audit du bundle packagé via `scripts/audit-bundle.js`
   - Verify `@electron/fuses` sur le binaire (mac uniquement)

**Pas de `e2e-flows`** dans release.yml non plus — voir section 8.

## 7. Pre-release skill enforcement

Le skill `cruchot-release` (`.claude/skills/cruchot-release/SKILL.md`) lance automatiquement les **3 layers** en pré-check à l'étape 2.6 AVANT de tagger une release :

```bash
npm test                    # 251 vitest, ~1.5s
npm run test:e2e:security   # 22+2 security, ~12s
npm run test:e2e:flows      # 6 flows on Ollama qwen3.5:4b, ~1.4 min
```

**Total ~2 min** de pré-check pour 279 + 2 skipped tests. Si l'un des 3 layers échoue, le skill **STOP avant le tag**.

Si Ollama est down, `scripts/test-e2e-setup.sh` détecte l'erreur et fail clean → le skill stoppe avec :

> "Démarre Ollama avant de relancer la release."

Si nécessaire, le développeur peut forcer un check local manuel avec `npm run test:e2e:flows` en dehors du skill.

## 8. Pourquoi local-only pour les flows (Phase 2b2 PIVOT)

Phase 2b2 a initialement tenté un job CI `e2e-flows` dans `release.yml` qui aurait fait tourner les 6 specs sur `gemini-3-flash-preview` (le seul modèle Google text dans le registry Cruchot — `gemini-2.5-flash` n'existe pas). Validation live via `workflow_dispatch` (run `24067368479`) :

- **5 / 6 specs failed sur gemini-3-flash-preview** (over-fitting qwen3.5:4b + race instance-token)
- **CI duration ~20 min** (security-gate + e2e-flows + release matrix 3 OS)

**Décision Romain (Phase 2b2 PIVOT, 2026-04-06)** : abandon du job CI flows. Bénéfices du pivot local-first :

- ~1.4 min en local vs ~20 min en CI (gain x14 pour solo dev)
- Pas de coût récurrent gemini API par release
- Pas besoin de fixer les bugs CI-specific (race conditions, model-output differences)
- Même protection : le skill enforce les 3 layers en pré-tag, donc une régression flow bloque le release au même moment qu'un job CI le ferait

Le plan original `_internal/plans/2026-04-06-test-strategy-phase2b2-ci-release.md` (1060 lignes) reste comme historique de la décision rejetée.

## 9. Trous laissés volontairement

Liste exhaustive dans `_internal/specs/2026-04-06-test-strategy-design.md` (section 11). Highlights :

- **Live voice (Gemini/OpenAI)** : trop complexe (audio capture, WebSocket, state machine)
- **MCP servers runtime** : couvert par les unit tests (mock du transport stdio)
- **Auto-updater** : validation manuelle post-release uniquement
- **Library RAG / Arena** : checklist manuelle dans le skill `cruchot-release`
- **Multi-window** : Cruchot est mono-window
- **Real `compactService.fullCompact()` LLM call** : `03-compact.spec.ts` utilise le `summaryOverride` bypass (voir 4.4). Future work : ajouter un vitest unit test pour `compactService` si/quand `maxTokens` est paramétré
- **Real `generateImage()` flow** : out of scope Phase 2b1, peut être ajouté
- **Telegram + Remote Web E2E** : validation manuelle
- **Multi-provider flow validation** : flows sont Ollama-only (provider lock, voir 4.3)
- **CSP `eval()` blocked test** : `webpreferences.spec.ts` Test 5 est `test.skip()`. Cause : CSP via `<meta>` ne bloque pas `eval()` (per HTML spec, seule la CSP délivrée via HTTP header le fait). Tracking dans `_internal/specs/2026-04-06-csp-header-hardening.md`

## 10. Décisions historiques notables

| Session | Décision | Impact |
|---|---|---|
| **S68** | Phase 1 — Sablier 3-tier, 7 specs E2E security | Foundation complète, ~12s, runs sur chaque PR |
| **S69** | Phase 2a — Plomberie test-mode + spec pilote `01-chat-basic` | `test:db-select` + `dbHelper` + Ollama setup |
| **S69b** | Fix CI E2E security (NMV mismatch) | `postinstall: electron-builder install-app-deps` ajouté à `package.json` |
| **S70** | Phase 2b1 — 5 specs flows + 3 helpers IPC + extraction `buildSystemPrompt` | 12 commits, 279 + 2 skipped au total |
| **S70** | Phase 2b1 Task 6 — découverte qwen reasoning-only + ajout `summaryOverride` bypass | `03-compact` exécutable de façon déterministe |
| **S70** | Phase 2b1 Task 7 — découverte `echo HELLO > file` ne fire pas le banner (`echo` dans `READONLY_COMMANDS`) | Spec `04-conversation-tools` utilise `writeFile()` au lieu de `bash` |
| **S70** | Phase 2b1 Task 10 — découverte `.mlx` est AES-256-GCM (pas un ZIP) | Spec `06-export-import-mlx` asserte `size > 28` + round-trip via `importBulk()` |
| **S70** | Phase 2b2 PIVOT — abandon CI `e2e-flows`, enforcement local via `cruchot-release` skill étape 2.6 | Voir section 8 |
| **S70** | Fix race `instance-token` | `ensureInstanceToken()` déplacé AVANT `registerAllIpcHandlers()` dans `index.ts` (était deferred ligne 250, race avec `export:bulk` IPC en CI) |

## 11. Liens

- Plan parent : `_internal/specs/2026-04-06-test-strategy-design.md`
- Plan Phase 1 : `_internal/plans/2026-04-06-test-strategy-phase1-security.md`
- Plan Phase 2a : `_internal/plans/2026-04-06-test-strategy-phase2a-plumbing.md`
- Plan Phase 2b1 : `_internal/plans/2026-04-06-test-strategy-phase2b1-flows.md`
- Plan Phase 2b2 (rejeté) : `_internal/plans/2026-04-06-test-strategy-phase2b2-ci-release.md`
- README E2E : `tests/e2e/README.md`
- Skill release : `.claude/skills/cruchot-release/SKILL.md`
- POLICY sécurité : `audit/security/POLICY.md`
