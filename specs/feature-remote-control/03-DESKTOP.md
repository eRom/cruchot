# Remote Control — Specifications Desktop

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Nouveaux fichiers

```
src/main/
  services/telegram-bot.service.ts    # Singleton — lifecycle bot, long polling, streaming
  ipc/remote.ipc.ts                   # 8 handlers IPC
  db/queries/remote-sessions.ts       # Queries CRUD sessions

src/preload/
  index.ts                            # +8 methodes remote
  types.ts                            # +types RemoteSession, RemoteStatus, RemoteConfig

src/renderer/src/
  stores/remote.store.ts              # Zustand store
  components/settings/RemoteTab.tsx   # UI Settings
  components/layout/RemoteIndicator.tsx  # Badge sidebar/header
```

## 1. TelegramBotService

### Classe

```typescript
// src/main/services/telegram-bot.service.ts

class TelegramBotService {
  private static instance: TelegramBotService
  private token: string | null = null
  private chatId: number | null = null
  private status: RemoteStatus = 'disconnected'
  private pollingAbort: AbortController | null = null
  private offset: number = 0
  private lastActivity: number = 0
  private pairingCode: string | null = null
  private pairingExpiry: number = 0
  private streamingMessageId: number | null = null
  private streamBuffer: string = ''
  private streamTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay: number = 1000  // backoff exponentiel

  // Lifecycle
  async configure(encryptedToken: string): Promise<void>
  async start(): Promise<{ pairingCode: string }>
  async stop(): Promise<void>
  async destroy(): Promise<void>  // cleanup on app quit

  // Polling
  private async pollLoop(): Promise<void>
  private async getUpdates(): Promise<TelegramUpdate[]>
  private handleUpdate(update: TelegramUpdate): void

  // Messages
  private async sendMessage(text: string, options?: SendOptions): Promise<number>  // returns message_id
  private async editMessage(messageId: number, text: string): Promise<void>
  private async sendApprovalRequest(toolCall: ToolCallInfo): Promise<void>
  private async answerCallbackQuery(queryId: string, text?: string): Promise<void>

  // Streaming
  async startStreaming(): Promise<void>      // cree message initial
  async pushChunk(text: string): Promise<void>  // accumule + flush periodique
  async endStreaming(finalText: string): Promise<void>  // message final

  // Pairing
  private generatePairingCode(): string     // 6 chiffres aleatoires
  private async handlePairCommand(chatId: number, code: string): Promise<void>

  // Session
  private async checkTimeout(): void
  private async reconnect(): Promise<void>
  private resetBackoff(): void

  // Status
  getStatus(): RemoteStatus
  private setStatus(status: RemoteStatus): void  // + IPC push
}
```

### Long Polling

```typescript
private async pollLoop(): Promise<void> {
  while (this.status === 'pairing' || this.status === 'connected') {
    try {
      const updates = await this.getUpdates()
      this.resetBackoff()
      this.lastActivity = Date.now()

      for (const update of updates) {
        this.handleUpdate(update)
        this.offset = update.update_id + 1
      }
    } catch (error) {
      if (this.pollingAbort?.signal.aborted) break

      // Verifier timeout 10 min
      if (Date.now() - this.lastActivity > 10 * 60 * 1000) {
        this.setStatus('expired')
        break
      }

      // Backoff exponentiel
      await this.sleep(this.reconnectDelay)
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60_000)
    }
  }
}

private async getUpdates(): Promise<TelegramUpdate[]> {
  const url = `${this.baseUrl}/getUpdates`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offset: this.offset,
      timeout: 30,        // long polling 30 sec
      allowed_updates: ['message', 'callback_query']
    }),
    signal: this.pollingAbort!.signal
  })

  if (!res.ok) throw new Error(`Telegram API ${res.status}`)
  const data = await res.json()
  return data.result
}
```

### Streaming vers Telegram

