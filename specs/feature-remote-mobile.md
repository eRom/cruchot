# Feature Spec — Remote Mobile App

> Version 1.0 — 2026-03-11
> Prerequis : Remote Web (WebSocket server) implemente sur le desktop

## 1. Vision

Application mobile native permettant de controler l'app desktop a distance depuis un smartphone. **Zero intelligence cote mobile** — le desktop reste le cerveau (LLM, outils, DB, cles API). L'app mobile est un terminal d'entree/sortie securise avec streaming temps reel, notifications push, et UX tactile optimisee.

### Pourquoi une app native ?

- **Notifications push** : alertes quand le LLM attend une approbation d'outil
- **Background** : maintien de connexion en arriere-plan (contrairement au web)
- **UX tactile** : gestures, haptic feedback, clavier natif optimise
- **Biometrie** : Face ID / Touch ID pour securiser l'acces
- **QR scanner integre** : pairing instantane via camera

### Rapport avec le Remote Web

L'app mobile et le client web **partagent le meme backend** (RemoteServerService + WebSocket). Le protocole est identique. La difference est uniquement cote client :

```
Desktop
  └── RemoteServerService (WebSocket server + HTTPS)
        ├── Client Web (SPA navigateur)      ← spec feature-remote-web.md
        └── Client Mobile (React Native)     ← CE DOCUMENT
```

### Non-goals

- Pas de mode offline fonctionnel (le desktop doit etre allume)
- Pas de stockage local de conversations (tout est sur le desktop)
- Pas d'appels LLM cote mobile
- Pas de multi-utilisateur
- Pas de publication App Store / Play Store (distribution TestFlight / APK sideload pour le moment)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESKTOP (Electron)                            │
│                    === Cerveau ===                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ RemoteServerService (partage avec web client)            │   │
│  │  ├── HTTPS + WSS server                                  │   │
│  │  ├── Auth (pairing + session token)                      │   │
│  │  ├── Protocol WebSocket (JSON bidirectionnel)            │   │
│  │  └── Push notification relay (optionnel, via APNs/FCM)  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            ↕                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ handleChatMessage() (existant)                           │   │
│  │  ├── source: 'desktop' | 'telegram' | 'websocket'       │   │
│  │  ├── Forward chunks → tous les remotes connectes         │   │
│  │  └── Tool approval gate                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                    ↕ WSS (TLS + Auth)
┌─────────────────────────────────────────────────────────────────┐
│               APP MOBILE (React Native)                         │
│              === Terminal I/O securise ===                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React Native + Expo                                     │   │
│  │  ├── QRScannerScreen (pairing via camera)                │   │
│  │  ├── PairingScreen (saisie manuelle code 6 digits)       │   │
│  │  ├── ChatScreen (messages, streaming, markdown, tools)   │   │
│  │  ├── ToolApprovalSheet (bottom sheet, approve/deny)      │   │
│  │  ├── ConversationPicker (liste conversations)            │   │
│  │  ├── SettingsScreen (auto-approve, biometrie, theme)     │   │
│  │  └── WebSocket manager (reconnect, background, keepalive)│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Aucun LLM, aucun outil, aucune cle API, aucune DB lourde      │
│  Stockage local : session token + preferences uniquement        │
└─────────────────────────────────────────────────────────────────┘
```

### Flux de donnees

```
User (smartphone)
  → tape message dans ChatScreen
  → WebSocket send({ type: "user-message", content: "...", sessionToken })
  → Desktop recoit via RemoteServerService
  → handleChatMessage(content, source='websocket', conversationId)
  → streamText() + tool approval gate
  → onChunk: forward vers tous les remotes
    ├── { type: "text-delta", content: "..." }
    ├── { type: "reasoning-delta", content: "..." }
    ├── { type: "tool-call", toolCallId, toolName, args }
    ├── { type: "tool-result", toolCallId, result }
    └── { type: "tool-approval-request", toolCallId, toolName, args }
  → App affiche en temps reel (streaming natif)
  → Tool approval : bottom sheet avec [Approve] [Deny]
  → send({ type: "tool-approval-response", toolCallId, approved })
  → Desktop resout → outil execute ou rejete
