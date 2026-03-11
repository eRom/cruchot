# Remote Control — Protocole de communication

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Vue d'ensemble

Le protocole repose entierement sur l'**API Telegram Bot** (REST HTTPS). Aucun protocole custom, aucun WebSocket, aucun serveur intermediaire.

```
Desktop App ──(HTTPS sortant)──→ api.telegram.org ←──(Telegram protocol)── Mobile App
```

## Types de messages

### Desktop → Telegram (sortant)

| Type | Methode API | Usage |
|---|---|---|
| `llm_response` | `sendMessage` | Reponse complete du LLM |
| `llm_stream_start` | `sendMessage` | Debut de streaming (message avec curseur) |
| `llm_stream_update` | `editMessageText` | Mise a jour du streaming (debounce 500ms) |
| `llm_stream_end` | `editMessageText` | Fin de streaming (texte final sans curseur) |
| `tool_approval` | `sendMessage` + inline_keyboard | Demande d'approbation outil |
| `tool_result` | `sendMessage` | Resultat d'execution outil |
| `tool_auto_approved` | `sendMessage` | Notification auto-approbation |
| `session_info` | `sendMessage` | Reponse a /status, /model |
| `pairing_success` | `sendMessage` | Confirmation de pairing |
| `pairing_failed` | `sendMessage` | Echec de pairing |
| `session_expired` | `sendMessage` | Notification d'expiration |
| `error` | `sendMessage` | Erreur (LLM, reseau, outil) |
| `image` | `sendPhoto` | Image generee par le LLM |

### Telegram → Desktop (entrant via long polling)

| Type | Champ `update` | Usage |
|---|---|---|
| `user_message` | `message.text` (sans `/`) | Message utilisateur → LLM |
| `command` | `message.text` (avec `/`) | Commande bot (/pair, /stop, etc.) |
| `callback` | `callback_query.data` | Reponse approbation (approve/deny) |

## Format des callback_data

Les `callback_data` des inline keyboards suivent un format compact (max 64 bytes Telegram) :

```
action:identifier

Exemples :
  approve:tc_abc123     # Approuver le tool call tc_abc123
  deny:tc_abc123        # Refuser le tool call tc_abc123
```

## Sequence : Pairing

```
           Desktop                    Telegram API                    Mobile
              │                           │                             │
              │ remote:start              │                             │
              │ Genere code: 482917       │                             │
              │ Demarre long polling      │                             │
              │────getUpdates────────────→│                             │
              │                           │                             │
              │                           │          /pair 482917       │
              │                           │←────────────────────────────│
              │←──update(message)─────────│                             │
              │                           │                             │
              │ Verifie code              │                             │
              │ Sauve chat_id en DB       │                             │
              │                           │                             │
              │──sendMessage──────────────→│                             │
              │ "✅ Pairing reussi !"     │──────────────────────────→ │
              │                           │                             │
              │ Status → CONNECTED        │                             │
              │                           │                             │
```

## Sequence : Message utilisateur → LLM → Reponse

```
           Desktop                    Telegram API                    Mobile
              │                           │                             │
              │                           │     "explique ce code"      │
              │                           │←────────────────────────────│
              │←──update(message)─────────│                             │
              │                           │                             │
              │ Parse message             │                             │
              │ Forward → chat handler    │                             │
              │ streamText() demarre      │                             │
              │                           │                             │
              │──sendMessage("▍")────────→│──────────────────────────→ │
              │   (message_id: 42)        │                             │
              │                           │                             │
              │ [500ms] chunks accumules  │                             │
              │──editMessage(42, "La..")──→│──────────────────────────→ │
              │                           │                             │
              │ [500ms] plus de chunks    │                             │
              │──editMessage(42, "La f..")→│──────────────────────────→ │
              │                           │                             │
              │ stream termine            │                             │
              │──editMessage(42, final)──→│──────────────────────────→ │
              │                           │                             │
              │ Save DB (message + cost)  │                             │
              │                           │                             │
```

## Sequence : Approbation outil

```
           Desktop                    Telegram API                    Mobile
              │                           │                             │
              │ LLM tool-call: bash       │                             │
              │                           │                             │
              │──sendMessage──────────────→│──────────────────────────→ │
              │  "🔧 bash: npm test"      │  Affiche message +         │
              │  inline_keyboard:         │  boutons inline             │
              │  [Approve] [Deny]         │                             │
              │                           │                             │
              │  ... attente user ...     │                             │
              │                           │                             │
              │                           │     (tap ✅ Approve)        │
              │                           │←────────────────────────────│
              │←──update(callback_query)──│                             │
              │  data: "approve:tc_123"   │                             │
              │                           │                             │
              │──answerCallbackQuery──────→│  "Approved ✓"              │
              │                           │──────────────────────────→ │
              │                           │                             │
              │ Execute bash("npm test")  │                             │
              │                           │                             │
              │──sendMessage──────────────→│──────────────────────────→ │
              │  "📋 Resultat bash:       │                             │
              │   PASS 12/12 tests"       │                             │
              │                           │                             │
              │ LLM recoit tool result    │                             │
              │ Continue generation       │                             │
              │                           │                             │
```

## Sequence : Reconnexion

