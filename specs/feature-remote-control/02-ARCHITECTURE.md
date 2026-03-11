# Remote Control — Architecture

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Architecture globale

```
┌──────────────────┐         HTTPS (outgoing only)          ┌─────────────────┐
│   Desktop App    │ ←──── getUpdates (long polling) ──────→│                 │
│   (Electron)     │ ─────── sendMessage ──────────────────→│  Telegram Bot   │
│                  │ ─────── editMessageText ──────────────→│  API Servers    │
│  ┌────────────┐  │ ←────── callback_query ───────────────→│                 │
│  │ Telegram   │  │                                        │                 │
│  │ Bot Service│  │                                        └────────┬────────┘
│  └────────────┘  │                                                 │
│       ↕ IPC      │                                                 │ Telegram
│  ┌────────────┐  │                                                 │ Protocol
│  │ Chat IPC   │  │                                                 │
│  │ (LLM)      │  │                                        ┌────────┴────────┐
│  └────────────┘  │                                        │   Telegram App  │
└──────────────────┘                                        │   (Mobile)      │
                                                            │                 │
                                                            │  Affichage chat │
                                                            │  Saisie texte   │
                                                            │  Boutons inline │
                                                            └─────────────────┘
```

## Pourquoi Telegram Bot API

| Critere | Telegram Bot API | WebSocket relay | Firebase/Supabase |
|---|---|---|---|
| Zero backend | **Oui** — Telegram = relay | Non — relay a heberger | Presque — service manage |
| Zero port entrant | **Oui** — long polling sortant | Oui | Oui |
| App mobile | **Deja installee** (1B+ users) | App custom a developper | App custom a developper |
| Cout | **Gratuit** | ~$5-20/mois | Free tier puis payant |
| Streaming | `editMessageText` ~1/sec | WebSocket natif temps reel | Temps reel |
| Approbations | **Inline keyboards natifs** | UI custom a implementer | UI custom |
| Fiabilite | **Infrastructure Telegram** | A gerer soi-meme | Dependance service |
| Complexite | **Faible** — HTTP REST API | Moyenne | Moyenne |

**Verdict** : Telegram Bot API est le choix pragmatique. Zero infra, zero cout, mobile deja installe. La seule concession est le streaming par edit (~1 msg/sec) au lieu du vrai temps reel, ce qui est acceptable pour du chat.

## Composants Desktop (nouveaux)

### 1. TelegramBotService (`src/main/services/telegram-bot.service.ts`)

Singleton — gestion du lifecycle du bot Telegram.

**Responsabilites** :
- Long polling `getUpdates` (boucle async)
- Pairing (code 6 chiffres + verification `chat_id`)
- Envoi de messages formates (MarkdownV2)
- Streaming LLM par `editMessageText` (debounce 500ms)
- Reception messages utilisateur → forward au chat handler
- Reception callback queries → approbation outils
- Gestion session (start/stop, timeout 10 min, reconnexion)

### 2. IPC Handlers (`src/main/ipc/remote.ipc.ts`)

~8 handlers :
- `remote:configure` — sauvegarder le token bot (safeStorage)
- `remote:start` — demarrer la session, generer code pairing
- `remote:stop` — arreter la session
- `remote:status` — etat courant (disconnected/pairing/connected)
- `remote:get-config` — recuporer la config (sans token)
- `remote:set-auto-approve` — configurer l'auto-approbation
- Status push : `remote:status-changed` (IPC event → renderer)

### 3. DB (extension schema existant)

Nouvelle table `remote_sessions` :
```sql
CREATE TABLE remote_sessions (
  id TEXT PRIMARY KEY,
  telegram_chat_id INTEGER,
  paired_at INTEGER,         -- timestamp
  last_activity INTEGER,     -- timestamp
  is_active INTEGER DEFAULT 1,
  auto_approve_read INTEGER DEFAULT 1,
  auto_approve_write INTEGER DEFAULT 0,
  auto_approve_bash INTEGER DEFAULT 0
);
```

Le token bot est stocke via `safeStorage` (comme les cles API), PAS en DB.

### 4. UI Settings (`components/settings/RemoteSettings.tsx`)

Nouveau sous-onglet dans Settings "Remote" :
- Input token bot (masque, safeStorage)
- Bouton Start/Stop
- Affichage code pairing (QR code optionnel)
- Status connexion (badge vert/rouge)
- Toggles auto-approve par type d'outil
- Historique sessions (derniere connexion, duree)

### 5. Integration Chat

Le flux chat existant est etendu, pas remplace :

```
Message Telegram entrant
    ↓
TelegramBotService.onMessage()
    ↓
Cree/reutilise une conversation dediee "Remote Session"
    ↓
Appelle le meme handler que chat:send (IPC interne)
    ↓
streamText() — onChunk forward AUSSI vers Telegram
    ↓
Reponse finale → sendMessage Telegram + save DB
```