```typescript
async startStreaming(): Promise<void> {
  this.streamBuffer = ''
  // Envoyer message initial avec curseur
  this.streamingMessageId = await this.sendMessage('▍')
}

async pushChunk(text: string): Promise<void> {
  this.streamBuffer += text

  // Debounce : flush toutes les 500ms
  if (!this.streamTimer) {
    this.streamTimer = setTimeout(async () => {
      this.streamTimer = null

      if (this.streamingMessageId && this.streamBuffer) {
        // Split si > 3800 chars (marge pour MarkdownV2 overhead)
        if (this.streamBuffer.length > 3800) {
          // Finaliser le message courant
          await this.editMessage(this.streamingMessageId, this.streamBuffer.slice(0, 3800))
          // Nouveau message pour la suite
          this.streamBuffer = this.streamBuffer.slice(3800)
          this.streamingMessageId = await this.sendMessage(this.streamBuffer + '▍')
        } else {
          await this.editMessage(this.streamingMessageId, this.streamBuffer + '▍')
        }
      }
    }, 500)
  }
}

async endStreaming(finalText: string): Promise<void> {
  if (this.streamTimer) {
    clearTimeout(this.streamTimer)
    this.streamTimer = null
  }

  if (this.streamingMessageId) {
    // Splitter le texte final en chunks de 4000 chars
    const chunks = this.splitText(finalText, 4000)

    // Edit le premier message
    await this.editMessage(this.streamingMessageId, chunks[0])

    // Envoyer les suivants comme nouveaux messages
    for (let i = 1; i < chunks.length; i++) {
      await this.sendMessage(chunks[i])
    }

    this.streamingMessageId = null
    this.streamBuffer = ''
  }
}
```

### Formatage MarkdownV2

```typescript
private formatForTelegram(text: string): string {
  // Telegram MarkdownV2 requiert l'echappement de caracteres speciaux
  // SAUF a l'interieur des blocs de code
  //
  // Strategie :
  // 1. Extraire les blocs de code (```)
  // 2. Echapper le texte hors blocs
  // 3. Reassembler

  const SPECIAL_CHARS = /([_*\[\]()~`>#+\-=|{}.!\\])/g

  const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('```') || part.startsWith('`')) {
      return part  // code blocks : pas d'echappement
    }
    return part.replace(SPECIAL_CHARS, '\\$1')
  }).join('')
}
```

### Gestion des Tool Calls

```typescript
private async sendApprovalRequest(toolCall: ToolCallInfo): Promise<void> {
  const emoji = TOOL_EMOJIS[toolCall.toolName] || '🔧'
  let detail = ''

  switch (toolCall.toolName) {
    case 'bash':
      detail = `\`${this.truncate(toolCall.args.command, 200)}\``
      break
    case 'writeFile':
      detail = `${toolCall.args.path}`
      break
    case 'readFile':
      detail = `${toolCall.args.path}`
      break
    case 'listFiles':
      detail = toolCall.args.path || '.'
      break
    default:
      // MCP tool
      detail = JSON.stringify(toolCall.args).slice(0, 200)
  }

  const text = `${emoji} *${this.escape(toolCall.toolName)}*\n${this.escape(detail)}`

  // Auto-approve si configure
  const session = await getActiveSession()
  if (this.shouldAutoApprove(toolCall.toolName, session)) {
    await this.sendMessage(`${text}\n✅ _Auto\\-approved_`, { parse_mode: 'MarkdownV2' })
    this.emit('tool-approved', toolCall.id)
    return
  }

  await this.sendMessage(text, {
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `approve:${toolCall.id}` },
        { text: '❌ Deny', callback_data: `deny:${toolCall.id}` }
      ]]
    }
  })
}

private handleCallbackQuery(query: CallbackQuery): void {
  const [action, toolCallId] = query.data!.split(':')

  this.answerCallbackQuery(query.id, action === 'approve' ? 'Approved' : 'Denied')

  if (action === 'approve') {
    this.emit('tool-approved', toolCallId)
  } else {
    this.emit('tool-denied', toolCallId)
  }
}
```

## 2. IPC Handlers

```typescript
// src/main/ipc/remote.ipc.ts

const configureSchema = z.object({
  token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, 'Invalid bot token format')
})

const autoApproveSchema = z.object({
  readFile: z.boolean(),
  writeFile: z.boolean(),
  bash: z.boolean(),
  listFiles: z.boolean(),
  mcp: z.boolean()
})