```
           Desktop                    Telegram API                    Mobile
              │                           │                             │
              │────getUpdates─────────────→│                             │
              │      (timeout 30s)        │                             │
              │                           │                             │
              ╳ Reseau down               │                             │
              │                           │                             │
              │ catch: Network error      │                             │
              │ wait 1s (backoff)         │                             │
              │                           │                             │
              │────getUpdates─────────────╳ (fail)                      │
              │ wait 2s                   │                             │
              │                           │                             │
              │────getUpdates─────────────╳ (fail)                      │
              │ wait 4s                   │                             │
              │                           │                             │
              │   ... reseau revient ...  │                             │
              │                           │                             │
              │────getUpdates─────────────→│                             │
              │←──updates (buffered)──────│                             │
              │                           │                             │
              │ resetBackoff()            │                             │
              │ Status: CONNECTED         │                             │
              │                           │                             │
```

## Gestion des messages longs

Les reponses LLM depassent souvent 4096 chars. Strategie de split :

### Pendant le streaming

```
1. Buffer accumule les tokens
2. Quand buffer > 3800 chars :
   a. editMessageText(current_msg, buffer[0..3800])
   b. sendMessage(buffer[3800..]) → nouveau message_id
   c. Continuer le streaming sur le nouveau message
3. Repeter si necessaire (pas de limite de messages)
```

### Apres le streaming (message final)

```
1. Splitter le texte final en chunks de 4000 chars
2. Couper aux limites de ligne (\n) quand possible
3. editMessage pour le premier chunk (remplace le streaming)
4. sendMessage pour les chunks suivants
5. Ajouter footer cout/modele au dernier chunk seulement
```

### Regles de split

- Taille max par message : **4000 chars** (marge pour MarkdownV2 overhead + footer)
- Couper en priorite sur `\n\n` (fin de paragraphe)
- Sinon sur `\n` (fin de ligne)
- Sinon a 4000 chars (dernier recours)
- Chaque message est auto-contenu en MarkdownV2 (fermer les blocs ouverts)

## Gestion des erreurs Telegram API

### Rate limiting (HTTP 429)

```typescript
// Respecter le header Retry-After
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '1'
  await sleep(parseInt(retryAfter) * 1000)
  return retry(request)
}
```

### Erreurs API courantes

| Code | Cause | Action |
|---|---|---|
| 400 | Message invalide (Markdown malformed) | Renvoyer sans `parse_mode` |
| 401 | Token invalide | Notifier user, stop session |
| 403 | Bot bloque par l'utilisateur | Notifier user, stop session |
| 404 | Chat inexistant | Re-pairing necessaire |
| 429 | Rate limit | Retry apres `Retry-After` |
| 5xx | Serveur Telegram down | Backoff exponentiel |

### Fallback MarkdownV2

Si `editMessageText` echoue avec une erreur de parsing MarkdownV2 :

```typescript
try {
  await this.editMessage(messageId, formatMarkdownV2(text), { parse_mode: 'MarkdownV2' })
} catch (e) {
  if (e.message.includes('parse entities')) {
    // Fallback : texte brut sans formatage
    await this.editMessage(messageId, text)
  } else {
    throw e
  }
}
```

## Session state machine

```
                    configure(token)
    DISCONNECTED ──────────────────→ CONFIGURING
                                         │
                                    start()
                                         │
                                         ↓
                                      PAIRING ←──────────────┐
                                         │                    │
                                    /pair CODE OK            │
                                         │              reconnect()
                                         ↓                    │
                                     CONNECTED ──(10min)──→ EXPIRED
                                         │                    │
                                    stop() ou                │
                                    /stop                   timeout
                                         │                    │
                                         ↓                    ↓
                                    DISCONNECTED ←────── DISCONNECTED
```

### Transitions

| De | Vers | Declencheur |
|---|---|---|
| DISCONNECTED | CONFIGURING | Token saisi dans Settings |
| CONFIGURING | PAIRING | Bouton "Demarrer" |
| PAIRING | CONNECTED | `/pair CODE` valide recu |
| PAIRING | DISCONNECTED | Code expire (5 min) ou stop |
| CONNECTED | EXPIRED | Aucune reponse Telegram > 10 min |
| CONNECTED | DISCONNECTED | stop() ou `/stop` |
| EXPIRED | CONNECTED | Reseau revient dans les 10 min (auto-reconnect) |
| EXPIRED | PAIRING | Re-pairing manuel |
| * | DISCONNECTED | destroy() (app quit) |

## Concurrence Desktop + Telegram

Quand la session Remote est active, les messages peuvent arriver de DEUX sources :

1. **Desktop** (InputZone) → pipeline normal
2. **Telegram** → TelegramBotService → meme pipeline

### Regles de concurrence

- Les deux sources ecrivent dans la **meme conversation** ("Remote Session")
- Si un stream est en cours et qu'un nouveau message arrive (de l'autre source) → **file d'attente**
- Le message en queue est traite quand le stream courant se termine
- L'indicateur `isStreaming` est partage entre les deux sources
- Le Desktop affiche les messages Telegram dans sa UI (via IPC `chat:chunk`)
- Telegram affiche les messages Desktop dans le chat (via `sendMessage`)

```typescript
// Queue simple
private messageQueue: Array<{ text: string; source: MessageSource }> = []

async handleIncomingMessage(text: string, source: MessageSource) {
  if (this.isStreaming) {
    this.messageQueue.push({ text, source })
    if (source === 'telegram') {
      await this.sendMessage('⏳ Message en file d\'attente (generation en cours)...')
    }
    return
  }

  await this.processMessage(text, source)

  // Traiter la queue
  while (this.messageQueue.length > 0 && !this.isStreaming) {
    const next = this.messageQueue.shift()!
    await this.processMessage(next.text, next.source)
  }
}
```