```

---

## 3. Securite — 7 couches

L'app mobile herite des 5 couches du Remote Web (TLS, binding, pairing, session token, rate limiting) et ajoute 2 couches supplementaires.

### Couches 1-5 : Identiques au Remote Web

| # | Couche | Description |
|---|--------|-------------|
| 1 | TLS obligatoire | Certificat self-signed du desktop, cert pinning cote app |
| 2 | Binding reseau | Localhost par defaut, LAN opt-in |
| 3 | Pairing code | 6 digits, 5 min, 5 tentatives max |
| 4 | Session token | Cryptographiquement aleatoire, lie au fingerprint device |
| 5 | Rate limiting | IP-based, brute force protection |

### Couche 6 : Certificate Pinning (mobile-specific)

```
Premier pairing reussi :
  → L'app stocke le hash SHA-256 du certificat TLS du desktop
  → Toutes les connexions futures verifient ce pin
  → Si le certificat change (regenere, MITM) → connexion refusee
  → L'utilisateur doit re-pairer explicitement pour accepter un nouveau cert

Implementation :
  → React Native : TrustKit ou custom SSL pinning via fetch interceptor
  → Stockage du pin : Keychain (iOS) / Keystore (Android) — chiffre hardware
```

**Garantie** : Meme sur un reseau hostile (WiFi public), un attaquant MITM ne peut pas intercepter les communications.

### Couche 7 : Biometrie locale (mobile-specific)

```
Ecran verrouillage app :
  → Face ID / Touch ID (iOS) ou Fingerprint / Face Unlock (Android)
  → Active par defaut, desactivable dans Settings
  → Requis a chaque ouverture de l'app (pas en background resume < 5 min)
  → Fallback : code PIN app (4-6 digits, different du pairing)

Stockage securise :
  → Session token stocke dans Keychain (iOS) / Keystore (Android)
  → Pas dans AsyncStorage (pas chiffre)
  → Pas dans le state React (perdu au kill app)
```

**Garantie** : Si le telephone est perdu/vole, l'acces a l'app est protege par biometrie.

### Sanitization

Identique au Remote Web — les `SENSITIVE_PATTERNS` sont appliques cote desktop AVANT envoi sur le WebSocket.

---

## 4. Stack technique mobile

### Framework

```
React Native 0.76+ (New Architecture)
Expo SDK 52+
TypeScript 5.7

Justification React Native (pas Flutter, pas SwiftUI/Kotlin) :
  → Meme langage que le desktop (TypeScript/React)
  → Partage de types avec le protocole WebSocket
  → Un seul codebase pour iOS + Android
  → Expo simplifie le build/deploy (EAS Build)
  → Romain connait deja React
```

### Dependances minimales

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "react-native": "0.76.x",
    "expo-camera": "~16.0.0",          // QR scanner
    "expo-local-authentication": "~15.0.0",  // Face ID / Touch ID
    "expo-secure-store": "~14.0.0",    // Keychain/Keystore
    "expo-haptics": "~14.0.0",         // Retour haptique
    "expo-notifications": "~0.30.0",   // Push notifications locales
    "react-native-reanimated": "~3.16.0",  // Animations fluides
    "@gorhom/bottom-sheet": "^5.0.0",  // Bottom sheets natifs
    "react-native-markdown-display": "^7.0.0"  // Markdown rendering
  }
}
```

**Zero dependance** pour WebSocket : React Native inclut `WebSocket` natif.

### Structure projet

```
mobile/
  app/                          # Expo Router (file-based routing)
    (auth)/
      scan.tsx                  # QR scanner
      pair.tsx                  # Saisie manuelle code
    (main)/
      chat.tsx                  # Chat principal
      conversations.tsx         # Liste conversations
      settings.tsx              # Preferences
    _layout.tsx                 # Root layout + auth guard
  components/
    MessageBubble.tsx           # Message utilisateur/assistant
    StreamingText.tsx           # Texte en cours de streaming
    ReasoningBlock.tsx          # Bloc raisonnement collapsible
    ToolCallCard.tsx            # Card outil (status + result)
    ToolApprovalSheet.tsx       # Bottom sheet approve/deny
    StatusHeader.tsx            # Barre status connexion
    MarkdownRenderer.tsx        # Markdown natif
  services/
    ws-manager.ts              # WebSocket manager
    auth.ts                    # Pairing, session, biometrie
    cert-pinning.ts            # Certificate pinning
    notifications.ts           # Push notifications locales
  stores/
    connection.store.ts         # Status connexion (zustand)
    chat.store.ts               # Messages, streaming state
    settings.store.ts           # Preferences locales
  types/
    protocol.ts                 # Types partages avec le desktop
  app.json                      # Config Expo
  eas.json                      # Config EAS Build
```

