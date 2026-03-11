# Audit Sécurité Complet — Multi-LLM Desktop

**Date** : 2026-03-10
**Auditeur** : Trinity (Claude Opus 4.6)
**Scope** : 5 axes — Validation entrées, Authentification, Permissions, Mises à jour, Anti-RE

---

## Score Global
**Niveau : B-** (Fondations solides, mais lacunes sur DevTools, signing, et validation IPC)

---

## Axe 1 — Validation des entrées

### HIGH

| Handler | Problème | Fix |
|---------|----------|-----|
| `workspace:open` | `rootPath` accepte n'importe quel répertoire (`/`, `/etc`). Un renderer compromis peut ouvrir `/` comme workspace puis lire/écrire via `workspace:readFile/writeFile`. | Valider contre les workspacePaths enregistrés en DB ou bloquer les répertoires système |
| `chat:send` | `content`, `systemPrompt`, `fileContexts[].content` sans max length — memory exhaustion. `fileContexts[].path` interpolé non-échappé dans template XML. | Ajouter `.max()` sur content (100KB), systemPrompt (50KB), fileContexts (max 20 items, 500KB/item). Échapper les paths dans le XML |

### MEDIUM

| Handler | Problème | Fix |
|---------|----------|-----|
| `settings:set` | Pas de type check, pas de limite de taille sur key/value | Zod `key: z.string().max(200)`, `value: z.string().max(100000)` |
| `conversations:rename/create` | Pas de Zod, `title` non borné | Ajouter Zod avec `title.max(500)` |
| `workspace:writeFile` | `content` sans max length — disk exhaustion | `.max(10_000_000)` |
| `files:save` | `buffer` sans limite de taille | Check `buf.length <= 10MB` |
| `search:messages` | Query FTS5 non sanitisée (opérateurs `*`, `OR`, `NEAR`) | Max length 500 chars, encadrer la query en double quotes |

### LOW

| Handler | Problème |
|---------|----------|
| `tasks:get/delete/execute/toggle` | `if (!id)` sans typeof — Zod recommandé |
| `statistics:*` | `days` pas typé en number |

---

## Axe 2 — Authentification & Gestion des secrets

### Positif ✅
- **safeStorage** utilisé correctement (encrypt avant stockage, decrypt uniquement à l'usage)
- **Aucune clé hardcodée** dans le codebase
- **Aucune clé en clair** dans console.log, localStorage, ou réponses IPC
- **Erreurs sanitisées** — messages utilisateur-friendly, pas de fuite de clés API
- **Preload** n'expose que `hasApiKey` (boolean) et `getApiKeyMasked` (masqué) — pas de `getApiKey`

### Findings

| Sévérité | Problème | Fichier | Fix |
|----------|----------|---------|-----|
| **HIGH** | `settings:get` permet de lire les blobs chiffrés des clés API (`multi-llm:apikey:*`) depuis le renderer | `src/main/ipc/index.ts:88` | Bloquer les clés commençant par `multi-llm:apikey:` |
| **MEDIUM** | Google TTS API key passée en query param URL (visible dans logs/proxies) | `src/main/services/tts.service.ts:128` | Utiliser le header `x-goog-api-key` |
| **LOW** | `console.error('[Chat] Stream error:', error)` log l'objet complet (pourrait contenir une clé si le provider l'echo) | `chat.ipc.ts:281` | Logger uniquement `classified.message` |

---

## Axe 3 — Permissions système & Sandboxing

### Positif ✅
- `sandbox: true` ✅
- `nodeIntegration: false` ✅
- `contextIsolation: true` ✅
- Pas de `webSecurity: false` ✅
- Pas de `eval()` / `Function()` ✅
- Pas d'exposition brute de `ipcRenderer` ✅
- `hardenedRuntime: true` (macOS) ✅
- Entitlements macOS minimales (pas de `files.all`) ✅
- Path traversal protégé sur toutes les opérations fichier ✅

### Findings

