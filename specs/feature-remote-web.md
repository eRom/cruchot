# Feature Spec — Remote Web Client

> Version 1.0 — 2026-03-11
> Prerequis : Remote Telegram (session 23) implemente

## 1. Vision

Client web leger permettant de controler l'app desktop a distance depuis n'importe quel navigateur. **Zero intelligence cote client** — le desktop reste le cerveau (LLM, outils, DB, cles API). Le client web est un terminal d'entree/sortie securise avec streaming temps reel via WebSocket.

### Pourquoi le web ?

- **Universel** : fonctionne sur tout appareil avec un navigateur (PC, tablette, telephone)
- **Zero installation** : pas d'app store, pas de build natif
- **Servi par le desktop** : le serveur HTTP integre sert directement les fichiers statiques
- **PWA** : installable en un clic, icone sur l'ecran d'accueil, shell offline

### Non-goals

- Pas de mode offline fonctionnel (le desktop doit etre allume)
- Pas de stockage local de conversations (tout est sur le desktop)
- Pas d'appels LLM cote client
- Pas d'acces aux fichiers locaux du navigateur
- Pas de multi-utilisateur simultane

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESKTOP (Electron)                            │
│                    === Cerveau ===                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ RemoteServerService (NOUVEAU - singleton)                │   │
│  │  ├── HTTPS server (Node.js native, self-signed TLS)     │   │
│  │  ├── WebSocket server (ws library)                       │   │
│  │  ├── Static file server (web client SPA)                 │   │
│  │  ├── Auth manager (pairing + session tokens)             │   │
│  │  ├── Client registry (Map<clientId, WebSocket>)          │   │
│  │  ├── Rate limiter (IP-based)                             │   │
│  │  └── Protocol handler (JSON messages bidirectionnels)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ handleChatMessage() (existant, etendu)                   │   │
│  │  ├── source: 'desktop' | 'telegram' | 'websocket'       │   │
│  │  ├── Dual/tri-forward chunks → desktop + telegram + ws  │   │
│  │  └── Tool approval gate (WebSocket inline)               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SQLite DB                                                │   │
│  │  ├── remote_sessions (existant, etendu: type column)     │   │
│  │  └── conversations, messages (bridge existant)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    ↕ WSS (TLS + Auth)
┌─────────────────────────────────────────────────────────────────┐
│               WEB CLIENT (SPA statique)                         │
│              === Terminal I/O securise ===                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA (bundle ~200KB gzip)                          │   │
│  │  ├── PairingScreen (saisie code 6 digits)                │   │
│  │  ├── ChatView (messages + streaming + markdown)          │   │
│  │  ├── ToolApprovalCard (approve/deny inline)              │   │
│  │  ├── StatusBar (connexion, modele, conversation)         │   │
│  │  └── WebSocket manager (auto-reconnect, heartbeat)       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Aucun LLM, aucun outil, aucune cle API, aucune DB             │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de donnees

```
User (navigateur)
  → saisit message dans ChatView
  → WebSocket send({ type: "user-message", content: "..." })
  → Desktop: RemoteServerService recoit
  → handleChatMessage(content, source='websocket', conversationId)
  → streamText() avec tools wrapes (approval gate)
  → onChunk: forward vers desktop UI + WebSocket client
    ├── { type: "text-delta", content: "..." }
    ├── { type: "reasoning-delta", content: "..." }
    ├── { type: "tool-call", id, name, args }
    ├── { type: "tool-result", id, result }
    └── { type: "tool-approval-request", id, name, args }
  → Client affiche en temps reel (streaming natif)
  → User clique [Approve] → send({ type: "tool-approval-response", id, approved })
  → Desktop resout la Promise → outil execute ou refuse
```

---

## 3. Securite — 5 couches

### Couche 1 : TLS obligatoire (chiffrement transport)

```
Premier lancement du serveur :
  → crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  → x509.createCertificate(selfSigned, validity: 365 jours)
  → Stocke clePrive + cert dans safeStorage (chiffre OS)
  → Serveur HTTPS avec ce certificat

Le client web accepte le cert self-signed :
  → Avertissement navigateur au premier acces (normal)
  → L'utilisateur valide manuellement (pin du cert)
  → Alternative : generer un cert CA local + installer dans le trust store
```

**Garantie** : Toutes les communications sont chiffrees, meme sur reseau local non-securise.

### Couche 2 : Binding reseau restrictif