---

## 5. Protocole WebSocket

**Identique au Remote Web** (voir `feature-remote-web.md` section 4). L'app mobile utilise exactement les memes types de messages. Aucune extension specifique mobile dans le protocole.

Messages supplementaires optionnels (mobile-specific, phase future) :

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `push-token` | Client → Serveur | `{ token: string, platform: 'ios' \| 'android' }` | Enregistrer token push |
| `notification` | Serveur → Client | `{ title, body, data }` | Notification (si app en background) |

---

## 6. Ecrans et UX mobile

### 6.1 QRScannerScreen (pairing rapide)

```
┌──────────────────────────┐
│       ← Retour           │
│                          │
│  ┌────────────────────┐  │
│  │                    │  │
│  │    [Camera view]   │  │
│  │                    │  │
│  │   ┌──────────┐    │  │
│  │   │ QR frame │    │  │
│  │   └──────────┘    │  │
│  │                    │  │
│  └────────────────────┘  │
│                          │
│  Scannez le QR code      │
│  affiche sur le desktop  │
│                          │
│  Ou saisir le code       │
│  manuellement →          │
│                          │
└──────────────────────────┘
```

- Camera native via `expo-camera`
- Detection QR code automatique
- Le QR contient : `https://IP:PORT?pair=CODE`
- Parse URL → extraction IP + port + code → connexion automatique
- Haptic feedback au scan reussi
- Lien vers saisie manuelle si camera indisponible

### 6.2 PairingScreen (saisie manuelle)

```
┌──────────────────────────┐
│       ← Retour           │
│                          │
│  🔗 Multi-LLM Remote    │
│                          │
│  Adresse du desktop :    │
│  ┌────────────────────┐  │
│  │ 192.168.1.42:9877  │  │
│  └────────────────────┘  │
│                          │
│  Code de pairing :       │
│  ┌──┬──┬──┬──┬──┬──┐    │
│  │ _│ _│ _│ _│ _│ _│    │
│  └──┴──┴──┴──┴──┴──┘    │
│                          │
│  [ Se connecter ]        │
│                          │
│  Historique :             │
│  ● 192.168.1.42 (hier)  │
│  ○ 10.0.0.5 (il y a 3j)│
│                          │
└──────────────────────────┘
```

- Input numerique 6 digits avec auto-focus inter-champs
- Champ adresse avec historique (derniers 5 desktops connectes)
- Validation en temps reel (format IP:port)
- Bouton "Se connecter" actif quand les 2 champs remplis
- Stockage adresses recentes dans SecureStore
- Auto-submit quand 6eme digit saisi

### 6.3 ChatScreen (ecran principal)

```
┌──────────────────────────┐
│ ● Connecte  GPT-4o   ⚙  │  ← StatusHeader (safe area)
│──────────────────────────│
│ Conv: Refactoring auth   │  ← Conversation selector (tap to switch)
│──────────────────────────│
│                          │
│  ┌─ You ───────────────┐ │
│  │ Optimise le fichier  │ │
│  │ router.ts            │ │
│  └──────────────────────┘ │
│                          │
│  ┌─ Reasoning ──── ▾ ──┐ │  ← Tap to collapse/expand
│  │ Je vais analyser... │ │
│  └──────────────────────┘ │
│                          │
│  ┌─ readFile ──────────┐ │  ← ToolCall auto-approved
│  │ ✓ src/main/router.ts│ │
│  └──────────────────────┘ │
│                          │
│  ┌─ writeFile ─────────┐ │  ← ToolCall needs approval
│  │ ⏳ En attente...     │ │
│  │ src/main/router.ts   │ │
│  │ [Voir details]       │ │
│  └──────────────────────┘ │
│                          │
│  ┌─ Assistant ─────────┐ │
│  │ Voici les changem... │ │
│  │ ...streaming ▍       │ │
│  └──────────────────────┘ │
│                          │
│──────────────────────────│
│ ┌──────────────────┐ [➤]│  ← InputBar (keyboard-aware)
│ │ Message...       │    │
│ └──────────────────┘    │
└──────────────────────────┘
```