export function registerRemoteHandlers() {
  // Sauvegarder le token (chiffre via safeStorage)
  ipcMain.handle('remote:configure', async (event, payload) => {
    const { token } = configureSchema.parse(payload)
    // Valider le token aupres de Telegram
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`)
    if (!res.ok) throw new Error('Invalid bot token')
    const botInfo = await res.json()
    // Stocker chiffre
    credentialService.set('telegram-bot-token', token)
    return { botUsername: botInfo.result.username }
  })

  // Demarrer la session
  ipcMain.handle('remote:start', async () => {
    const bot = TelegramBotService.getInstance()
    const { pairingCode } = await bot.start()
    return { pairingCode }
  })

  // Arreter la session
  ipcMain.handle('remote:stop', async () => {
    await TelegramBotService.getInstance().stop()
  })

  // Status courant
  ipcMain.handle('remote:status', () => {
    return TelegramBotService.getInstance().getStatus()
  })

  // Config (sans token)
  ipcMain.handle('remote:get-config', async () => {
    const hasToken = credentialService.has('telegram-bot-token')
    const session = await getActiveSession()
    return { hasToken, session }
  })

  // Auto-approve settings
  ipcMain.handle('remote:set-auto-approve', async (event, payload) => {
    const settings = autoApproveSchema.parse(payload)
    await updateSessionAutoApprove(settings)
  })
}
```

## 3. Schema DB

```typescript
// Ajout dans src/main/db/schema.ts

export const remoteSessions = sqliteTable('remote_sessions', {
  id: text('id').primaryKey(),
  telegramChatId: integer('telegram_chat_id'),
  botUsername: text('bot_username'),
  pairedAt: integer('paired_at', { mode: 'timestamp' }),
  lastActivity: integer('last_activity', { mode: 'timestamp' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  conversationId: text('conversation_id'),  // conversation dediee
  autoApproveRead: integer('auto_approve_read', { mode: 'boolean' }).default(true),
  autoApproveWrite: integer('auto_approve_write', { mode: 'boolean' }).default(false),
  autoApproveBash: integer('auto_approve_bash', { mode: 'boolean' }).default(false),
  autoApproveList: integer('auto_approve_list', { mode: 'boolean' }).default(true),
  autoApproveMcp: integer('auto_approve_mcp', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
```

## 4. Integration avec le pipeline Chat

### Modification de `chat.ipc.ts`

Le handler `chat:send` existant est enrichi pour supporter les messages venant de Telegram :

```typescript
// Nouveau : source du message
type MessageSource = 'desktop' | 'telegram'

// Dans le handler chat:send (ou nouveau handler interne)
async function handleChatMessage(payload: ChatPayload, source: MessageSource) {
  const result = streamText({
    model: getModel(provider, modelId),
    messages,
    tools: mergedTools,
    // ...existing config...
    onChunk({ chunk }) {
      // Forward renderer (existant)
      mainWindow?.webContents.send('chat:chunk', { ...chunk, conversationId })

      // Forward Telegram (nouveau)
      if (telegramBot.getStatus() === 'connected') {
        if (chunk.type === 'text') {
          telegramBot.pushChunk(chunk.text)
        }
        if (chunk.type === 'tool-call') {
          telegramBot.sendApprovalRequest(chunk.toolCall)
        }
      }
    }
  })

  // ... await result.text, save DB, etc.
}
```

### Approbation outil via Telegram

Le systeme d'approbation existant (workspace-tools.ts) est etendu :

```typescript
// Pattern : Promise qui se resout quand l'utilisateur approuve/refuse
function createApprovalGate(toolCallId: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Ecouter depuis Desktop (existant)
    ipcMain.once(`tool:approve:${toolCallId}`, () => resolve(true))
    ipcMain.once(`tool:deny:${toolCallId}`, () => resolve(false))

    // Ecouter depuis Telegram (nouveau)
    telegramBot.once('tool-approved', (id) => {
      if (id === toolCallId) resolve(true)
    })
    telegramBot.once('tool-denied', (id) => {
      if (id === toolCallId) resolve(false)
    })

    // Timeout 5 min
    setTimeout(() => resolve(false), 5 * 60 * 1000)
  })
}
```

## 5. Preload Bridge

```typescript
// Ajouts dans src/preload/index.ts

remote: {
  configure: (token: string) => ipcRenderer.invoke('remote:configure', { token }),
  start: () => ipcRenderer.invoke('remote:start'),
  stop: () => ipcRenderer.invoke('remote:stop'),
  getStatus: () => ipcRenderer.invoke('remote:status'),
  getConfig: () => ipcRenderer.invoke('remote:get-config'),
  setAutoApprove: (settings: AutoApproveSettings) =>
    ipcRenderer.invoke('remote:set-auto-approve', settings),
  onStatusChanged: (cb: (status: RemoteStatusEvent) => void) => {
    ipcRenderer.on('remote:status-changed', (_, status) => cb(status))
  },
  offStatusChanged: () => ipcRenderer.removeAllListeners('remote:status-changed'),
}
```

## 6. Types

```typescript
// Ajouts dans src/preload/types.ts

export type RemoteStatus = 'disconnected' | 'configuring' | 'pairing' | 'connected' | 'expired'

export interface RemoteStatusEvent {
  status: RemoteStatus
  pairingCode?: string
  chatId?: number
  botUsername?: string
  lastActivity?: number
}

export interface RemoteConfig {
  hasToken: boolean
  session: RemoteSession | null
}

export interface RemoteSession {
  id: string
  telegramChatId: number | null
  botUsername: string | null
  pairedAt: Date | null
  lastActivity: Date | null
  isActive: boolean
  conversationId: string | null
  autoApproveRead: boolean
  autoApproveWrite: boolean
  autoApproveBash: boolean
  autoApproveList: boolean
  autoApproveMcp: boolean
}

export interface AutoApproveSettings {
  readFile: boolean
  writeFile: boolean
  bash: boolean
  listFiles: boolean
  mcp: boolean
}

// Types Telegram (internes au main process)
interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: CallbackQuery
}

interface TelegramMessage {
  message_id: number
  from: { id: number; first_name: string; username?: string }
  chat: { id: number; type: string }
  text?: string
  date: number
}

interface CallbackQuery {
  id: string
  from: { id: number }
  data?: string
  message?: TelegramMessage
}
```

## 7. UI Settings — RemoteTab

### Layout

```
┌────────────────────────────────────────────┐
│  Remote Control                            │
│                                            │
│  Token Bot Telegram                        │
│  [••••••••••••••••••] [Valider]            │
│  Bot: @my_coding_bot ✓                     │
│                                            │
│  ─────────────────────────────────         │
│                                            │
│  Session                                   │
│  Status: 🟢 Connecte                       │
│  Chat ID: 12345678                         │
│  Derniere activite: il y a 2 min           │
│                                            │
│  [Demarrer] [Arreter]                      │
│                                            │
│  Code de pairing: 482 917                  │
│  Expire dans 4:32                          │
│                                            │
│  ─────────────────────────────────         │
│                                            │
│  Auto-approbation                          │
│  ☑ readFile    ☑ listFiles                 │
│  ☐ writeFile   ☐ bash                      │
│  ☐ MCP tools                               │
│                                            │
└────────────────────────────────────────────┘
```

### Composant

```typescript
// components/settings/RemoteTab.tsx
// Pattern identique aux autres onglets Settings
// Zustand store : remote.store.ts
// Memes patterns UI : Input masque, boutons, toggles custom (pas shadcn Switch)
```

## 8. Store Zustand

```typescript
// src/renderer/src/stores/remote.store.ts

interface RemoteState {
  status: RemoteStatus
  config: RemoteConfig | null
  pairingCode: string | null

  // Actions
  loadConfig: () => Promise<void>
  configure: (token: string) => Promise<{ botUsername: string }>
  start: () => Promise<void>
  stop: () => Promise<void>
  setAutoApprove: (settings: AutoApproveSettings) => Promise<void>
  handleStatusChange: (event: RemoteStatusEvent) => void
}
```

## 9. Indicateur visuel

Un badge dans la sidebar ou le header indique qu'une session Remote est active :

```typescript
// components/layout/RemoteIndicator.tsx
// Badge avec icone Smartphone + pulse animation quand connecte
// Click → ouvre Settings > Remote
```

## 10. Commandes Telegram supportees

| Commande | Description |
|---|---|
| `/pair CODE` | Lier ce chat au Desktop |
| `/stop` | Arreter la session |
| `/status` | Afficher l'etat de la session |
| `/model` | Afficher le modele LLM actif |
| `/clear` | Nouvelle conversation (reset context) |
| `/help` | Liste des commandes |

Tout autre texte est traite comme un message utilisateur envoye au LLM.

## 11. Gestion d'erreurs

| Erreur | Traitement |
|---|---|
| Token invalide | Toast erreur, pas de sauvegarde |
| Telegram API 429 | Backoff, retry (respecter `Retry-After` header) |
| Telegram API 5xx | Retry avec backoff exponentiel |
| Network down | Polling echoue → backoff → timeout 10 min → expired |
| Chat ID change | Refuser, demander re-pairing |
| Message trop long | Split automatique a 4000 chars |
| MarkdownV2 invalide | Fallback texte brut (sans parse_mode) |

## 12. Cleanup

- `app.on('before-quit')` : `telegramBot.destroy()` (stop polling, cleanup)
- Ajouter dans `src/main/index.ts` apres les autres cleanups (MCP, file-watcher)
- Si session active, envoyer un message Telegram "Session terminee" avant de quitter