```
Par defaut :
  server.listen(PORT, '127.0.0.1')  // Localhost uniquement

Mode LAN (opt-in explicite dans Settings) :
  server.listen(PORT, '0.0.0.0')    // Toutes interfaces
  → Avertissement UI : "Le serveur est accessible depuis le reseau local"
  → Firewall recommande
```

**Garantie** : Par defaut, seul l'ordinateur local peut se connecter. Le mode LAN est un choix delibere.

### Couche 3 : Pairing code (authentification initiale)

```
Meme pattern que Telegram :
  → Desktop genere code 6 chiffres (crypto.randomBytes)
  → Expiry 5 minutes, max 5 tentatives
  → Affiche dans l'UI desktop + copie clipboard
  → Client web : ecran de saisie du code
  → Verification : code correct + pas expire + attempts < 5
  → Succes : serveur genere un session token (crypto.randomBytes(32).toString('hex'))
  → Token renvoye au client via WebSocket
  → Client stocke le token en sessionStorage (PAS localStorage)
```

**Garantie** : Meme si quelqu'un scanne les ports, il ne peut pas se connecter sans le code.

### Couche 4 : Session token (authentification continue)

```
Apres pairing :
  → Chaque message WebSocket inclut le session token dans un header custom
  → Le serveur verifie le token sur chaque message
  → Token lie a : clientId + IP + User-Agent (fingerprint)
  → Si fingerprint change → session invalidee
  → Token expire apres 24h max
  → Inactivite 10 min → session expiree (meme pattern Telegram)
```

**Garantie** : Un token vole depuis un autre appareil/navigateur est inutilisable.

### Couche 5 : Rate limiting + brute force protection

```
Rate limiter par IP :
  → Max 10 tentatives de pairing par minute par IP
  → Max 100 messages WebSocket par minute par session
  → Max 5 connexions simultanees par IP
  → Apres 10 echecs pairing consecutifs : ban IP 15 minutes
  → Logging : toutes les tentatives echouees loguees
```

**Garantie** : Brute force du code 6 digits impossible dans la fenetre de 5 minutes.

### Sanitization (meme pattern Telegram)

```
SENSITIVE_PATTERNS appliques avant envoi au client :
  → Cles API masquees
  → Tokens masques
  → Mots de passe masques
  → Paths sensibles (.env, .pem, credentials) filtres
```

---

## 4. Protocole WebSocket

### 4.1 Handshake

```
1. Client ouvre WebSocket vers wss://desktop-ip:port/ws
2. Serveur envoie : { type: "auth-required" }
3. Client envoie : { type: "pair", code: "123456" }
4. Si OK : { type: "paired", sessionToken: "abc...", config: { ... } }
   Si KO : { type: "pair-failed", reason: "invalid|expired|max-attempts", attemptsLeft: 3 }
5. Apres pairing, tous les messages incluent sessionToken
```

### 4.2 Messages Client → Serveur

| Type | Payload | Description |
|------|---------|-------------|
| `pair` | `{ code: string }` | Tentative de pairing |
| `user-message` | `{ content: string, sessionToken: string }` | Message utilisateur |
| `tool-approval-response` | `{ toolCallId: string, approved: boolean, sessionToken: string }` | Reponse approval outil |
| `cancel-stream` | `{ sessionToken: string }` | Annuler le stream en cours |
| `ping` | `{}` | Heartbeat client (toutes les 30s) |
| `switch-conversation` | `{ conversationId: string, sessionToken: string }` | Changer de conversation active |
| `get-conversations` | `{ sessionToken: string }` | Liste des conversations recentes |
| `get-history` | `{ conversationId: string, limit: number, sessionToken: string }` | Historique messages |

### 4.3 Messages Serveur → Client

| Type | Payload | Description |
|------|---------|-------------|
| `auth-required` | `{}` | Demande de pairing |
| `paired` | `{ sessionToken, config }` | Pairing reussi |
| `pair-failed` | `{ reason, attemptsLeft }` | Pairing echoue |
| `stream-start` | `{ messageId }` | Debut de stream LLM |
| `text-delta` | `{ content: string }` | Chunk texte (streaming) |
| `reasoning-delta` | `{ content: string }` | Chunk raisonnement |
| `tool-call` | `{ toolCallId, toolName, args }` | Outil appele |
| `tool-result` | `{ toolCallId, result }` | Resultat outil |
| `tool-approval-request` | `{ toolCallId, toolName, args }` | Demande approval |
| `stream-end` | `{ usage, cost, fullText }` | Fin de stream |
| `error` | `{ message, code }` | Erreur |
| `pong` | `{}` | Reponse heartbeat |
| `conversations-list` | `{ conversations: [...] }` | Liste conversations |
| `history` | `{ messages: [...] }` | Historique messages |
| `status-changed` | `{ status: RemoteStatus }` | Changement de statut |
| `session-expired` | `{ reason }` | Session expiree |

