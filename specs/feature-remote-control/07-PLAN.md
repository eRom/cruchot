# Remote Control — Plan d'implementation

> Feature spec — Multi-LLM Desktop
> Date : 2026-03-11

## Phases

### Phase 1 — Fondations (TelegramBotService + IPC + DB)

| # | Tache | Fichiers | Effort |
|---|---|---|---|
| 1.1 | Table `remote_sessions` dans schema.ts + queries CRUD | `schema.ts`, `db/queries/remote-sessions.ts` | S |
| 1.2 | TelegramBotService : singleton, configure, token safeStorage | `services/telegram-bot.service.ts` | M |
| 1.3 | Long polling : getUpdates, boucle async, backoff | `telegram-bot.service.ts` | M |
| 1.4 | Pairing : code 6 chiffres, verification, anti brute-force | `telegram-bot.service.ts` | S |
| 1.5 | Send/edit messages : wrapper fetch, MarkdownV2 formatting | `telegram-bot.service.ts` | M |
| 1.6 | IPC handlers (8) + Zod validation | `ipc/remote.ipc.ts` | M |
| 1.7 | Register IPC dans `ipc/index.ts` | `ipc/index.ts` | XS |
| 1.8 | Preload bridge (+8 methodes) + types | `preload/index.ts`, `preload/types.ts` | S |
| 1.9 | Cleanup on app quit | `index.ts` | XS |

### Phase 2 — Integration Chat + Streaming

| # | Tache | Fichiers | Effort |
|---|---|---|---|
| 2.1 | Conversation "Remote Session" : creation auto, badge distinctif | `telegram-bot.service.ts`, `conversations.ipc.ts` | S |
| 2.2 | Forward messages Telegram → chat handler | `telegram-bot.service.ts`, `chat.ipc.ts` | M |
| 2.3 | Streaming vers Telegram : debounce 500ms, split 4000 chars | `telegram-bot.service.ts` | M |
| 2.4 | Dual-forward : chunks → renderer + Telegram simultanement | `chat.ipc.ts` | S |
| 2.5 | Tool approval via callback_query (inline keyboards) | `telegram-bot.service.ts` | M |
| 2.6 | Auto-approve par type d'outil | `telegram-bot.service.ts`, `remote-sessions.ts` | S |
| 2.7 | Commandes bot (/status, /model, /clear, /stop, /help) | `telegram-bot.service.ts` | S |
| 2.8 | Concurrence Desktop + Telegram (message queue) | `telegram-bot.service.ts` | M |
| 2.9 | Sanitization reponses (cles, tokens) avant envoi Telegram | `telegram-bot.service.ts` | S |

### Phase 3 — UI Desktop

| # | Tache | Fichiers | Effort |
|---|---|---|---|
| 3.1 | Zustand store `remote.store.ts` | `stores/remote.store.ts` | S |
| 3.2 | Settings > Remote tab (token, start/stop, pairing, auto-approve) | `components/settings/RemoteTab.tsx` | M |
| 3.3 | Ajouter onglet Remote dans SettingsView | `components/settings/SettingsView.tsx` | XS |
| 3.4 | RemoteIndicator dans sidebar/header (badge connexion) | `components/layout/RemoteIndicator.tsx` | S |
| 3.5 | Messages Telegram visibles dans la conversation Desktop | `stores/messages.store.ts`, `MessageItem.tsx` | S |
| 3.6 | Init app : charger config Remote, listener status | `hooks/useInitApp.ts` | XS |

### Phase 4 — Resilience + Polish

| # | Tache | Fichiers | Effort |
|---|---|---|---|
| 4.1 | Reconnexion automatique (backoff exponentiel) | `telegram-bot.service.ts` | S |
| 4.2 | Session expiration (10 min timeout) | `telegram-bot.service.ts` | S |
| 4.3 | Re-pairing depuis EXPIRED (chat_id persiste) | `telegram-bot.service.ts` | S |
| 4.4 | Gestion erreurs Telegram API (429, 5xx, MarkdownV2 fallback) | `telegram-bot.service.ts` | M |
| 4.5 | Tests manuels (scenarios pairing, streaming, tools, reconnexion) | — | M |
| 4.6 | Documentation utilisateur (README section Remote Control) | — | S |

## Estimation

| Phase | Effort | ~Temps |
|---|---|---|
| Phase 1 | Fondations | 1 session |
| Phase 2 | Integration chat | 1-2 sessions |
| Phase 3 | UI Desktop | 1 session |
| Phase 4 | Resilience | 1 session |
| **Total** | | **4-5 sessions** |

## Dependances

- **Zero nouvelle dependance npm** (fetch natif Node.js 18+)
- **Prerequis** : compte Telegram + bot cree via @BotFather
- **Pas de breaking change** : le pipeline chat existant est etendu, pas remplace

## Risques

| Risque | Probabilite | Impact | Mitigation |
|---|---|---|---|
| MarkdownV2 formatting bugs | Haute | Faible | Fallback texte brut |
| Rate limit Telegram (1/sec) | Moyenne | Moyenne | Debounce 500ms, queue |
| Telegram API downtime | Faible | Haute | Backoff + retry auto |
| Long messages mal splittes | Moyenne | Faible | Tests extensifs |
| Concurrence Desktop+Telegram | Faible | Moyenne | Queue + isStreaming guard |

## Fichiers impactes (resume)

### Nouveaux (7)

```
src/main/services/telegram-bot.service.ts
src/main/ipc/remote.ipc.ts
src/main/db/queries/remote-sessions.ts
src/renderer/src/stores/remote.store.ts
src/renderer/src/components/settings/RemoteTab.tsx
src/renderer/src/components/layout/RemoteIndicator.tsx
```

### Modifies (7)

```
src/main/db/schema.ts                    # +table remote_sessions
src/main/ipc/index.ts                    # +register remote handlers
src/main/ipc/chat.ipc.ts                 # +dual-forward Telegram
src/main/index.ts                        # +cleanup on quit
src/preload/index.ts                     # +8 methodes remote
src/preload/types.ts                     # +types Remote*
src/renderer/src/components/settings/SettingsView.tsx  # +tab Remote
src/renderer/src/hooks/useInitApp.ts     # +init remote
```
