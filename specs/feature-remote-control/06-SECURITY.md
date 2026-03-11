# Remote Control — Securite

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Modele de menace

### Surface d'attaque

| Vecteur | Risque | Niveau |
|---|---|---|
| Token bot expose | Controle total du bot | **Critique** |
| Chat_id non verifie | N'importe qui parle au bot | **Critique** |
| Interception HTTPS | MITM sur messages | Faible (TLS) |
| Bot usurpe | Faux bot se fait passer pour le vrai | Moyen |
| Brute force pairing | Deviner le code 6 chiffres | Moyen |
| Replay callback | Rejouer une approbation | Faible |

### Ce que fait le bot (= ce qu'un attaquant pourrait faire)

- Envoyer des messages au LLM → consommer des tokens API ($$$)
- Approuver des tool calls → executer des commandes shell, ecrire des fichiers
- Lire les reponses du LLM → potentiel leak d'info du workspace

## Mesures de securite

### 1. Token bot — Stockage chiffre

```typescript
// Le token est TOUJOURS chiffre via safeStorage (meme pattern que les cles API)
// Jamais en DB, jamais en clair, jamais dans le renderer

credentialService.set('telegram-bot-token', token)
const token = credentialService.get('telegram-bot-token')
```

- Le renderer ne connait jamais le token
- Le preload expose `hasToken: boolean` (pas le token)
- Suppression : `credentialService.delete('telegram-bot-token')` efface du Keychain

### 2. Chat ID — Verification stricte

```typescript
// CHAQUE update recu est verifie
private handleUpdate(update: TelegramUpdate): void {
  const chatId = update.message?.chat.id || update.callback_query?.message?.chat.id

  // Phase pairing : accepter n'importe quel chat_id (pour le /pair)
  if (this.status === 'pairing' && update.message?.text?.startsWith('/pair')) {
    this.handlePairCommand(chatId!, update.message.text)
    return
  }

  // Phase connectee : SEUL le chat_id paire est accepte
  if (chatId !== this.chatId) {
    // Ignorer silencieusement — ne pas reveler l'existence du bot
    return
  }

  // ... traiter le message
}
```

- Un seul `chat_id` autorise a la fois
- Stocke en DB (persiste entre restarts)
- Changement de chat_id = re-pairing obligatoire

### 3. Pairing — Code ephemere

```typescript
private generatePairingCode(): string {
  // 6 chiffres aleatoires (crypto-safe)
  const bytes = crypto.randomBytes(3) // 24 bits
  const code = (bytes.readUIntBE(0, 3) % 1_000_000).toString().padStart(6, '0')

  this.pairingCode = code
  this.pairingExpiry = Date.now() + 5 * 60 * 1000 // expire 5 min
  return code
}

private async handlePairCommand(chatId: number, text: string): Promise<void> {
  const parts = text.split(' ')
  const code = parts[1]?.trim()

  // Anti brute-force : max 5 tentatives
  this.pairingAttempts++
  if (this.pairingAttempts > 5) {
    await this.sendMessageTo(chatId, '⛔ Trop de tentatives. Regenerez un code.')
    this.setStatus('disconnected')
    return
  }

  // Verifier expiration
  if (Date.now() > this.pairingExpiry) {
    await this.sendMessageTo(chatId, '⏰ Code expire. Regenerez un code dans Settings.')
    return
  }

  // Verifier code
  if (code !== this.pairingCode) {
    await this.sendMessageTo(chatId, `❌ Code incorrect (${5 - this.pairingAttempts} essais restants)`)
    return
  }

  // Pairing reussi
  this.chatId = chatId
  this.pairingCode = null
  this.pairingAttempts = 0
  // ... sauvegarder en DB, changer status
}
```

Protection anti brute-force :
- Code = 6 chiffres = 1 million de combinaisons
- Max 5 tentatives avant blocage
- Expiration 5 minutes
- Probabilite de deviner : 5/1.000.000 = 0.0005%

### 4. Auto-approbation — Granularite fine

L'auto-approbation est configurable par type d'outil, avec des defaults securises :