### 4.4 Gestion des erreurs

```
Deconnexion WebSocket :
  → Client : auto-reconnect avec backoff exponentiel (1s → 30s)
  → Si session token valide : reconnexion transparente (pas de re-pairing)
  → Si session expiree : retour a l'ecran de pairing

Erreur serveur :
  → { type: "error", code: "RATE_LIMITED", message: "Trop de requetes" }
  → { type: "error", code: "SESSION_EXPIRED", message: "Session expiree" }
  → { type: "error", code: "STREAM_IN_PROGRESS", message: "Un stream est deja en cours" }
  → { type: "error", code: "INVALID_TOKEN", message: "Token invalide" }
```

---

## 5. Backend Desktop — RemoteServerService

### 5.1 Service (singleton)

```
src/main/services/remote-server.service.ts

RemoteServerService extends EventEmitter {
  // Config
  private port: number = 9877  // Port par defaut (configurable)
  private bindAddress: string = '127.0.0.1'  // Localhost par defaut

  // TLS
  private tlsCert: Buffer | null
  private tlsKey: Buffer | null

  // Serveurs
  private httpsServer: https.Server | null
  private wss: WebSocketServer | null

  // Sessions
  private clients: Map<string, { ws: WebSocket, sessionToken: string, fingerprint: string }>
  private pairingState: { code: string, expiry: number, attempts: number } | null

  // Rate limiting
  private rateLimiter: Map<string, { count: number, resetAt: number }>

  // Lifecycle
  async init(mainWindow: BrowserWindow): Promise<void>
  async start(): Promise<{ port: number, url: string }>
  async stop(): Promise<void>

  // Pairing
  generatePairingCode(): { code: string }
  verifyPairingCode(code: string, fingerprint: string): { sessionToken: string } | { error: string }

  // Messaging
  broadcastToClients(message: object): void
  sendToClient(clientId: string, message: object): void

  // TLS
  private generateSelfSignedCert(): { cert: Buffer, key: Buffer }
  private loadOrCreateCert(): void
}
```

### 5.2 Serveur HTTP statique

```
Le meme serveur HTTPS sert :
  GET /              → index.html (SPA React)
  GET /assets/*      → JS/CSS bundles
  GET /manifest.json → PWA manifest
  GET /sw.js         → Service Worker (shell offline)
  UPGRADE /ws        → WebSocket handshake
  GET /health        → { status: "ok", version: "1.0" }
```

Les fichiers statiques du client web sont embarques dans le build Electron (extraResources ou bundled).

### 5.3 Integration avec handleChatMessage()

```typescript
// Extension de handleChatMessage (existant)

export async function handleChatMessage(params: {
  content: string
  source: 'desktop' | 'telegram' | 'websocket'  // +websocket
  conversationId: string
  // ...
})

// Dual/tri-forward dans onChunk :
if (isRemoteWsConnected) {
  remoteServerService.broadcastToClients({ type: 'text-delta', content })
}
if (isRemoteTelegramConnected) {
  telegramBotService.pushChunk(content)
}
win.webContents.send('chat:chunk', ...)  // Desktop toujours
```

### 5.4 Tool Approval Gate (WebSocket)

```
Meme pattern que Telegram, adapte WebSocket :

1. LLM appelle outil (ex: writeFile)
2. Si auto-approve → executer immediatement + notifier client
3. Sinon → envoyer { type: "tool-approval-request", toolCallId, toolName, args }
4. Creer Promise en attente (Map<toolCallId, { resolve, timer }>)
5. Client affiche card avec [Approve] [Deny]
6. Client envoie { type: "tool-approval-response", toolCallId, approved: true }
7. Serveur resout Promise → outil execute ou rejete
8. Timeout 5 min → auto-deny
```

---

## 6. Client Web — SPA React

### 6.1 Stack client

```
React 19 (meme version que desktop)
TypeScript
Tailwind CSS 4
Vite (build)
~200KB gzip total

Zero dependance lourde :
  → Pas de state manager (useState/useReducer suffisent)
  → Pas de router (3 ecrans, conditional render)
  → Pas de markdown heavy (marked.js ~30KB ou simple renderer)
  → WebSocket natif (pas de socket.io)
```