## Flux de donnees detaille

### Envoi message (Mobile → Desktop → LLM)

```
[1] User tape "explique ce code" dans Telegram
[2] Telegram API stocke le message
[3] Desktop: getUpdates() recoit le message (long polling)
[4] TelegramBotService parse le message
[5] Forward vers chat handler (meme pipeline que InputZone)
[6] streamText() demarre
[7] Chunks IPC → renderer Desktop (si ouvert)
[8] Chunks → TelegramBotService.streamToTelegram()
[9] sendMessage() initial + editMessageText() toutes les 500ms
[10] Message final envoye avec le texte complet
[11] Usage/cout sauvegarde en DB
```

### Approbation outil (Tool Call → Telegram → Approve/Deny)

```
[1] LLM demande un tool call (ex: bash "npm test")
[2] onChunk tool-call → TelegramBotService
[3] Bot envoie un message formate :
    "🔧 bash: npm test"
    [✅ Approve] [❌ Deny]
[4] User tape [✅ Approve]
[5] Telegram envoie callback_query au bot
[6] Desktop: answerCallbackQuery() + execute le tool
[7] Resultat du tool → editMessage ou nouveau message
[8] LLM continue avec le resultat
```

### Streaming LLM (Desktop → Telegram)

```
[1] streamText() demarre
[2] TelegramBotService.startStreaming():
    - sendMessage("▍") → message_id initial
    - Buffer de tokens (accumulation)
[3] Toutes les 500ms :
    - editMessageText(message_id, buffer_accumule)
    - Si buffer > 3800 chars : finaliser ce message, en creer un nouveau
[4] Stream termine :
    - editMessageText(message_id, texte_final)  // sans curseur
    - Envoi usage/cout en message separé si configure
```

## Gestion de session

### Etats

```
DISCONNECTED → CONFIGURING → PAIRING → CONNECTED → EXPIRED
                                ↑                      │
                                └──────────────────────┘
                                    (reconnexion)
```

| Etat | Description |
|---|---|
| `DISCONNECTED` | Pas de token ou session stoppee |
| `CONFIGURING` | Token saisi, pas encore demarre |
| `PAIRING` | Code genere, en attente de `/pair CODE` |
| `CONNECTED` | Session active, messages bidirectionnels |
| `EXPIRED` | Timeout 10 min sans activite reseau |

### Reconnexion automatique

- Perte reseau : long polling echoue → retry avec backoff exponentiel (1s, 2s, 4s, 8s... max 60s)
- Desktop surveille `lastActivity` — si > 10 min sans reponse du serveur Telegram → `EXPIRED`
- Depuis `EXPIRED` : le user peut `/reconnect` ou le Desktop tente auto-reconnexion au retour reseau
- Le `chat_id` est persiste en DB — pas besoin de re-pairing apres expiration

### Conversation dediee

- Une conversation speciale `[Remote]` est creee dans la sidebar Desktop
- Elle est marquee avec un badge distinctif
- Les messages envoyes via Telegram y apparaissent en temps reel
- L'utilisateur peut aussi repondre depuis le Desktop (mais un seul "canal" actif)

## Dependances

### Nouvelles (npm)

Aucune bibliotheque tierce requise. L'API Telegram est un simple REST API HTTP :

```typescript
// Pas besoin de node-telegram-bot-api ou telegraf
// Simple fetch() suffit (built-in Node.js 18+)

const BASE = `https://api.telegram.org/bot${token}`

// Long polling
const updates = await fetch(`${BASE}/getUpdates?offset=${offset}&timeout=30`)

// Envoi message
await fetch(`${BASE}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id, text, parse_mode: 'MarkdownV2' })
})
```

### Existantes reutilisees

- `safeStorage` — stockage token bot
- `chat.ipc.ts` — pipeline LLM existant
- `workspace-tools.ts` — outils avec approbation
- Zustand store — nouveau `remote.store.ts`

## Limites techniques Telegram

| Limite | Valeur | Impact |
|---|---|---|
| Taille message | 4096 chars UTF-8 | Split messages longs |
| Rate send | 1 msg/sec par chat | Debounce streaming 500ms |
| Rate global | 30 msg/sec par bot | Non limitant (1 seul chat) |
| Rate edit | ~1/sec par message | Streaming par paliers |
| Taille fichier | 50 MB upload | Suffisant pour code |
| Inline keyboard | Max 8 boutons/ligne | 2 boutons (Approve/Deny) suffisent |
| Long polling timeout | Max 50 sec | Utiliser 30 sec |
| MarkdownV2 | Entities limitees | Pas de syntax highlighting natif |
