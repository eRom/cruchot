# Migration Sandbox & Tools — Architecture Technique

> Date : 2026-04-01
> Ref : specs/migration-sandbox/reference-open-code-tools-sandbox.md
> Phase : 3 phases (Fondation securite → Nouveaux tools → Extension)

---

## 1. Vue d'ensemble

Migration du systeme de tools et sandbox de Cruchot vers une architecture inspiree de Claude Code (open-code-custom-plus). Objectif triple : durcir la securite bash, ajouter un systeme de permissions configurable, et enrichir les tools LLM.

### Perimetre

| Axe | Avant | Apres |
|-----|-------|-------|
| Tools LLM | 4 (bash, readFile, writeFile, listFiles) | 8 (+FileEdit, GrepTool, GlobTool, WebFetchTool) |
| Securite bash | Zero check applicatif, confiance Seatbelt | 23 security checks + extended globs + stdin redirect + env scrubbing |
| Seatbelt HOME | Lecture complete du HOME | Blocklist fichiers sensibles (.ssh, .aws, .gnupg, etc.) |
| Permissions | Aucun systeme | Toggle/tool + regles commande/path/domaine (deny > allow > ask > fallback) |
| UI permissions | Inexistante | Onglet Settings + Approval Banner (toast dans le chat) |
| Sandbox Linux | Fallback exec() brut | Phase 3 : bwrap (bubblewrap) |

### Hors scope

- ToolSearch / Deferred tools (utile a partir de ~20+ tools)
- Enterprise lockdowns (app mono-utilisateur)
- Classifieur auto (specifique Anthropic interne)
- PowerShell (Windows non prioritaire)
- Bridge NDJSON (architecture CLI)
- Teams/Swarms (CLI specifique)

---

## 2. Architecture du pipeline de securite

Chaque tool call passe par un pipeline multi-couches :

```
LLM tool call
  |
  v
+-------------------------------------+
| 1. SECURITY CHECKS (hard blocks)    |  <- Jamais overridable
|    - Bash : 23 checks securite      |
|    - Files : device paths, case norm |
|    - Path traversal (realpathSync)   |
|    DENY -> erreur immediate au LLM  |
+----------------+--------------------+
                 | PASS
                 v
+-------------------------------------+
| 2. PERMISSION RULES (configurable)  |  <- User-controlled
|    Evaluation dans l'ordre :         |
|    a) Deny rules -> DENY            |
|    b) Allow rules -> ALLOW          |
|    c) Ask rules -> ASK              |
|    d) Fallback (per-tool default)    |
|       -> ALLOW ou ASK selon tool    |
+--------+---------------+------------+
         | ALLOW         | ASK
         |    +----------+------------+
         |    | 3. APPROVAL BANNER    |
         |    |    Toast dans le chat  |
         |    |    [Approuver]         |
         |    |    [Session] [Refuser] |
         |    |    Timeout 60s -> DENY |
         |    +---+----------+--------+
         |        | APPROVED | DENIED
         v        v          -> erreur au LLM
+-------------------------------------+
| 4. SANDBOX EXECUTION                |
|    - Bash : Seatbelt (macOS)        |
|    - Files : workspace confinement   |
|    - WebFetch : domain check         |
+----------------+--------------------+
                 |
                 v
           Resultat -> LLM
```

### Principes

- **Security checks = mur dur** : les 23 checks bash, device paths bloques, path traversal ne sont jamais overridables. Meme une regle "allow" ne contourne pas un security check.
- **Permission rules = configurable** : l'utilisateur definit ses regles. Stockees en SQLite, editables dans Settings.
- **Fallback par tool** : quand aucune regle ne matche :
  - `readFile`, `listFiles`, `GrepTool`, `GlobTool` -> **ALLOW** (read-only, confines)
  - `bash`, `writeFile`, `FileEdit` -> **ASK** (potentiellement destructifs)
  - `WebFetchTool` -> **ASK** (acces reseau externe)