**Comportements :**

- **FlatList** inversee (messages les plus recents en bas, scroll performant)
- **Streaming** : texte apparait caractere par caractere (text-delta)
- **Markdown** : rendu natif (code blocks avec syntax highlighting basique, listes, gras, liens)
- **Reasoning blocks** : collapsibles, fond different, tap to toggle
- **Tool calls** : cards colorees par type (vert auto-approve, orange pending, rouge denied)
- **Auto-scroll** : scroll to bottom pendant streaming, bouton fleche si l'utilisateur a scroll up
- **Haptic feedback** : vibration legere sur reception tool-approval-request
- **Keyboard-aware** : InputBar remonte avec le clavier (KeyboardAvoidingView)
- **Pull to refresh** : recharge l'historique recent

### 6.4 ToolApprovalSheet (bottom sheet)

```
┌──────────────────────────┐
│         ─────            │  ← Handle (drag to dismiss)
│                          │
│  ⚠ Approbation requise  │
│                          │
│  Outil : writeFile       │
│                          │
│  ┌────────────────────┐  │
│  │ path: src/main/    │  │  ← Args (scrollable, code block)
│  │   router.ts        │  │
│  │ content: "import..."│  │
│  │   (523 chars)      │  │
│  └────────────────────┘  │
│                          │
│  ┌────────┐ ┌─────────┐ │
│  │ Refuser│ │Approuver│ │  ← Boutons larges, tactiles
│  │  (gris)│ │  (bleu) │ │
│  └────────┘ └─────────┘ │
│                          │
│  Expire dans 4:32        │
│                          │
└──────────────────────────┘
```

- **Bottom sheet** natif (`@gorhom/bottom-sheet`) — geste de drag
- Affichage args tronques (500 chars max, expandable)
- Countdown timer visible (5 min)
- Haptic feedback a l'ouverture
- **Notification push locale** si app en background quand approval requis
- Auto-dismiss apres reponse ou expiration

### 6.5 ConversationPicker

```
┌──────────────────────────┐
│  Conversations     ✕     │
│──────────────────────────│
│ ● Refactoring auth       │  ← Active (dot bleu)
│   GPT-4o · il y a 5 min │
│──────────────────────────│
│ ○ Bug fix #42            │
│   Claude 4 · hier        │
│──────────────────────────│
│ ○ Feature MCP            │
│   Gemini · il y a 3j     │
│──────────────────────────│
```

- Liste des 20 dernieres conversations (via `get-conversations`)
- Tap pour switcher (via `switch-conversation`)
- Conversation active marquee visuellement
- Pull to refresh

### 6.6 SettingsScreen

```
┌──────────────────────────┐
│  Parametres       Done   │
│──────────────────────────│
│                          │
│  ── Connexion ────────── │
│  Desktop : 192.168.1.42  │
│  Status : ● Connecte     │
│  [ Se deconnecter ]      │
│                          │
│  ── Securite ─────────── │
│  Biometrie     [toggle]  │
│  Cert pinning  [toggle]  │
│                          │
│  ── Approbation outils ─ │
│  Lecture auto   [toggle]  │
│  Ecriture auto  [toggle]  │
│  Bash auto      [toggle]  │
│  Liste auto     [toggle]  │
│  MCP auto       [toggle]  │
│                          │
│  ── Apparence ────────── │
│  Theme sombre   [toggle]  │
│  Taille texte   [slider]  │
│                          │
│  ── Donnees ──────────── │
│  [ Supprimer les donnees ]│
│  [ Oublier ce desktop ]  │
│                          │
└──────────────────────────┘
```

---

## 7. Gestion de la connexion mobile

### 7.1 WebSocket Manager (mobile-specific)