### 6.2 Ecrans

#### PairingScreen
```
┌─────────────────────────────────┐
│                                  │
│     🔗 Multi-LLM Remote        │
│                                  │
│   Entrez le code de pairing :   │
│                                  │
│   ┌──┬──┬──┬──┬──┬──┐          │
│   │ 1│ 2│ 3│ 4│ 5│ 6│          │
│   └──┴──┴──┴──┴──┴──┘          │
│                                  │
│   [ Se connecter ]               │
│                                  │
│   Code visible sur le desktop   │
│   dans Settings > Remote        │
│                                  │
└─────────────────────────────────┘
```

- Input 6 digits avec auto-focus + auto-submit
- Affichage erreurs (code invalide, expire, max tentatives)
- Animation connexion en cours

#### ChatView
```
┌─────────────────────────────────┐
│ 🟢 Connecte │ GPT-4o │ Conv... │  ← StatusBar
│─────────────────────────────────│
│                                  │
│  User: Comment optimiser ce...  │
│                                  │
│  ┌─ Reasoning ─────────────┐   │  ← Collapsible
│  │ Je vais analyser le...   │   │
│  └──────────────────────────┘   │
│                                  │
│  Assistant: Voici mon analyse   │
│  ...streaming en cours ▍        │
│                                  │
│  ┌─ Tool: readFile ────────┐   │  ← Tool call
│  │ src/main/index.ts       │   │
│  │ ✓ Auto-approved         │   │
│  └──────────────────────────┘   │
│                                  │
│  ┌─ Tool: writeFile ───────┐   │  ← Approval
│  │ src/main/router.ts      │   │
│  │ [Approve] [Deny]        │   │
│  └──────────────────────────┘   │
│                                  │
│─────────────────────────────────│
│ ┌───────────────────────┐ [➤]  │  ← InputZone
│ │ Votre message...      │       │
│ └───────────────────────┘       │
└─────────────────────────────────┘
```

- Messages en streaming (text-delta applique char par char)
- Blocs de raisonnement collapsibles
- Tool calls avec status (pending, approved, denied, completed)
- Tool approval cards interactives
- Markdown basique (code blocks, gras, italique, listes)
- Auto-scroll + scroll-to-bottom button
- Indicateur de streaming (curseur ▍)

#### StatusBar
```
[●/○ status] | [modele actif] | [conversation] | [⚙ settings]
```

- Dot vert (connecte) / rouge (deconnecte) / orange (reconnexion)
- Nom du modele actif (lecture seule)
- Nom de la conversation + selecteur
- Bouton settings (auto-approve toggles)

### 6.3 PWA

```json
// manifest.json
{
  "name": "Multi-LLM Remote",
  "short_name": "LLM Remote",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#3b82f6",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- Installable depuis Chrome/Safari (Add to Home Screen)
- Service Worker : cache le shell (HTML/JS/CSS), pas les donnees
- Offline : affiche "Desktop non disponible" avec bouton retry

### 6.4 WebSocket Manager (client)

```typescript
class WebSocketManager {
  private ws: WebSocket | null
  private sessionToken: string | null
  private reconnectDelay: number = 1000
  private maxReconnectDelay: number = 30000
  private heartbeatInterval: NodeJS.Timer | null

  connect(url: string): void
  disconnect(): void
  send(message: object): void

  // Auto-reconnect avec backoff exponentiel
  private scheduleReconnect(): void

  // Heartbeat toutes les 30s
  private startHeartbeat(): void

  // Events
  onMessage: (handler: (msg: ServerMessage) => void) => void
  onStatusChange: (handler: (status: 'connecting' | 'connected' | 'disconnected') => void) => void
}
```

---

## 7. Schema DB — Extensions

### Table remote_sessions (extension)

```sql
-- Ajout colonne type pour distinguer telegram vs websocket
ALTER TABLE remote_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'telegram';
-- Valeurs : 'telegram' | 'websocket'

-- Ajout colonnes specifiques websocket
ALTER TABLE remote_sessions ADD COLUMN ws_client_fingerprint TEXT;
ALTER TABLE remote_sessions ADD COLUMN ws_session_token TEXT;  -- Hash du token, pas le token brut
ALTER TABLE remote_sessions ADD COLUMN ws_ip_address TEXT;
```

### Table remote_server_config (nouvelle, Settings)

```sql
CREATE TABLE IF NOT EXISTS remote_server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Cles :
-- 'port' : '9877'
-- 'bind_address' : '127.0.0.1'
-- 'tls_cert' : encrypted(cert PEM)
-- 'tls_key' : encrypted(key PEM)
-- 'enabled' : 'true' | 'false'
```

---

## 8. IPC Desktop — Nouveaux handlers

```typescript
// remote-server.ipc.ts (nouveau)