- **Approval Banner** : quand le pipeline atteint ASK, le streaming se met en pause, un banner toast apparait avec boutons Approuver/Approuver pour la session/Refuser. Timeout 60s -> deny auto.

---

## 3. Bash Hardening

### 3.1 Security Checks (pre-execution)

Nouveau fichier `src/main/llm/bash-security.ts` (~300 lignes).

23 verifications executees **avant** l'evaluation des permissions, **avant** Seatbelt. Si un check echoue -> DENY immediat, pas d'override possible.

| # | Check | Exemple bloque |
|---|-------|----------------|
| 1 | Commande incomplete | `echo "hello` (quote non fermee) |
| 2 | `jq` system() | `jq 'system("rm -rf /")'` |
| 3 | Flags obfusques | `r\m -rf /` |
| 4 | Shell metacharacters dangereux | `;`, `&&`, `\|\|` dans contextes suspects |
| 5 | Variables dangereuses | Redefinition de `IFS`, `PATH`, `LD_PRELOAD` |
| 6 | Newlines dans commandes | `echo foo\nrm -rf /` (injection multi-ligne) |
| 7 | Command substitution | `$(...)`, `` `...` ``, `<(...)`, `>(...)` |
| 8 | Redirections I/O suspectes | `> /etc/passwd`, `>> ~/.bashrc` |
| 9 | IFS injection | `IFS=/ cmd` |
| 10 | Git commit substitution | `git commit -m "$(curl ...)"` |
| 11 | `/proc/environ` access | `cat /proc/self/environ` |
| 12 | Malformed tokens | Caracteres de controle caches |
| 13 | Backslash escapes | `\r\m` pour contourner blocklist |
| 14 | Brace expansion dangereuse | `{rm,-rf,/}` |
| 15 | Control chars | `\x00`-`\x1f` hors whitespace |
| 16 | Unicode whitespace | Espaces insecables, zero-width, etc. |
| 17 | Mid-word hash | Commentaires caches `cmd#malicious` |
| 18-23 | ZSH dangerous commands | `zmodload`, `emulate`, `sysread`, `ztcp`, `zsocket`, `zpty`, `zf_rm`, `mapfile`, etc. (21 commandes) |

**API :**
```typescript
runBashSecurityChecks(command: string): { pass: boolean; failedCheck?: number; reason?: string }
buildSafeEnv(workspacePath: string): Record<string, string>
wrapCommand(command: string, shell: 'bash' | 'zsh'): string
```

### 3.2 Extended Globs & Stdin

Ajoutes dans `wrapCommand()` :

```bash
shopt -u extglob          # bash
setopt NO_EXTENDED_GLOB   # zsh
eval '<quoted-command>' < /dev/null
```

### 3.3 Env Scrubbing renforce

```typescript
const SCRUBBED_ENV_VARS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
  'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN', 'GH_TOKEN', 'GITLAB_TOKEN',
  'DATABASE_URL', 'REDIS_URL',
  'LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES',
  'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'
]
```

---

## 4. Seatbelt ameliore

### 4.1 Blocklist HOME

Ajout de deny explicites dans le profil SBPL genere par `buildSeatbeltProfile()` :

**Repertoires bloques en lecture :**
```
~/.ssh, ~/.aws, ~/.gnupg, ~/.gpg, ~/.config/gcloud, ~/.azure,
~/.kube, ~/.docker, ~/.credentials, ~/.password-store,
~/Library/Keychains
```

**Fichiers bloques en lecture :**
```
~/.netrc, ~/.npmrc, ~/.pypirc, ~/.env,
~/.bash_history, ~/.zsh_history
```

### 4.2 Constantes TypeScript

```typescript
const SEATBELT_DENIED_PATHS = [
  '.ssh', '.aws', '.gnupg', '.gpg', '.config/gcloud', '.azure',
  '.kube', '.docker', '.credentials', '.password-store',
  'Library/Keychains'
]

const SEATBELT_DENIED_FILES = [
  '.netrc', '.npmrc', '.pypirc', '.env',
  '.bash_history', '.zsh_history'
]
```