```typescript
class MobileWebSocketManager {
  private ws: WebSocket | null
  private sessionToken: string | null
  private serverUrl: string | null

  // Connexion
  connect(url: string, sessionToken?: string): void
  disconnect(): void
  send(message: object): void

  // Auto-reconnect
  private reconnectDelay: number = 1000      // Backoff 1s → 30s
  private maxReconnectDelay: number = 30000
  private scheduleReconnect(): void

  // Heartbeat (plus frequent que web — reseau mobile instable)
  private heartbeatInterval: number = 15000  // 15s (vs 30s web)
  private startHeartbeat(): void

  // Background handling (mobile-specific)
  private handleAppStateChange(state: 'active' | 'background' | 'inactive'): void
  // → background : reduce heartbeat to 60s, keep WS alive (iOS BGTask)
  // → active : restore heartbeat 15s, flush message queue
  // → inactive : no change (transitional state)

  // Network change handling (mobile-specific)
  private handleNetworkChange(type: 'wifi' | 'cellular' | 'none'): void
  // → wifi → cellular : reconnect (IP change)
  // → none : pause reconnect, show offline UI
  // → cellular → wifi : reconnect (prefer wifi)

  // Events
  onMessage: (handler: (msg: ServerMessage) => void) => void
  onStatusChange: (handler: (status: ConnectionStatus) => void) => void
}
```

### 7.2 Lifecycle mobile

```
App lance :
  → Check biometrie (si active)
  → Load session token depuis SecureStore
  → Si token existe + server URL stocke :
      → Tenter reconnexion silencieuse (pas de re-pairing)
      → Si token expire : retour PairingScreen
  → Sinon : QRScannerScreen

App en background :
  → WebSocket reste ouvert (iOS BGTask, Android foreground service)
  → Heartbeat reduit a 60s
  → Si tool-approval-request recue → notification push locale
  → Si deconnexion > 5 min → session expiree au retour

App killee :
  → Session token persiste dans SecureStore
  → Au prochain lancement : reconnexion silencieuse

Changement reseau (WiFi → 4G) :
  → WebSocket ferme (IP change)
  → Reconnexion automatique vers le meme serveur
  → Session token valide → pas de re-pairing
```

### 7.3 Notifications push locales

```
Quand l'app est en background :
  → Tool approval requis → notification locale :
    Titre : "Approbation requise"
    Body : "L'outil writeFile demande votre accord"
    Action : ouvre l'app → ToolApprovalSheet

  → Stream termine → notification locale :
    Titre : "Reponse recue"
    Body : "L'assistant a termine sa reponse"

  → Deconnexion → notification locale :
    Titre : "Deconnecte"
    Body : "La connexion au desktop a ete perdue"
```

Pas de push distantes (APNs/FCM) pour le moment — ca necessiterait un serveur relais. Les notifications locales sont suffisantes car l'app maintient le WebSocket en background.

---

## 8. Streaming mobile — Optimisations

### 8.1 Performance rendering

```
Probleme : streaming token-par-token peut causer du lag sur mobile (re-render FlatList)

Solutions :
  1. Batching : accumuler 50ms de tokens avant re-render (requestAnimationFrame)
  2. Composant StreamingText isole : seul ce composant re-render, pas toute la FlatList
  3. Pas de Markdown pendant le streaming : rendu texte brut, Markdown applique a stream-end
  4. FlatList.getItemLayout : hauteurs fixes/estimees pour eviter les mesures dynamiques
  5. React.memo sur MessageBubble : eviter re-render des anciens messages
```

### 8.2 Reasoning et Tool phases

```
Pendant le stream, l'app affiche :

Phase reasoning (reasoning-delta) :
  → Bloc "Reflexion..." avec animation pulse
  → Texte de raisonnement en streaming (police reduite, couleur attenuee)
  → Collapsible (tap to expand/collapse)
  → A la fin du raisonnement : auto-collapse

Phase tool calls (tool-call + tool-result) :
  → Card tool empilee dans le flux de messages
  → Status : ⏳ En cours → ✓ Complete / ✗ Refuse
  → Si approval requis : bottom sheet auto-open + haptic
  → Resultat affiche inline (tronque, expandable)

Phase texte (text-delta) :
  → Streaming normal avec curseur ▍
  → Markdown rendu a la fin du stream
```

---

## 9. Differences cles avec le client web