ipcMain.handle('remote-server:start', async () => { ... })
ipcMain.handle('remote-server:stop', async () => { ... })
ipcMain.handle('remote-server:get-config', async () => {
  return {
    enabled: boolean,
    port: number,
    bindAddress: string,
    isRunning: boolean,
    connectedClients: number,
    url: string | null  // https://192.168.1.x:9877
  }
})
ipcMain.handle('remote-server:set-config', async (_, config) => { ... })
ipcMain.handle('remote-server:generate-pairing', async (_, conversationId?) => {
  return { code: string, url: string }  // url = https://ip:port
})
ipcMain.handle('remote-server:disconnect-client', async (_, clientId) => { ... })
ipcMain.handle('remote-server:get-clients', async () => {
  return { clients: [{ id, ip, userAgent, connectedAt, lastActivity }] }
})

// Events push
win.webContents.send('remote-server:client-connected', { clientId, ip })
win.webContents.send('remote-server:client-disconnected', { clientId })
win.webContents.send('remote-server:status-changed', { status, connectedClients })
```

---

## 9. UI Desktop — Settings > Remote (extensions)

### Tab Remote etendu

```
┌─────────────────────────────────────────────────┐
│ Remote                                           │
│                                                  │
│ ── Telegram Bot ─────────────────────────────── │
│ [Configuration existante...]                     │
│                                                  │
│ ── Serveur Web Remote ──────────────────────── │
│                                                  │
│ Activer le serveur    [toggle]                   │
│ Port                  [9877        ]             │
│ Acces reseau          [Localhost / LAN]          │
│                                                  │
│ Statut : ● En cours (2 clients)                  │
│ URL : https://192.168.1.42:9877                  │
│                                                  │
│ Clients connectes :                              │
│ ┌────────────────────────────────────────────┐  │
│ │ Chrome macOS  │ 192.168.1.10 │ [Deconnecter]│ │
│ │ Safari iOS    │ 192.168.1.15 │ [Deconnecter]│ │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ [ Generer code de pairing ]                      │
│ Code : 847291 (expire dans 4:32)                 │
│ URL complete : https://192.168.1.42:9877         │
│ [Copier] [QR Code]                               │
│                                                  │
│ ── Approbation outils ──────────────────────── │
│ [Memes toggles que Telegram, partages]           │
│                                                  │
└─────────────────────────────────────────────────┘
```

### QR Code (bonus)

Generer un QR code contenant `https://192.168.1.42:9877?pair=847291` pour pairing rapide depuis mobile. Le code de pairing est inclus dans l'URL — auto-rempli a l'ouverture.

---

## 10. Plan d'implementation

### Phase 1 — Serveur WebSocket securise (backend desktop)

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 1.1 | Creer `RemoteServerService` (singleton, lifecycle) | `services/remote-server.service.ts` | M |
| 1.2 | Generation certificat TLS self-signed + stockage safeStorage | idem | S |
| 1.3 | Serveur HTTPS + WebSocket (`ws` library) | idem | M |
| 1.4 | Protocole pairing (code 6 digits, validation, session token) | idem | M |
| 1.5 | Rate limiter + brute force protection | idem | S |
| 1.6 | Session management (fingerprint, expiry, inactivite) | idem | M |
| 1.7 | Handlers IPC `remote-server:*` (8 handlers) | `ipc/remote-server.ipc.ts` | M |
| 1.8 | Preload bridge (8 methodes + events) | `preload/index.ts`, `types.ts` | S |
| 1.9 | Extension `remote_sessions` (colonne `session_type`) | `db/schema.ts`, `db/migrate.ts` | S |
| 1.10 | Integration `handleChatMessage()` (source 'websocket', tri-forward) | `ipc/chat.ipc.ts` | M |
| 1.11 | Tool approval gate via WebSocket | `services/remote-server.service.ts` | M |

**Dependance npm** : `ws` (WebSocket server, ~50KB, zero deps)