Exportees depuis `seatbelt.ts` pour reutilisation dans les security checks applicatifs.

### 4.3 Ordre SBPL

Les `deny` sont places **avant** les `allow` de meme granularite dans le profil genere. En SBPL, un deny explicite prime sur un allow general.

---

## 5. Systeme de permissions

### 5.1 Modele de donnees

```typescript
interface PermissionRule {
  id: string                          // crypto.randomUUID()
  toolName: string                    // 'bash' | 'readFile' | 'writeFile' | 'FileEdit' |
                                      // 'GrepTool' | 'GlobTool' | 'WebFetchTool' | '*'
  ruleContent?: string                // pattern optionnel
  behavior: 'allow' | 'deny' | 'ask'
  createdAt: number
}

type PermissionDecision = 'allow' | 'deny' | 'ask'

interface PermissionContext {
  toolName: string
  toolArgs: Record<string, unknown>
  workspacePath: string
}
```

### 5.2 Granularite des regles

Le `ruleContent` est un pattern libre interprete selon le tool :

| Niveau | Tool(s) | Format ruleContent | Exemple | Matching |
|--------|---------|-------------------|---------|----------|
| Tool global | tout | `undefined` (null) | `{ toolName: 'bash', behavior: 'deny' }` | Tout appel a bash |
| Commande prefixe | bash | String simple | `npm install` | `command.startsWith('npm install')` |
| Commande wildcard | bash | `prefix *` | `npm *` | `npm install`, `npm test`, `npm run build` |
| Path fichier | writeFile, FileEdit | Glob path | `/src/**/*.ts` | Ecriture dans src/*.ts |
| Domaine web | WebFetchTool | Domain pattern | `*.github.com` | Fetch sur github.com et sous-domaines |

**Matching bash** : le `ruleContent` est compare au debut de la commande. Si le pattern se termine par ` *`, tout ce qui commence par le prefixe matche. Sinon, match exact du prefixe.

**Matching path** : le `ruleContent` est un glob compare au chemin relatif du fichier dans le workspace via `micromatch` ou `minimatch` (dep existante).

**Matching domaine** : le `ruleContent` est compare au hostname de l'URL. `*` en premier segment = sous-domaines.

### 5.3 Moteur d'evaluation

Fichier `src/main/llm/permission-engine.ts` (~200 lignes).

```typescript
function evaluatePermission(context: PermissionContext, rules: PermissionRule[]): PermissionDecision {
  const applicable = rules.filter(r => r.toolName === context.toolName || r.toolName === '*')

  // 1. Deny rules — premiere qui matche -> DENY
  for (const rule of applicable.filter(r => r.behavior === 'deny'))
    if (matchesRule(rule, context)) return 'deny'

  // 2. Allow rules — premiere qui matche -> ALLOW
  for (const rule of applicable.filter(r => r.behavior === 'allow'))
    if (matchesRule(rule, context)) return 'allow'

  // 3. Ask rules — premiere qui matche -> ASK
  for (const rule of applicable.filter(r => r.behavior === 'ask'))
    if (matchesRule(rule, context)) return 'ask'

  // 4. Fallback par tool
  return getToolDefault(context.toolName)
}
```

**Fallbacks par defaut :**

| Tool | Default | Raison |
|------|---------|--------|
| readFile | allow | Read-only, confine |
| listFiles | allow | Read-only, confine |
| GrepTool | allow | Read-only, confine |
| GlobTool | allow | Read-only, confine |
| bash | ask | Potentiellement destructif |
| writeFile | ask | Modification filesystem |
| FileEdit | ask | Modification filesystem |
| WebFetchTool | ask | Acces reseau externe |

### 5.4 Stockage SQLite

Table `permission_rules` (26eme table Drizzle) :

```typescript
export const permissionRules = sqliteTable('permission_rules', {
  id: text('id').primaryKey(),
  toolName: text('tool_name').notNull(),
  ruleContent: text('rule_content'),
  behavior: text('behavior', { enum: ['allow', 'deny', 'ask'] }).notNull(),
  createdAt: integer('created_at').notNull()
})
```

Index : `idx_permission_rules_tool` sur `tool_name`.

Queries dans `src/main/db/queries/permissions.ts` :
- `getAllRules(): PermissionRule[]`
- `addRule(rule): void`
- `deleteRule(id): void`
- `getRulesForTool(toolName): PermissionRule[]`

Regles chargees une fois au demarrage, cachees en memoire, rechargees a chaque modification.

### 5.5 Approvals de session

```typescript
// En memoire uniquement — reset au restart app
const sessionApprovals: Set<string> = new Set()
// Cle : `${toolName}::${ruleContent}`
// Ex: "bash::npm test" -> auto-approved pour la session
```

### 5.6 Regles seedees par defaut

```typescript
const DEFAULT_RULES: Omit<PermissionRule, 'id' | 'createdAt'>[] = [
  // Bash : commandes de dev courantes auto-approuvees
  { toolName: 'bash', ruleContent: 'npm *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'npx *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'git *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'node *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'cat *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'ls *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'find *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'grep *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'echo *', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'pwd', behavior: 'allow' },
  { toolName: 'bash', ruleContent: 'which *', behavior: 'allow' },
  // Bash : commandes dangereuses explicitement refusees
  { toolName: 'bash', ruleContent: 'rm -rf *', behavior: 'deny' },
  { toolName: 'bash', ruleContent: 'sudo *', behavior: 'deny' },
  { toolName: 'bash', ruleContent: 'chmod *', behavior: 'deny' },
  { toolName: 'bash', ruleContent: 'chown *', behavior: 'deny' },
  // WebFetch : domaines courants auto-approuves
  { toolName: 'WebFetchTool', ruleContent: '*.github.com', behavior: 'allow' },
  { toolName: 'WebFetchTool', ruleContent: '*.npmjs.com', behavior: 'allow' },
  { toolName: 'WebFetchTool', ruleContent: '*.mozilla.org', behavior: 'allow' },
  { toolName: 'WebFetchTool', ruleContent: '*.stackoverflow.com', behavior: 'allow' },
]
```

---

## 6. Nouveaux tools

### 6.1 FileEdit

Remplacement de chaine au lieu d'ecrasement complet, avec detection TOCTOU.

```typescript
// inputSchema
z.object({
  file_path: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  replace_all: z.boolean().optional().default(false)
})
```

**Logique :**
1. `validatePath(file_path, workspacePath)`
2. Lire le fichier courant
3. **TOCTOU check** : comparer `mtime` avec la derniere lecture connue (`fileReadTimestamps` Map). Si modifie -> erreur
4. Verifier que `old_string` existe et est unique (sauf `replace_all`)
5. Remplacer et ecrire
6. Mettre a jour le timestamp TOCTOU

**Cache TOCTOU :**
```typescript
// Map en memoire : file_path -> derniere mtime connue
const fileReadTimestamps = new Map<string, number>()
// Mis a jour par readFile, verifie par FileEdit
```

**Permission default :** ask

### 6.2 GrepTool

```typescript
z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  include_context: z.number().optional(),
  case_insensitive: z.boolean().optional()
})
```

- Parcours recursif, skip BLOCKED_PATH_SEGMENTS
- Check TEXT_EXTENSIONS avant lecture
- Max 100 fichiers matches, 500 lignes total
- Implementation pure Node.js (readFileSync + RegExp)
- **Permission default :** allow

### 6.3 GlobTool

```typescript
z.object({
  pattern: z.string(),
  path: z.string().optional()
})
```

- Matching via `fast-glob` (dep transitive existante)
- Skip BLOCKED_PATH_SEGMENTS
- Max 200 fichiers, tries par mtime desc
- **Permission default :** allow

### 6.4 WebFetchTool

```typescript
z.object({
  url: z.string().url(),
  prompt: z.string().optional()
})
```

- Protocol : `https:` uniquement
- Permission check avec domain comme ruleContent
- `fetch()` natif, timeout 15s, max response 2 MB
- HTML -> Markdown via `turndown` (nouvelle dep ~15 KB)
- Truncation a 100 KB
- **Permission default :** ask

---

## 7. Structure fichiers tools

Eclatement de `conversation-tools.ts` (320 lignes) en modules independants :

```
src/main/llm/tools/
  index.ts              # buildConversationTools() — assemble 8 tools + wrapping pipeline
  bash.ts               # tool bash + appel security checks + execSandboxed
  file-read.ts          # readFile (porte depuis conversation-tools.ts)
  file-write.ts         # writeFile (porte depuis conversation-tools.ts)
  file-edit.ts          # FileEdit (NOUVEAU)
  list-files.ts         # listFiles (porte depuis conversation-tools.ts)
  grep.ts               # GrepTool (NOUVEAU)
  glob.ts               # GlobTool (NOUVEAU)
  web-fetch.ts          # WebFetchTool (NOUVEAU)
  shared.ts             # validatePath, isReadableFile, constantes, fileReadTimestamps
```

---

## 8. Integration dans le flux chat

### 8.1 Changements dans handleChatMessage()

```typescript
// Avant
const workspaceTools = buildConversationTools(resolvedWorkspacePath)

// Apres
const rules = permissionEngine.getRules()
const workspaceTools = buildConversationTools(resolvedWorkspacePath, {
  rules,
  onAskApproval: async (request) => waitForApproval(request, win, source)
})
```

### 8.2 Wrapping des tools

Dans `tools/index.ts`, chaque `tool.execute()` est enveloppe :

```typescript
function wrapWithPermissionPipeline(toolDef, toolName, options) {
  return {
    ...toolDef,
    execute: async (args) => {
      // 1. Security checks (hard blocks)
      // 2. Permission evaluation (deny > allow > ask > fallback)
      // 3. Si ask -> onAskApproval callback (banner ou Remote)
      // 4. Execute original
    }
  }
}
```

### 8.3 Suppression de wrapToolsWithApproval() (Remote)

L'ancien systeme d'approval Remote est remplace par le pipeline unifie. Un seul chemin, trois transports :

```typescript
async function waitForApproval(request, win, source) {
  if (source === 'telegram') return telegramBotService.requestApproval(request)
  if (source === 'websocket') return remoteServerService.requestApproval(request)
  return requestDesktopApproval(request, win)  // banner
}
```

Les autoApproveRead/Write/Bash du Remote deviennent des regles de permission.

### 8.4 Nouveaux chunks IPC

```typescript
{ type: 'tool-approval', approvalId: string, toolName: string, toolArgs: Record<string, unknown> }
{ type: 'tool-approval-resolved', approvalId: string, decision: 'allow' | 'deny' }
```

### 8.5 Ce qui ne change PAS

- Flux onChunk (text-delta, tool-call, tool-result)
- Gestion des erreurs (classifyError)
- System prompt assembly (6 couches) — sauf mise a jour WORKSPACE_TOOLS_PROMPT
- Arena mode (pas de tools)
- Sauvegarde DB (messages, cost, usage)
- Ingestion Qdrant

---

## 9. UI

### 9.1 Onglet Permissions dans SettingsView

- Section "Comportement par defaut" : 8 selects (un par tool) Autoriser/Demander/Refuser
- Section "Regles personnalisees" : liste + bouton Ajouter
- Dialog "Ajouter une regle" : Select tool, Input pattern, Select comportement
- Bouton "Reinitialiser les permissions par defaut"
- Composant : `settings/PermissionsSettings.tsx` (~200 lignes)

### 9.2 Approval Banner

- Composant `chat/ToolApprovalBanner.tsx` (~100 lignes)
- Positionne dans ChatView entre messages et InputZone
- Affiche : icone warning + nom du tool + detail (commande/path/url)
- 3 boutons : Autoriser / Autoriser pour la session / Refuser
- Timeout 60s -> deny auto

### 9.3 Mecanisme IPC

1. Main detecte `ask` -> envoie chunk `tool-approval`
2. Renderer affiche banner
3. User clique -> `window.api.approveToolCall(approvalId, decision)`
4. Main debloque le tool call via Promise en attente
5. Timeout 60s cote main -> auto-deny

```typescript
const pendingApprovals = new Map<string, {
  resolve: (decision: 'allow' | 'deny') => void
  timeout: NodeJS.Timeout
}>()
```

---

## 10. Inventaire fichiers

### Fichiers a creer (16)

```
src/main/llm/tools/index.ts
src/main/llm/tools/bash.ts
src/main/llm/tools/file-read.ts
src/main/llm/tools/file-write.ts
src/main/llm/tools/file-edit.ts
src/main/llm/tools/list-files.ts
src/main/llm/tools/grep.ts
src/main/llm/tools/glob.ts
src/main/llm/tools/web-fetch.ts
src/main/llm/tools/shared.ts
src/main/llm/bash-security.ts
src/main/llm/permission-engine.ts
src/main/db/queries/permissions.ts
src/main/ipc/permissions.ipc.ts
src/renderer/src/components/settings/PermissionsSettings.tsx
src/renderer/src/components/chat/ToolApprovalBanner.tsx
```

### Fichiers a modifier (14)

| Fichier | Modifications |
|---------|--------------|
| seatbelt.ts | Ajout deny HOME blocklist |
| chat.ipc.ts | Rules loading, onAskApproval, supprimer wrapToolsWithApproval, handler approve-tool |
| ipc/index.ts | Import permissions handlers |
| schema.ts | Table permission_rules |
| migrate.ts | CREATE TABLE + index + seed |
| preload/index.ts | +6 methodes |
| preload/types.ts | +types PermissionRule, ToolApprovalRequest, 2 StreamChunk |
| settings.store.ts | +slice permissionRules |
| SettingsView.tsx | +onglet Permissions |
| ChatView.tsx | +ToolApprovalBanner |
| useStreaming.ts | Gerer chunks tool-approval |
| ui.store.ts | +state pendingApproval |
| router.ts | Aucun changement (confirmation) |
| package.json | +dep turndown |

### Fichiers a supprimer (1)

| Fichier | Raison |
|---------|--------|
| conversation-tools.ts | Eclate en tools/* |

### Resume quantitatif

| Categorie | Nombre |
|-----------|--------|
| Fichiers crees | 16 |
| Fichiers modifies | 14 |
| Fichiers supprimes | 1 |
| Nouvelle table DB | 1 (permission_rules) |
| Nouveaux index | 1 |
| Nouvelles methodes preload | 6 |
| Nouveaux types partages | ~5 |
| Nouvelle dependance | 1 (turndown) |
| Tools LLM | 4 -> 8 |

---

## 11. Phases de livraison

### Phase 1 : Fondation securite
- Bash hardening (23 checks + extended globs + stdin + env scrubbing)
- Seatbelt blocklist HOME
- Permission engine (evaluation + stockage + regles seedees)
- Settings UI (onglet Permissions)
- Approval Banner (composant chat)
- Integration chat.ipc.ts (wrapping pipeline)
- Suppression wrapToolsWithApproval() (Remote unifie)

### Phase 2 : Nouveaux tools
- FileEdit (remplacement string, TOCTOU)
- GrepTool (regex search)
- GlobTool (pattern matching)
- Integration permissions (chaque tool nait avec ses regles)

### Phase 3 : Extension
- WebFetchTool (fetch + markdown, permissions par domaine)
- Linux bwrap (prep + implementation)
- Mise a jour WORKSPACE_TOOLS_PROMPT (description 8 tools)
- Polish (UX, edge cases)