| Aspect | Client Web | App Mobile |
|--------|-----------|-----------|
| Installation | Zero (navigateur) | APK / TestFlight |
| Pairing | Saisie manuelle code | QR code camera + manuel |
| Securite extra | Aucune | Biometrie + cert pinning |
| Background | Onglet ferme = deconnexion | WebSocket maintenu |
| Notifications | Aucune (tab inactive) | Push locales |
| Heartbeat | 30s | 15s (reseau mobile instable) |
| Network change | Rare (WiFi fixe) | Frequent (WiFi ↔ 4G) |
| Tool approval | Card inline | Bottom sheet natif + haptic |
| Streaming perf | DOM (performant) | FlatList (batching requis) |
| Markdown | HTML natif | React Native components |
| Stockage token | sessionStorage | Keychain/Keystore chiffre |
| Theme | CSS variables | React Native StyleSheet |

---

## 10. Plan d'implementation

### Phase 0 — Prerequis

> Le RemoteServerService (WebSocket server) doit etre implemente cote desktop (spec feature-remote-web.md, Phase 1). L'app mobile se branche dessus.

### Phase 1 — Setup + Auth (fondations)

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 1.1 | Init projet Expo (`npx create-expo-app`) + config TypeScript | `mobile/` | S |
| 1.2 | Types partages protocole WebSocket (copie depuis desktop) | `mobile/types/protocol.ts` | S |
| 1.3 | WebSocket manager mobile (connect, auth, reconnect, heartbeat, background, network) | `mobile/services/ws-manager.ts` | L |
| 1.4 | Auth service (pairing, session token, SecureStore, biometrie) | `mobile/services/auth.ts` | M |
| 1.5 | Certificate pinning (SHA-256 pin, validation) | `mobile/services/cert-pinning.ts` | M |
| 1.6 | QRScannerScreen (expo-camera, parse URL pairing) | `mobile/app/(auth)/scan.tsx` | M |
| 1.7 | PairingScreen (input 6 digits, historique adresses) | `mobile/app/(auth)/pair.tsx` | S |
| 1.8 | Auth guard layout (biometrie + redirect) | `mobile/app/_layout.tsx` | S |

### Phase 2 — Chat + Streaming

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 2.1 | Stores Zustand (connection, chat, settings) | `mobile/stores/*.ts` | M |
| 2.2 | ChatScreen layout (FlatList inversee, InputBar keyboard-aware) | `mobile/app/(main)/chat.tsx` | L |
| 2.3 | MessageBubble (user/assistant, memo) | `mobile/components/MessageBubble.tsx` | M |
| 2.4 | StreamingText (batching 50ms, curseur ▍) | `mobile/components/StreamingText.tsx` | M |
| 2.5 | MarkdownRenderer natif (code blocks, listes, inline) | `mobile/components/MarkdownRenderer.tsx` | M |
| 2.6 | ReasoningBlock (collapsible, animated, auto-collapse) | `mobile/components/ReasoningBlock.tsx` | S |
| 2.7 | ToolCallCard (status, resultat tronque) | `mobile/components/ToolCallCard.tsx` | M |
| 2.8 | StatusHeader (connexion, modele, conversation) | `mobile/components/StatusHeader.tsx` | S |

### Phase 3 — Tool Approval + UX

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 3.1 | ToolApprovalSheet (bottom sheet, countdown, haptic) | `mobile/components/ToolApprovalSheet.tsx` | M |
| 3.2 | Notifications push locales (tool approval, stream end) | `mobile/services/notifications.ts` | M |
| 3.3 | ConversationPicker (liste, switch) | `mobile/app/(main)/conversations.tsx` | S |
| 3.4 | SettingsScreen (biometrie, approvals, theme, deconnexion) | `mobile/app/(main)/settings.tsx` | M |
| 3.5 | App state handling (background/active, network change) | `mobile/services/ws-manager.ts` | M |

### Phase 4 — Polish + Distribution

| # | Tache | Fichiers | Effort |
|---|-------|----------|--------|
| 4.1 | Theme sombre/clair (match desktop) | styles | M |
| 4.2 | Animations (reanimated — transitions, sheet, skeleton) | composants | M |
| 4.3 | Config EAS Build (iOS + Android) | `eas.json` | S |
| 4.4 | TestFlight (iOS) + APK sideload (Android) | CI config | M |
| 4.5 | Icone app + splash screen | assets | S |
| 4.6 | Tests manuels (pairing, streaming, approval, background, network) | - | L |