| Outil | Default | Justification |
|---|---|---|
| `readFile` | **Auto-approve** | Lecture seule, faible risque |
| `listFiles` | **Auto-approve** | Lecture seule, faible risque |
| `writeFile` | **Manuel** | Modification filesystem |
| `bash` | **Manuel** | Execution arbitraire |
| MCP tools | **Manuel** | Actions externes inconnues |

L'utilisateur peut changer ces defaults dans Settings > Remote.

### 5. Commandes dangereuses — Protection supplementaire

Meme avec auto-approve, certains patterns bash sont toujours bloques (blocklist existante de ~30 patterns dans `workspace-tools.ts`) :

```
rm -rf .
bash -c
scp, rsync, nc
base64|bash
python -c
find -delete
truncate
tee /
```

Le Remote Control ne contourne **aucune** protection existante. Il reutilise le meme pipeline que le Desktop.

### 6. Information leakage

**Ce que le bot NE doit JAMAIS envoyer sur Telegram** :
- Cles API (celles de l'app)
- Tokens d'authentification
- Contenu de `.env`, `.key`, credentials
- Chemins absolus sensibles du systeme

```typescript
// Sanitization des reponses avant envoi Telegram
private sanitizeForTelegram(text: string): string {
  // Masquer les patterns sensibles (meme regex que SENSITIVE_PATTERNS)
  return text
    .replace(/(?:sk|pk|api|key|token|secret|password|auth)[-_]?[a-zA-Z0-9]{20,}/gi, '[REDACTED]')
    .replace(/-----BEGIN [A-Z ]+ KEY-----[\s\S]+?-----END [A-Z ]+ KEY-----/g, '[PRIVATE KEY REDACTED]')
}
```

### 7. Transport — HTTPS et TLS

- Toutes les requetes vers `api.telegram.org` sont en **HTTPS** (TLS 1.2+)
- Le long polling utilise un timeout de 30 secondes
- Pas de donnees sensibles dans les URL (tout en body POST)
- Les messages Telegram sont chiffres en transit (Telegram server-to-client)

**Note** : les messages ne sont PAS chiffres de bout en bout (E2E) sur Telegram standard. Le serveur Telegram peut theoriquement les lire. C'est acceptable car :
- L'app est mono-utilisateur
- Le contenu est du code/chat, pas des donnees ultra-sensibles
- L'alternative (relay custom) ajouterait de la complexite sans garantie superieure

### 8. Session — Timeout et expiration

| Parametre | Valeur | Justification |
|---|---|---|
| Pairing code TTL | 5 min | Limiter la fenetre d'attaque |
| Max pairing attempts | 5 | Anti brute-force |
| Session inactivity timeout | 10 min | Liberer les ressources |
| Reconnect backoff max | 60 sec | Eviter flood API |
| Reconnect max duration | 10 min | Abandon apres 10 min |

### 9. Isolation

- Le TelegramBotService tourne dans le **main process** (comme tous les services)
- Le renderer n'a **aucun acces** au token, au chat_id, ou aux messages bruts Telegram
- Le preload expose uniquement : status, config (sans token), start/stop

### 10. Audit et logging

```typescript
// Log toutes les actions Remote dans la console main process
private log(action: string, detail?: string): void {
  console.log(`[Remote] ${action}${detail ? ': ' + detail : ''}`)
}

// Exemples :
// [Remote] Pairing attempt: code=482917, chatId=12345678, result=success
// [Remote] Message received: chatId=12345678, length=42
// [Remote] Tool approval: bash "npm test", result=approved
// [Remote] Session expired: inactivity 10min
```

Pas de stockage de logs en DB (eviter le bruit). Les messages sont deja sauvegardes via le pipeline chat normal.

## Checklist securite avant implementation

- [ ] Token stocke via safeStorage, jamais en DB
- [ ] Chat ID verifie sur CHAQUE update (pas seulement au pairing)
- [ ] Code pairing crypto-random, expire 5 min, max 5 tentatives
- [ ] Auto-approve defaults securises (read=yes, write=no, bash=no)
- [ ] Blocklist bash existante active en mode Remote
- [ ] Sanitization des reponses avant envoi Telegram
- [ ] Renderer n'a jamais acces au token ni aux messages bruts
- [ ] Cleanup propre a la fermeture de l'app
- [ ] Log des actions Remote en console
- [ ] Pas de donnees sensibles dans les URL Telegram