### Phase 2 — Client Web (SPA React)

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 2.1 | Setup projet Vite + React + Tailwind dans `src/remote-web/` | config Vite separee | S |
| 2.2 | WebSocket manager (connect, auth, reconnect, heartbeat) | `src/remote-web/ws-manager.ts` | M |
| 2.3 | PairingScreen (input 6 digits, validation, erreurs) | `src/remote-web/screens/Pairing.tsx` | S |
| 2.4 | ChatView (messages, streaming, auto-scroll) | `src/remote-web/screens/Chat.tsx` | L |
| 2.5 | Markdown renderer leger (code blocks, inline) | `src/remote-web/components/Markdown.tsx` | M |
| 2.6 | ReasoningBlock (collapsible, streaming) | `src/remote-web/components/Reasoning.tsx` | S |
| 2.7 | ToolCallCard (status, approval buttons) | `src/remote-web/components/ToolCall.tsx` | M |
| 2.8 | StatusBar (connexion, modele, conversation selector) | `src/remote-web/components/StatusBar.tsx` | S |
| 2.9 | PWA manifest + Service Worker | `public/manifest.json`, `public/sw.js` | S |
| 2.10 | Build integration (bundle dans extraResources Electron) | `electron.vite.config.ts`, `electron-builder.yml` | M |

### Phase 3 — UI Desktop + polish

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 3.1 | Section "Serveur Web Remote" dans Settings > Remote | `components/settings/RemoteTab.tsx` | M |
| 3.2 | QR code generation (pairing URL) | idem | S |
| 3.3 | Store `remote-server.store.ts` | `stores/remote-server.store.ts` | S |
| 3.4 | Badge dans ContextWindowIndicator (nombre clients WS) | `components/chat/ContextWindowIndicator.tsx` | S |
| 3.5 | Tests manuels (pairing, streaming, tool approval, reconnect) | - | M |
| 3.6 | Sanitization audit (SENSITIVE_PATTERNS sur tous les messages WS) | `remote-server.service.ts` | S |

### Estimation

- **Phase 1** : ~600-800 lignes (backend)
- **Phase 2** : ~1000-1200 lignes (client web)
- **Phase 3** : ~300-400 lignes (UI desktop)
- **Total** : ~2000-2400 lignes
- **Deps nouvelles** : `ws` uniquement

---

## 11. Considerations techniques

### Port et decouverte

```
Port par defaut : 9877 (configurable)
Si port occupe : auto-increment (9878, 9879...) jusqu'a trouver un libre
URL affichee dans Settings avec IP locale du reseau
mDNS/Bonjour optionnel (futur) pour decouverte auto
```

### Build du client web

```
Option A (recommandee) : Build Vite separe
  → src/remote-web/ compile vers dist/remote-web/
  → Copie dans extraResources a la build Electron
  → Servi par le HTTPS server integre

Option B : Bundle dans le main process
  → Import statique des fichiers HTML/JS
  → Plus simple mais moins flexible
```

### Limites connues

- **Certificat self-signed** : le navigateur affichera un avertissement. L'utilisateur doit accepter manuellement. Pas de contournement sans CA local ou Let's Encrypt (impossible en local).
- **Pas de HTTPS sur localhost** : certains navigateurs modernes bloquent les features (clipboard, notifications) sur HTTP. TLS necessaire meme en localhost.
- **WebSocket derriere proxy** : certains proxys d'entreprise bloquent les WebSockets. Fallback HTTP long-polling a envisager (futur).
- **Multi-clients** : le serveur accepte plusieurs clients WS simultanement, mais une seule conversation active. Les messages de tous les clients arrivent dans la meme conversation.

### Compatibilite Telegram

```
Telegram et WebSocket coexistent :
  → Deux services independants (TelegramBotService + RemoteServerService)
  → handleChatMessage() gere les 3 sources
  → Les chunks sont forward a TOUS les remotes connectes
  → Tool approval : le PREMIER remote qui repond gagne
  → Si conflit (Telegram approve, WS deny) : premier arrive sert
```

---

## 12. Securite — Resume

| Couche | Protection | Contre |
|--------|-----------|--------|
| TLS | Chiffrement transport | Sniffing reseau, MITM |
| Binding localhost | Isolation reseau | Acces externe non desire |
| Pairing code | Auth initiale | Connexion non autorisee |
| Session token + fingerprint | Auth continue | Vol de session, replay |
| Rate limiting | Anti brute force | Attaque par force brute |
| Inactivite timeout | Nettoyage auto | Session oubliee |
| Sanitization | Masquage donnees | Fuite de secrets |
| CORS restrictif | Isolation origine | Cross-site attacks |

**Principe** : defense en profondeur. Chaque couche est independante. Meme si une couche est contournee, les autres protegent.