| Sévérité | Problème | Fix |
|----------|----------|-----|
| **MEDIUM** | CSP manque `object-src`, `base-uri`, `form-action`, `frame-src` | Ajouter `object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none';` |
| **LOW** | Shiki HTML output dans MarkdownRenderer non sanitisé | Ajouter DOMPurify.sanitize() |
| **LOW** | 67 méthodes preload — surface large mais correcte | Monitorer |

---

## Axe 4 — Mises à jour & Dépendances

### Positif ✅
- `electron-updater` via GitHub Releases (HTTPS)
- `allowDowngrade` désactivé (défaut)
- `autoDownload: false` — l'utilisateur doit déclencher le téléchargement

### Findings

| Sévérité | Problème | Fix |
|----------|----------|-----|
| **CRITICAL** | **Aucun code signing** macOS/Windows. Pas de notarization macOS. Gatekeeper/SmartScreen bloqueront l'app. `electron-updater` ne peut pas vérifier l'intégrité sans signature. | Configurer CSC_LINK/CSC_KEY_PASSWORD, ajouter afterSign notarization |
| **HIGH** | **Pas de CI/CD**. Pas de `.github/workflows/`. Builds locaux = risque supply chain. Pas de `npm audit` automatisé. | Créer pipeline GitHub Actions (build + sign + audit + publish) |
| **MEDIUM** | `pdf-parse@1.1.1` abandonné depuis 2019, PDF.js interne obsolète | Migrer vers `unpdf` ou `pdfjs-dist` |
| **LOW** | Toutes les deps en `^` ranges — risque de pull malveillant | Pinner les deps critiques (electron, better-sqlite3, electron-updater) |

---

## Axe 5 — Protection anti-reverse engineering

### Findings

| Sévérité | Problème | Fix |
|----------|----------|-----|
| **HIGH** | **DevTools accessibles en production** — Cmd+Shift+I ouvre l'inspecteur, expose réseau, state, preload bridge | `devTools: !app.isPackaged` dans webPreferences |
| **MEDIUM** | **Main process non minifié** — `out/main/index.js` = 4337 lignes lisibles avec logique métier, routage LLM, pricing | Activer `minify: 'terser'` + `mangle: true` + `drop_console: true` |
| **LOW** | Pas de `sourcemap: false` explicite — risque d'exposition sur upgrade Vite | Ajouter `sourcemap: false` aux 3 configs build |
| **LOW** | Pas de listener `devtools-opened` en backup | Ajouter `win.webContents.on('devtools-opened', () => win.webContents.closeDevTools())` |

---

## Tableau récapitulatif — Actions prioritaires

| # | Priorité | Axe | Action | Effort | Statut |
|---|----------|-----|--------|--------|--------|
| 1 | 🔴 | Auth | Bloquer `multi-llm:apikey:*` dans `settings:get` | 5 min | **Fait** (S20) |
| 2 | 🔴 | Anti-RE | Désactiver DevTools en production | 1 min | **Fait** (S20) |
| 3 | 🔴 | Update | Implémenter code signing + notarization | 1-2j | En attente (Apple Developer Program) |
| 4 | 🟠 | Validation | Borner `chat:send` (content, systemPrompt, fileContexts) | 15 min | **Fait** (S21) |
| 5 | 🟠 | Validation | Sécuriser `workspace:open` (whitelist ou blocklist système) | 15 min | **Fait** (S20) |
| 6 | 🟠 | Permissions | Durcir la CSP (object-src, base-uri, form-action, frame-src) | 5 min | **Fait** (S20) |
| 7 | 🟠 | Auth | Google TTS key → header au lieu de query param | 10 min | **Fait** (S21) |
| 8 | 🟠 | Anti-RE | Minifier le main process (Terser) | 10 min | **Fait** (S21) |
| 9 | 🟡 | Validation | Ajouter Zod sur conversations:*, settings:*, files:save | 30 min | **Fait** (S20) |
| 10 | 🟡 | Update | Remplacer pdf-parse par unpdf | 30 min | Non fait |
| 11 | 🟡 | Update | Setup CI/CD GitHub Actions | 2-4h | **Fait** (S21) |

---

**Sources** : Electron Security Checklist 2026, OWASP Top 10, Electron Hardening Guide, npm audit.
