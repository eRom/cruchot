# Feature Spec — Intégration MCP (Model Context Protocol)

> **Date** : 2026-03-11
> **Auteur** : Trinity (analyse) pour Romain
> **Statut** : Draft — Analyse & Plan
> **Priorité** : Feature majeure — étend les capacités LLM au-delà du chat texte

---

## Table des matières

1. [Qu'est-ce que MCP ?](#1-quest-ce-que-mcp)
2. [Ce que ça apporte au projet](#2-ce-que-ça-apporte-au-projet)
3. [Analyse technique — `@ai-sdk/mcp`](#3-analyse-technique--ai-sdkmcp)
4. [Transports — stdio vs SSE vs Streamable HTTP](#4-transports--stdio-vs-sse-vs-streamable-http)
5. [Sécurité](#5-sécurité)
6. [Limites connues](#6-limites-connues)
7. [Architecture proposée](#7-architecture-proposée)
8. [Modèle de données](#8-modèle-de-données)
9. [UI — Gestion des MCP Servers](#9-ui--gestion-des-mcp-servers)
10. [Intégration dans le flux Chat](#10-intégration-dans-le-flux-chat)
11. [Écosystème MCP — Serveurs populaires](#11-écosystème-mcp--serveurs-populaires)
12. [Plan d'implémentation](#12-plan-dimplémentation)
13. [Questions ouvertes](#13-questions-ouvertes)
14. [Sources](#14-sources)

---

## 1. Qu'est-ce que MCP ?

### Définition

**Model Context Protocol (MCP)** est un **standard ouvert** créé par **Anthropic** (annoncé fin 2024) pour connecter les applications IA à des systèmes externes. Le protocole standardise la façon dont un LLM découvre et invoque des outils, lit des ressources, et utilise des prompts templétés provenant de serveurs externes.

### Analogie

MCP est aux applications IA ce que **LSP (Language Server Protocol)** est aux éditeurs de code : un protocole unifié qui permet à N clients de parler à M serveurs sans écrire N×M adaptateurs.

### Architecture du protocole

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Host      │     │   Host      │     │   Host      │
│ (Notre app) │     │ (Claude)    │     │ (VS Code)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
  ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
  │ Client  │         │ Client  │         │ Client  │
  │ (1:1)   │         │ (1:1)   │         │ (1:1)   │
  └────┬────┘         └────┬────┘         └────┬────┘
       │                   │                   │
  ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
  │ Server  │         │ Server  │         │ Server  │
  │ GitHub  │         │ Slack   │         │ Files   │
  └─────────┘         └─────────┘         └─────────┘
```

Trois participants :
- **Host** : L'application IA (notre app Electron) qui coordonne les clients MCP
- **Client** : Composant qui maintient une connexion 1:1 avec un serveur MCP
- **Server** : Programme qui expose des capacités (outils, ressources, prompts)

### Wire format

- **JSON-RPC 2.0** sur différents transports
- **Encodage** : UTF-8
- **Version protocole** : `2025-03-26` (dernière stable au moment de l'analyse)
- **Connexions stateful** : Handshake d'initialisation + négociation de capabilities

### Les 3 primitives serveur

| Primitive | Contrôle | Description |
|-----------|----------|-------------|
| **Tools** | Le LLM décide quand les invoquer | Fonctions exécutables (lecture fichier, appel API, requête DB...) |
| **Resources** | L'application décide | Sources de données en lecture seule (contenu fichier, schéma DB, réponses API) |
| **Prompts** | L'utilisateur décide | Templates réutilisables pour des interactions structurées |

---

## 2. Ce que ça apporte au projet

### Situation actuelle

Notre app a déjà 3 outils workspace intégrés en dur dans `workspace-tools.ts` : `readFile`, `listFiles`, `searchInFiles`. Ces outils sont :
- Codés dans notre codebase
- Limités au workspace du projet actif
- Non extensibles par l'utilisateur

### Avec MCP

L'utilisateur pourrait connecter des **serveurs MCP externes** à son chat, donnant au LLM accès à :

| Serveur MCP | Capacité ajoutée |
|-------------|-----------------|
| **GitHub** | Lire/chercher des repos, créer des issues, consulter des PRs |
| **Filesystem** | Accès étendu au filesystem (au-delà du workspace) |
| **PostgreSQL / SQLite** | Requêter des bases de données en lecture |
| **Slack** | Lire/envoyer des messages, lister des channels |
| **Brave Search** | Recherche web intégrée dans le chat |
| **Fetch** | Récupérer et convertir du contenu web |
| **Memory** | Mémoire persistante via knowledge graph |
| **Google Drive** | Accès aux documents Drive |
| **Puppeteer** | Automatisation navigateur |
| **Sentry** | Analyse d'issues et erreurs |

L'intérêt fondamental : **l'utilisateur personnalise les capacités du LLM sans qu'on ait à coder chaque intégration**.

---

## 3. Analyse technique — `@ai-sdk/mcp`

### Package

| Champ | Valeur |
|-------|--------|
| **npm** | `@ai-sdk/mcp` |
| **Version stable** | 1.0.25 (mars 2026) |
| **Licence** | Apache-2.0 |
| **Node.js** | >= 18 |
| **Peer dependency** | `zod ^3.25.76 \|\| ^4.1.8` |
| **Downloads/semaine** | ~342K |

### Compatibilité Electron — VÉRIFIÉE

Le code source de `@ai-sdk/mcp` contient un helper `isElectron()` qui détecte l'environnement Electron et ajuste le comportement (ex: `windowsHide: true` sur Windows pour éviter les fenêtres console qui flashent). Le transport stdio utilise `child_process.spawn()` qui est disponible dans le main process Electron.

### Compatibilité AI SDK v6

Notre projet utilise `ai@^6.0.116`. Le package `@ai-sdk/mcp@1.0.25` est compatible. L'API stable utilise :

```typescript
// Import stable (pas experimental_)
import { createMCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
```

> **Note** : `experimental_createMCPClient` est un alias déprécié exporté pour rétrocompatibilité. Utiliser `createMCPClient`.

### API principale — `createMCPClient()`

```typescript
const client = await createMCPClient({
  // REQUIS : transport
  transport: MCPTransport | MCPTransportConfig,

  // OPTIONNEL
  name?: string,            // identifiant client (défaut: 'ai-sdk-mcp-client')
  version?: string,         // version (défaut: '1.0.0')
  onUncaughtError?: (error: Error) => void,
  capabilities?: {
    elicitation?: {},        // support élicitation (serveur demande info à l'utilisateur)
  },
})
```

### Méthodes du client

| Méthode | Description |
|---------|-------------|
| `tools()` | Récupère les outils MCP convertis en outils AI SDK |
| `listResources()` | Liste les ressources disponibles |
| `readResource({ uri })` | Lit une ressource spécifique |
| `listResourceTemplates()` | Liste les templates de ressources |
| `experimental_listPrompts()` | Liste les prompts disponibles |
| `experimental_getPrompt({ name, arguments })` | Récupère un prompt |
| `close()` | Ferme la connexion — **TOUJOURS appeler dans un `finally`** |

### Conversion outils MCP → AI SDK

Quand on appelle `client.tools()` :

1. Le client envoie `tools/list` (JSON-RPC) au serveur
2. Le serveur retourne les définitions d'outils (name, description, inputSchema)
3. Le package convertit chaque outil en `tool()` AI SDK avec le schema mappé
4. Retourne `Record<string, Tool>` — prêt pour `streamText()` / `generateText()`

```typescript
const mcpTools = await client.tools()
const workspaceTools = buildWorkspaceTools(workspace)

// Fusion des outils
const allTools = { ...workspaceTools, ...mcpTools }

const result = streamText({
  model: getModel(providerId, modelId),
  tools: allTools,
  stopWhen: stepCountIs(10),  // obligatoire AI SDK v6
  // ...
})
```

### Gestion d'erreurs

Deux types d'erreurs :
- **`MCPClientError`** : Connexion, initialisation, capabilities — hérite de `AISDKError`, a un champ `data` et `code`
- **`CallToolError`** : Erreur lors de l'exécution d'un outil par le serveur

---

## 4. Transports — stdio vs SSE vs Streamable HTTP

### Comparaison

| Transport | Cas d'usage | Réseau | Auth | Session | Notre app |
|-----------|-------------|--------|------|---------|-----------|
| **stdio** | Serveurs locaux | Non (subprocess) | Non requis | Non | **Principal** |
| **Streamable HTTP** | Serveurs distants | Oui (HTTP) | OAuth/Headers | Oui (`Mcp-Session-Id`) | Secondaire |
| **SSE** (legacy) | Serveurs distants | Oui (SSE+POST) | Headers | Non | Pas recommandé |

### stdio (TRANSPORT PRINCIPAL)

C'est le transport utilisé par Claude Desktop, Claude Code, et la majorité des intégrations MCP locales.

**Fonctionnement** :
- Le client (notre app) **spawn un subprocess** (ex: `node`, `npx`, `python`)
- Communication via `stdin` (client→serveur) et `stdout` (serveur→client)
- Messages : JSON-RPC newline-delimited

```typescript
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'

new Experimental_StdioMCPTransport({
  command: 'npx',                          // exécutable
  args: ['-y', '@modelcontextprotocol/server-github'],  // arguments
  env: { GITHUB_TOKEN: 'ghp_xxx' },       // variables d'env pour le process
  cwd: '/optional/working/dir',            // répertoire de travail (optionnel)
  stderr: 'inherit',                       // stderr (défaut: 'inherit')
})
```

**Séquence d'arrêt** :
1. Le client ferme le flux stdin
2. Attend que le serveur se termine
3. Envoie `SIGTERM` si nécessaire
4. Envoie `SIGKILL` en dernier recours

**Avantages** : Zéro overhead réseau, setup simple, idéal pour local
**Inconvénients** : Local uniquement, un process par serveur

### Streamable HTTP (TRANSPORT DISTANT)

**Fonctionnement** :
- Le serveur est un processus HTTP indépendant (potentiellement distant)
- Un seul endpoint HTTP (ex: `https://example.com/mcp`)
- Client→Serveur : POST avec JSON-RPC
- Serveur→Client : Réponse JSON ou stream SSE

```typescript
const client = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://my-mcp-server.com/mcp',
    headers: { Authorization: 'Bearer my-key' },
  },
})
```

**Avantages** : Fonctionne à distance, multi-clients, sessions resumables
**Inconvénients** : Plus complexe, latence réseau, nécessite auth

### Variables d'environnement — Mécanisme stdio

La fonction interne `getEnvironment()` de `@ai-sdk/mcp` filtre les variables système :

**macOS/Linux** : Hérite uniquement `HOME`, `LOGNAME`, `PATH`, `SHELL`, `TERM`, `USER` du process parent
**Windows** : Hérite `APPDATA`, `HOMEDRIVE`, `HOMEPATH`, `LOCALAPPDATA`, `PATH`, `PROCESSOR_ARCHITECTURE`, `SYSTEMDRIVE`, `SYSTEMROOT`, `TEMP`, `USERNAME`, `USERPROFILE`

Les variables custom passées dans `env` sont **mergées par-dessus** ces variables filtrées.

> **Conséquence sécurité** : Les variables d'env sensibles du process parent (comme nos clés API stockées via safeStorage) ne sont PAS héritées automatiquement par les subprocess MCP. C'est un bon comportement par défaut.

---

## 5. Sécurité

### 5.1. Modèle de menaces

| Menace | Risque | Mitigation |
|--------|--------|------------|
| **Injection indirecte de prompt** | Le LLM suit des instructions cachées dans les résultats d'outils MCP | Confirmation utilisateur pour actions sensibles, sandboxing |
| **Tool Poisoning** | Description d'outil malicieuse influence le comportement du LLM | Afficher les descriptions, permettre la désactivation outil par outil |
| **Tool Shadowing** | Un serveur MCP influence l'usage des outils d'un autre serveur | Isolation des outils par serveur dans le prompt |
| **Exfiltration de données** | Un outil malicieux lit des données locales et les envoie | Limiter les permissions filesystem, confirmer les outils réseau |
| **Clés API en clair** | Les env vars des serveurs MCP contiennent des tokens | Chiffrement via safeStorage (notre pattern existant) |
| **Exécution arbitraire** | Un serveur MCP stdio exécute du code sur la machine | L'utilisateur installe volontairement les serveurs, confirmation au premier lancement |
| **DNS Rebinding** (HTTP transport) | Un serveur HTTP local accessible depuis un site web malicieux | Bind localhost uniquement, validation Origin |

### 5.2. Principes de sécurité du protocole (spec officielle)

1. **Consentement utilisateur** : L'utilisateur doit explicitement autoriser l'accès aux données et les opérations
2. **Vie privée** : Le host doit obtenir un consentement explicite avant d'exposer des données utilisateur aux serveurs
3. **Sécurité des outils** : Les annotations d'outils (readOnly, destructive) sont **non-trustées** — un serveur malicieux peut mentir
4. **Contrôle du sampling** : L'utilisateur doit approuver toute requête de sampling LLM

### 5.3. Notre stratégie sécurité

#### Stockage des secrets — safeStorage (pattern existant)

Les clés API des serveurs MCP seront stockées via `safeStorage` (Keychain macOS), comme nos clés API LLM existantes. **Jamais en clair dans un fichier JSON** (contrairement à Claude Desktop).

```
Flux de stockage :
1. Utilisateur saisit "GITHUB_TOKEN" dans l'UI
2. Renderer envoie via IPC → Main process
3. Main chiffre via safeStorage.encryptString()
4. Valeur chiffrée stockée en DB (table mcp_servers, colonne envEncrypted)
5. Au lancement du serveur MCP : déchiffrement → passage en env au subprocess
```

#### Confirmation des outils

Deux niveaux possibles :
- **Mode auto** : Les outils s'exécutent sans confirmation (défaut pour les serveurs de confiance)
- **Mode confirmation** : Chaque appel d'outil montre un dialog de confirmation à l'utilisateur

Le mode peut être configurable par serveur MCP.

#### Isolation

- Chaque serveur MCP tourne dans son propre subprocess (stdio) — pas d'accès inter-serveurs
- Les variables d'env sont filtrées par `@ai-sdk/mcp` — pas d'héritage des clés API de notre app
- Les outils MCP sont préfixés par le nom du serveur pour éviter les collisions (ex: `github__create_issue`)

### 5.4. Points d'attention spécifiques

| Point | Détail |
|-------|--------|
| **PATH du process** | En Electron, le PATH GUI peut différer du PATH shell — problème courant avec `npx`/`uvx`. Solution : permettre de spécifier un chemin absolu pour la commande |
| **Process zombie** | Si notre app crash, les subprocess MCP restent en vie. Solution : `app.on('will-quit')` + kill group |
| **Timeout outil** | Un outil MCP bloqué peut freezer le chat. Solution : timeout configurable par serveur (défaut 30s) |
| **Taille des résultats** | Un outil retournant un gros JSON peut exploser le contexte LLM. Solution : troncature + avertissement |

---

## 6. Limites connues

### Limites du protocole MCP

| Limite | Impact | Contournement |
|--------|--------|---------------|
| **Pas de standard d'auth intégré** | L'auth dépend du transport (env vars pour stdio, OAuth/headers pour HTTP) | On gère les deux patterns |
| **Pas de chiffrement au niveau protocole** | Repose sur la sécurité du transport (process isolation pour stdio, HTTPS pour HTTP) | Acceptable pour notre usage local |
| **Annotations non-trustées** | On ne peut pas se fier aux hints `readOnly`, `destructive` d'un serveur | Afficher un avertissement, mode confirmation optionnel |
| **Pas de protection contre l'injection indirecte** | Le protocole ne peut pas empêcher un LLM de suivre des instructions dans les résultats d'outils | Sandboxing, confirmation utilisateur |
| **Pas d'isolation cross-serveur** | Les descriptions d'un serveur peuvent influencer le LLM sur les outils d'un autre serveur | Préfixage des noms d'outils |
| **Connexions stateful** | Handshake d'initialisation requis, pas de mode "fire-and-forget" | Gestion du cycle de vie dans un service dédié |

### Limites de `@ai-sdk/mcp` (v1.0.25)

| Limite | Impact |
|--------|--------|
| **Pas de support des notifications** | Le client ne peut pas recevoir les notifications du serveur (ex: `tools/list_changed`) |
| **Pas de gestion de sessions** | Pas de sessions resumables |
| **`Experimental_StdioMCPTransport`** reste expérimental | Le préfixe `Experimental_` est conservé — API potentiellement instable |
| **Pas de discovery automatique des Resources** | Le LLM ne peut pas découvrir les Resources — seuls les Tools sont utilisables directement |
| **Tool naming collisions** | Si deux serveurs ont un outil nommé pareil, le dernier écrase le premier (spread `{...a, ...b}`) |

### Limites spécifiques Electron

| Limite | Impact | Solution |
|--------|--------|----------|
| **stdio = main process only** | Le subprocess ne peut être spawné que depuis le main process (pas le renderer) | Tout dans le main process, IPC pour l'UI |
| **`mcp-stdio` dans external** | Comme `chokidar`, il faut marquer le subpath en `external` dans electron.vite.config | Config build |
| **HMR ne recharge pas les MCP clients** | Modification du code MCP = restart app | Même pattern que le preload |

---

## 7. Architecture proposée

### Vue d'ensemble

```
┌─────────────── Renderer ────────────────┐
│                                          │
│  Sidebar > Settings > MCP Servers        │
│  ┌──────────────────────────────────┐    │
│  │ Liste des serveurs MCP           │    │
│  │ + Ajouter / Modifier / Supprimer │    │
│  │ + Toggle actif/inactif           │    │
│  │ + Status (connected/error/off)   │    │
│  └──────────────────────────────────┘    │
│                                          │
│  Chat — ToolCallBlock (outils MCP)       │
│  ┌──────────────────────────────────┐    │
│  │ [github] create_issue ✓          │    │
│  │ [filesystem] read_file ✓         │    │
│  └──────────────────────────────────┘    │
│                                          │
└──────────────────┬───────────────────────┘
                   │ IPC
┌──────────────────┴───────────────────────┐
│               Main Process               │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │  McpManagerService (singleton)  │     │
│  │                                 │     │
│  │  - Map<serverId, MCPClient>     │     │
│  │  - startServer(config)          │     │
│  │  - stopServer(serverId)         │     │
│  │  - getToolsForChat()            │     │
│  │  - lifecycle (init/destroy)     │     │
│  └──────┬──────────────────────────┘     │
│         │                                │
│  ┌──────┴──────┐  ┌───────────┐          │
│  │ MCP Client  │  │ MCP Client│          │
│  │ (GitHub)    │  │ (Files)   │          │
│  └──────┬──────┘  └─────┬─────┘          │
│         │ stdio         │ stdio           │
│  ┌──────┴──────┐  ┌─────┴─────┐          │
│  │ npx github  │  │ node fs   │          │
│  │ server      │  │ server    │          │
│  └─────────────┘  └───────────┘          │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │  DB: mcp_servers table          │     │
│  │  + safeStorage (env chiffrées)  │     │
│  └─────────────────────────────────┘     │
│                                          │
└──────────────────────────────────────────┘
```

### Nouveau service : `McpManagerService`

```
src/main/services/mcp-manager.service.ts
```

Singleton qui gère le cycle de vie de tous les clients MCP :
- **`init(mainWindow)`** : Charge les serveurs actifs depuis la DB, démarre chacun
- **`startServer(serverId)`** : Crée un `MCPClient` + transport, stocke dans la Map
- **`stopServer(serverId)`** : Ferme le client, kill le process
- **`restartServer(serverId)`** : Stop + Start
- **`getToolsForChat(serverIds?)`** : Retourne l'union des outils de tous les serveurs actifs (ou d'une sélection)
- **`getServerStatus(serverId)`** : 'connected' | 'error' | 'stopped'
- **`stopAll()`** : Appelé dans `app.on('will-quit')` — ferme proprement tous les clients

### Nouveau IPC : `mcp.ipc.ts`

```
src/main/ipc/mcp.ipc.ts
```

| Canal | Type | Description |
|-------|------|-------------|
| `mcp:list` | invoke | Liste tous les serveurs MCP configurés (+ statut) |
| `mcp:get` | invoke | Détails d'un serveur |
| `mcp:create` | invoke | Crée un nouveau serveur MCP |
| `mcp:update` | invoke | Modifie un serveur existant |
| `mcp:delete` | invoke | Supprime un serveur |
| `mcp:toggle` | invoke | Active/désactive un serveur |
| `mcp:start` | invoke | Démarre un serveur manuellement |
| `mcp:stop` | invoke | Arrête un serveur manuellement |
| `mcp:restart` | invoke | Redémarre un serveur |
| `mcp:tools` | invoke | Liste les outils exposés par un serveur (après connexion) |
| `mcp:status-changed` | send | Event push quand le statut d'un serveur change |

### Intégration dans `chat.ipc.ts`

Dans le handler `chat:send`, après la construction des workspace tools :

```typescript
// Outils workspace existants
const workspaceTools = hasWorkspace ? buildWorkspaceTools(workspace) : {}

// Outils MCP (nouveau)
const mcpTools = await mcpManagerService.getToolsForChat()

// Fusion
const allTools = { ...workspaceTools, ...mcpTools }

const result = streamText({
  model: getModel(providerId, modelId),
  tools: Object.keys(allTools).length > 0 ? allTools : undefined,
  stopWhen: stepCountIs(10),
  // ...
})
```

Les outils MCP passent par le même pipeline de streaming `tool-call` / `tool-result` déjà en place (ToolCallBlock dans MessageItem).

---

## 8. Modèle de données

### Nouvelle table : `mcp_servers`

```typescript
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),                    // nanoid
  name: text('name').notNull(),                   // nom d'affichage (ex: "GitHub")
  description: text('description'),                // description libre

  // Transport
  transportType: text('transport_type', {
    enum: ['stdio', 'http', 'sse']
  }).notNull(),

  // Config stdio
  command: text('command'),                        // 'npx', 'node', 'python', etc.
  args: text('args', { mode: 'json' }).$type<string[]>(),  // arguments CLI
  cwd: text('cwd'),                               // répertoire de travail (optionnel)

  // Config HTTP/SSE
  url: text('url'),                                // URL du serveur distant
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>(), // headers custom

  // Env vars (chiffrées via safeStorage, stockées comme JSON chiffré)
  envEncrypted: text('env_encrypted'),             // JSON chiffré des env vars

  // État
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),

  // Scope
  projectId: text('project_id').references(() => projects.id), // null = global (tous les chats)

  // Metadata
  icon: text('icon'),                              // emoji ou nom d'icône Lucide (optionnel)
  color: text('color'),                            // couleur hex (optionnel)
  toolTimeout: integer('tool_timeout').default(30000),  // timeout par outil en ms
  autoConfirm: integer('auto_confirm', { mode: 'boolean' }).notNull().default(true),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})
```

### Chiffrement des variables d'environnement

Les env vars (tokens API, clés) sont stockées comme un JSON chiffré via `safeStorage` :

```typescript
// Au save
const envJson = JSON.stringify({ GITHUB_TOKEN: 'ghp_xxx', OTHER_KEY: 'val' })
const encrypted = safeStorage.encryptString(envJson).toString('base64')
// Stocke `encrypted` dans envEncrypted

// Au load (pour lancer le serveur)
const buffer = Buffer.from(envEncrypted, 'base64')
const envJson = safeStorage.decryptString(buffer)
const env = JSON.parse(envJson)
// Passe `env` au transport stdio
```

Ce pattern est identique à notre gestion des clés API LLM via `credential.service.ts`.

### Scope projet (optionnel)

Un serveur MCP peut être :
- **Global** (`projectId = null`) : Disponible dans tous les chats
- **Lié à un projet** (`projectId = 'xxx'`) : Disponible uniquement dans les conversations de ce projet

Cela permet par exemple d'avoir un serveur GitHub lié au projet "Multi-LLM Desktop" et un serveur PostgreSQL lié au projet "Mon API Backend".

---

## 9. UI — Gestion des MCP Servers

### Emplacement

**Settings > nouvel onglet "MCP"** (9ème onglet) — accessible via la barre latérale Settings.

Alternativement (ton idée de sidebar) : on pourrait aussi ajouter une entrée dans la sidebar principale (comme Roles ou Tâches). Les deux approches sont valides. Settings semble plus cohérent car c'est de la configuration, pas une vue de travail quotidien.

> **Recommandation** : Settings > MCP pour le CRUD complet. Un indicateur compact (badge/icône) dans la sidebar ou InputZone pour montrer les serveurs MCP actifs.

### Vue "MCP Servers" — pattern grille + form inline

Même pattern que RolesView, TasksView, PromptsView :

```
┌─────────────────────────────────────────────────────────┐
│  Serveurs MCP                        [+ Ajouter]        │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 🐙 GitHub  │ │ 📁 Files   │ │ 🔍 Brave   │           │
│  │            │ │            │ │   Search   │           │
│  │ stdio      │ │ stdio      │ │ stdio      │           │
│  │ ● Connecté │ │ ● Connecté │ │ ○ Inactif  │           │
│  │            │ │            │ │            │           │
│  │ [On/Off]   │ │ [On/Off]   │ │ [On/Off]   │           │
│  │ 3 outils   │ │ 11 outils  │ │ 1 outil    │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Formulaire de création/édition

```
┌─────────────────────────────────────────────────────────┐
│  ← Retour                                               │
│                                                          │
│  Nom *           [GitHub                              ]  │
│  Description     [Accès aux repos GitHub              ]  │
│                                                          │
│  Transport       (●) stdio  ( ) HTTP  ( ) SSE            │
│                                                          │
│  ── Config stdio ──────────────────────────────────────  │
│  Commande *      [npx                                 ]  │
│  Arguments *     [-y @modelcontextprotocol/server-git…]  │
│  Rép. travail    [                                    ]  │
│                                                          │
│  ── Variables d'environnement ─────────────────────────  │
│  [GITHUB_TOKEN ]  [ghp_•••••••••••••    ] [🗑]          │
│  [+ Ajouter une variable]                                │
│                                                          │
│  ── Options ───────────────────────────────────────────  │
│  Projet          [Tous les projets          ▼]           │
│  Timeout outils  [30] secondes                           │
│  Confirmation    [Auto (pas de confirmation) ▼]          │
│                                                          │
│              [Annuler]  [Tester la connexion]  [Sauver]  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Bouton "Tester la connexion"

Avant de sauvegarder, l'utilisateur peut tester :
1. Le service crée un client MCP temporaire avec la config
2. Tente l'initialisation (handshake)
3. Récupère la liste des outils
4. Affiche : "Connexion réussie — 3 outils trouvés : create_issue, search_repos, get_file"
5. Ferme le client temporaire

### Indicateur dans InputZone (optionnel)

Un petit badge ou tooltip à côté du ToolCallBlock existant pour montrer :
- Nombre de serveurs MCP actifs
- Noms des serveurs connectés

---

## 10. Intégration dans le flux Chat

### Fusion des outils

```
chat:send reçu
    │
    ├── buildWorkspaceTools() → 3 outils internes
    │
    ├── mcpManager.getToolsForChat() → N outils MCP
    │   │
    │   ├── Filtre par projectId (si conversation dans un projet)
    │   ├── Filtre par isEnabled
    │   └── Préfixage optionnel: "github__create_issue"
    │
    └── allTools = { ...workspaceTools, ...mcpTools }
        │
        └── streamText({ tools: allTools, ... })
```

### Préfixage des noms d'outils

Pour éviter les collisions (ex: deux serveurs avec un outil `read_file`), on préfixe les outils MCP avec le nom du serveur :

```
github__create_issue
github__search_repos
filesystem__read_file
filesystem__write_file
```

Le séparateur `__` (double underscore) est choisi car il est :
- Valide dans les identifiants JSON
- Visuellement distinct
- Compatible avec l'affichage dans ToolCallBlock

### Affichage dans ToolCallBlock

Le ToolCallBlock existant (MessageItem.tsx) gère déjà l'affichage des outils avec statut. Les outils MCP apparaîtront naturellement dans le même bloc :

```
┌─ Utilisation d'outils ──────────────────────────┐
│ 📁 readFile         src/index.ts          ✓     │  ← workspace
│ 🐙 github__get_file README.md             ✓     │  ← MCP
│ 🐙 github__create_issue "Fix bug #42"     ⟳     │  ← MCP
└─────────────────────────────────────────────────┘
```

On peut enrichir le mapping `TOOL_LABELS` dans `useStreaming.ts` dynamiquement avec les noms d'outils MCP.

### Cycle de vie pendant le chat

```
App démarre
  → McpManagerService.init()
  → Charge les serveurs enabled depuis DB
  → Pour chaque : createMCPClient() + transport
  → Stocke dans Map<serverId, MCPClient>

Chat envoyé
  → mcpManager.getToolsForChat() lit la Map
  → Retourne l'union de client.tools() pour chaque serveur connecté
  → Passé à streamText()

Chat annulé (Ctrl+C)
  → AbortController.abort() — annule streamText()
  → Les clients MCP restent ouverts (réutilisés)

Serveur MCP désactivé (UI)
  → mcpManager.stopServer(id)
  → client.close() + process kill
  → Retire de la Map

App ferme
  → mcpManager.stopAll()
  → Tous les clients fermés, tous les subprocess tués
```

---

## 11. Écosystème MCP — Serveurs populaires

Serveurs de référence du repository officiel `modelcontextprotocol/servers` (80k+ stars) :

| Serveur | Package | Description | Env vars requises |
|---------|---------|-------------|-------------------|
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Opérations fichiers avec contrôle d'accès | Aucune (paths en args) |
| **Git** | `@modelcontextprotocol/server-git` | Lecture, recherche, manipulation de repos Git | Aucune |
| **GitHub** | `@modelcontextprotocol/server-github` | Repos, issues, PRs, fichiers | `GITHUB_TOKEN` |
| **GitLab** | `@modelcontextprotocol/server-gitlab` | API GitLab complète | `GITLAB_TOKEN` |
| **Slack** | `@modelcontextprotocol/server-slack` | Channels, messages | `SLACK_BOT_TOKEN` |
| **PostgreSQL** | `@modelcontextprotocol/server-postgres` | Requêtes DB read-only | `DATABASE_URL` (ou en arg) |
| **SQLite** | `@modelcontextprotocol/server-sqlite` | Interaction DB SQLite | Aucune (path en arg) |
| **Brave Search** | `@modelcontextprotocol/server-brave-search` | Recherche web | `BRAVE_API_KEY` |
| **Fetch** | `@modelcontextprotocol/server-fetch` | Récupère du contenu web (markdown) | Aucune |
| **Google Drive** | `@modelcontextprotocol/server-gdrive` | Accès fichiers Drive | Google OAuth credentials |
| **Google Maps** | `@modelcontextprotocol/server-google-maps` | Lieux, directions | `GOOGLE_MAPS_API_KEY` |
| **Memory** | `@modelcontextprotocol/server-memory` | Knowledge graph persistant | Aucune |
| **Puppeteer** | `@modelcontextprotocol/server-puppeteer` | Automatisation navigateur | Aucune |
| **Sentry** | `@modelcontextprotocol/server-sentry` | Issues, stacktraces | `SENTRY_AUTH_TOKEN` |
| **Sequential Thinking** | `@modelcontextprotocol/server-sequential-thinking` | Résolution de problèmes réflexive | Aucune |

La communauté (82k+ stars sur `punkpeye/awesome-mcp-servers`) propose des milliers de serveurs additionnels : Cloudflare, AWS, Notion, Linear, Jira, Discord, Spotify, etc.

---

## 12. Plan d'implémentation

### Phase 1 — Core MCP (MVP)

| Étape | Fichiers | Description |
|-------|----------|-------------|
| 1.1 | `package.json` | Installer `@ai-sdk/mcp` |
| 1.2 | `electron.vite.config.ts` | Ajouter `'@ai-sdk/mcp'` aux externals du main process |
| 1.3 | `schema.ts` | Nouvelle table `mcp_servers` |
| 1.4 | `db/queries/mcp-servers.ts` | Queries CRUD pour `mcp_servers` |
| 1.5 | `services/mcp-manager.service.ts` | Service singleton — lifecycle, Map, start/stop/getTools |
| 1.6 | `ipc/mcp.ipc.ts` | Handlers IPC pour CRUD + start/stop/test |
| 1.7 | `preload/index.ts` + `types.ts` | Exposer les méthodes MCP via contextBridge |
| 1.8 | `chat.ipc.ts` | Intégrer `mcpManager.getToolsForChat()` dans le flux streamText |
| 1.9 | `credential.service.ts` | Réutiliser pour chiffrement des env vars MCP |

### Phase 2 — UI

| Étape | Fichiers | Description |
|-------|----------|-------------|
| 2.1 | `stores/mcp.store.ts` | Store Zustand pour la liste des serveurs + statuts |
| 2.2 | `components/settings/McpSettings.tsx` | Onglet Settings — grille de cartes + form inline |
| 2.3 | `components/settings/McpServerForm.tsx` | Formulaire création/édition (transport, command, env vars) |
| 2.4 | `components/settings/McpServerCard.tsx` | Carte serveur (nom, transport, statut, toggle, outils) |
| 2.5 | `SettingsView.tsx` | Ajouter l'onglet MCP (9ème tab) |
| 2.6 | `useStreaming.ts` | Enrichir TOOL_LABELS dynamiquement avec les outils MCP |
| 2.7 | `MessageItem.tsx` | Afficher le préfixe serveur dans ToolCallBlock |

### Phase 3 — Polish

| Étape | Description |
|-------|-------------|
| 3.1 | Bouton "Tester la connexion" dans le formulaire |
| 3.2 | Indicateur serveurs MCP actifs dans InputZone ou sidebar |
| 3.3 | Gestion des erreurs MCP dans le chat (toast, retry) |
| 3.4 | Scope par projet (filtre `projectId`) |
| 3.5 | Présets de serveurs populaires (GitHub, Filesystem, Brave) avec config pré-remplie |
| 3.6 | Documentation inline dans l'UI (aide à la configuration) |

### Dépendances à installer

```bash
npm install @ai-sdk/mcp
```

Pas besoin de `@modelcontextprotocol/sdk` directement — `@ai-sdk/mcp` l'inclut en dépendance interne pour les transports.

### Points d'attention implémentation

1. **`@ai-sdk/mcp/mcp-stdio` en external** : Comme `chokidar`, le subpath stdio utilise `child_process`. Ajouter aux externals dans `electron.vite.config.ts`
2. **`stopWhen: stepCountIs(10)`** : Déjà en place dans notre `chat.ipc.ts` — les outils MCP en bénéficient automatiquement
3. **ToolCallBlock** : Le composant gère déjà les chunks `tool-call` et `tool-result` — les outils MCP apparaîtront automatiquement
4. **Préfixage** : Le préfixage `servername__toolname` doit être fait côté `getToolsForChat()` pour éviter les collisions, et dé-préfixé pour l'affichage
5. **Restart app** : Les modifications du service MCP (main process) nécessitent un restart complet (pas de HMR)

---

## 13. Questions ouvertes

| # | Question | Options | Recommandation |
|---|----------|---------|----------------|
| 1 | **Où placer la gestion MCP ?** | A) Settings > MCP (onglet), B) Sidebar (entrée dédiée comme Rôles/Tâches) | A — c'est de la config, pas une vue de travail |
| 2 | **Scope par projet ?** | A) Global uniquement, B) Global + par projet | B — plus flexible, analogie avec les workspace tools |
| 3 | **Préfixage des outils ?** | A) Toujours préfixer (`github__tool`), B) Préfixer seulement en cas de collision | A — plus prévisible, évite les bugs subtils |
| 4 | **Mode confirmation outils ?** | A) Auto pour tous, B) Configurable par serveur, C) Configurable par outil | B — bon compromis |
| 5 | **Transport HTTP : supporter dès le MVP ?** | A) stdio uniquement au MVP, B) stdio + HTTP | A — 95% des serveurs MCP sont stdio |
| 6 | **Preset de serveurs ?** | A) Pas de presets, config manuelle, B) Catalogue intégré | A pour le MVP, B en phase 3 |
| 7 | **Import depuis Claude Desktop ?** | A) Non, B) Bouton "Importer depuis Claude Desktop" qui lit `claude_desktop_config.json` | B en phase 3 — nice-to-have, facilite la migration |
| 8 | **Max serveurs MCP simultanés ?** | A) Pas de limite, B) Limite configurable | B — défaut 10 (chaque serveur = un process) |