### Estimation

- **Phase 1** : ~800-1000 lignes
- **Phase 2** : ~1200-1500 lignes
- **Phase 3** : ~600-800 lignes
- **Phase 4** : ~400-500 lignes
- **Total** : ~3000-3800 lignes
- **Deps nouvelles** : Expo SDK + ~8 packages (voir section 4)

---

## 11. Considerations techniques

### Depot Git

```
Option A (recommandee) : Monorepo
  cruchot/
    src/          ← Desktop Electron
    mobile/       ← App React Native
    shared/       ← Types protocole partages (symlink ou package)

Option B : Repo separe
  cruchot/        ← Desktop
  app-mobile-llmx-remote/  ← Mobile
  → Partage types via npm package prive ou copie manuelle
```

**Recommandation** : Option A (monorepo). Simplifie le partage de types et la synchronisation du protocole WebSocket.

### Certificat self-signed sur mobile

```
Probleme : iOS et Android refusent les connexions HTTPS vers des certs self-signed

Solutions :
  1. NSAppTransportSecurity (iOS) : exception pour IP locales (Info.plist)
  2. Network Security Config (Android) : trust user-installed certs (xml config)
  3. Custom TLS validation dans le WebSocket manager (cert pinning explicite)

Ces configs sont necessaires UNIQUEMENT pour le dev/sideload.
En production (si App Store un jour) : il faudrait un vrai certificat ou un tunnel.
```

### Performance WebSocket sur mobile

```
- Buffer size : limiter a 1MB par message (fragmenter si necessaire)
- Compression : wsPerMessageDeflate optionnel (economise bande passante mobile)
- Reconnection : plus aggressif que web (reseau mobile instable)
- Offline queue : stocker les messages non envoyes, flush a la reconnexion
```

### Distribution

```
Phase initiale (dev) :
  → iOS : TestFlight (gratuit, max 100 testeurs internes)
  → Android : APK direct (sideload)

Phase future (si pertinent) :
  → iOS : App Store (99$/an Apple Developer Program)
  → Android : Play Store (25$ one-time)
  → Necessite : politique de confidentialite, review Apple/Google
```

---

## 12. Securite — Resume

| Couche | Protection | Contre | Specifique mobile |
|--------|-----------|--------|-------------------|
| TLS | Chiffrement transport | Sniffing, MITM | Non |
| Binding localhost | Isolation reseau | Acces externe | Non |
| Pairing code | Auth initiale | Connexion non autorisee | Non |
| Session token | Auth continue | Vol de session | Non |
| Rate limiting | Anti brute force | Force brute | Non |
| **Cert pinning** | Verification certificat | MITM sophistique | **Oui** |
| **Biometrie** | Verrouillage app | Vol telephone | **Oui** |
| Inactivite timeout | Nettoyage auto | Session oubliee | Non |
| Sanitization | Masquage donnees | Fuite de secrets | Non |
| **SecureStore** | Stockage chiffre | Extraction token | **Oui** |

---

## 13. Comparaison des 3 remotes

| Aspect | Telegram | Web | Mobile |
|--------|---------|-----|--------|
| Transport | Telegram Bot API (HTTPS) | WebSocket direct | WebSocket direct |
| Serveur requis | Telegram (cloud) | Desktop (local) | Desktop (local) |
| Installation client | Zero (Telegram existant) | Zero (navigateur) | APK / TestFlight |
| Latence | ~200-500ms (via Telegram) | ~10-50ms (LAN direct) | ~10-50ms (LAN direct) |
| Streaming | Hack editMessage (debounce 500ms) | WebSocket natif (temps reel) | WebSocket natif (temps reel) |
| Tool approval | Inline keyboard Telegram | Card HTML interactive | Bottom sheet natif + haptic |
| Background | Telegram gere | Impossible (tab inactive) | WebSocket maintenu + notifs |
| Securite | Token + pairing + userId | TLS + pairing + token + rate limit | +cert pinning + biometrie |
| Offline | Telegram stocke messages | Rien | Token persiste, reconnexion auto |
| Setup effort | Bot token + userId | Demarre un serveur | Installe une app |
| Cas d'usage ideal | Quick & dirty, deja sur Telegram | Acces depuis n'importe quel PC | Usage regulier, mobilite |