---

## 14. Sources

Toutes les informations de ce document proviennent de sources vérifiées :

| Source | URL | Contenu |
|--------|-----|---------|
| Spec officielle MCP | `modelcontextprotocol.io/specification` | Protocol spec 2025-03-26, transports, sécurité |
| AI SDK — MCP Cookbook | `ai-sdk.dev/cookbook/next/mcp-tools` | Exemples d'intégration AI SDK + MCP |
| AI SDK — Docs MCP Client | `ai-sdk.dev/docs/ai-sdk-core/mcp` | API `createMCPClient`, transports, méthodes |
| `@ai-sdk/mcp` npm | `npmjs.com/package/@ai-sdk/mcp` | Version 1.0.25, dépendances, exports |
| AI SDK GitHub (monorepo) | `github.com/vercel/ai` → `packages/mcp/` | Code source, `isElectron()`, `getEnvironment()` |
| MCP Servers (officiel) | `github.com/modelcontextprotocol/servers` | Serveurs de référence, 80k+ stars |
| Awesome MCP Servers | `github.com/punkpeye/awesome-mcp-servers` | Catalogue communautaire, 82k+ stars |
| MCP Security Research | StackOne, Promptfoo, Glama (blogs sécurité) | CVE-2025-32711, tool poisoning, prompt injection |
| Claude Desktop MCP Config | `modelcontextprotocol.io/quickstart/user` | Format `claude_desktop_config.json` |

---

*Document généré le 2026-03-11. Toutes les versions de packages et URLs vérifiées à cette date.*
