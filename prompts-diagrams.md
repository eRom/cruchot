# Prompts pour Nano Banana MCP — Diagrammes techniques

## Prompt pour diagramme sur la sécurité

Crée un diagramme d'architecture de sécurité pour une app desktop Electron multi-LLM. Le diagramme doit montrer les couches de sécurité et les flux de données entre les 3 processus principaux.

- Dossier de sortie : **./specs/assets/**
- Nom du fichier : [sujet]**.png**

Architecture à 3 couches :

1. **Renderer (React, sandboxé)** — Aucun accès Node.js, CSP stricte et complète (script-src 'self', connect-src 'self', img-src 'self' local-image: data:, font-src 'self' data:, worker-src 'self' blob:, object-src/frame-src 'none'), pas de clés API, DOMPurify sur le HTML Shiki et Mermaid, liens Markdown avec validation de schéma (https/http/mailto/# uniquement — bloque javascript: et data:), URLs Perplexity Sources validées avant window.open.

2. **Preload (contextBridge)** — ~107 méthodes typées exposées via `window.api`, jamais ipcRenderer directement. Callbacks nettoyés via removeAllListeners.

3. **Main (Node.js)** — Validation Zod sur tous les IPC handlers. Clés API chiffrées via safeStorage (Keychain macOS). Settings protégés par whitelist de clés autorisées (ALLOWED_SETTING_KEYS) + validation longueur 10K max. Workspace tools (bash) avec env minimal isolé (PATH restreint, HOME=workspace, TMPDIR=os.tmpdir(), pas d'héritage process.env) et blocklist de commandes (~36 patterns, dont 6 anti-évasion shell : backticks, $(), source/dot-script en position commande, séquences hex, ANSI-C quoting) + writeFile limité à 5MB (Zod .max). MCP servers : env minimal stdio (PATH/HOME/TMPDIR/LANG/SHELL/USER — plus d'héritage process.env complet), env vars custom chiffrées, headers HTTP masqués du renderer. Git : env immutable GIT_BASE_ENV (Readonly) + getEnv() construit par appel (pas de mutation globale entre instances), HOME=process.env.HOME (plus rootPath — empêche l'injection .gitconfig), GIT_CONFIG_NOSYSTEM=1 (bloque la config système). Git IPC : validateGitPaths() sur getDiff, stageFiles ET unstageFiles (path traversal : rejet chemins absolus, "..", resolve+startsWith). files:read confiné via isPathAllowed() (userData + workspace uniquement). Path traversal protection (path.resolve + startsWith, path segments via normalize+sep cross-platform). Fichiers sensibles bloqués (SENSITIVE_PATTERNS case-insensitive). Custom protocol local-image:// avec allowlist de répertoires + fs.realpathSync() anti-symlink escape. shell.openExternal avec confirmation dialog pour domaines non-trusted. Workspace open : 2 niveaux de protection — HARD_BLOCKED_ROOTS (/, /etc, /usr, /System, /Library, /var, /bin, /sbin, /tmp, /private/*, /opt, /cores, /dev, /proc, /sys → bloqués définitivement) + SENSITIVE_ROOTS (/Applications, /Volumes, /Users → dialog natif showMessageBox avec avertissement explicite, l'utilisateur peut approuver). Factory reset + data cleanup : double confirmation (renderer "DELETE" + dialog.showMessageBox natif côté main pour les deux). Task executor : settings whitelist TASK_ALLOWED_KEYS (pas d'accès direct DB sans filtre). Recherche FTS5 : sanitizeFtsQuery() neutralise les opérateurs MATCH (AND/OR/NOT/NEAR, accolades, astérisques, préfixes colonne:) + résultats tronqués à 500 chars. XML context injection sanitisé (</file> et </workspace-context> échappés dans buildWorkspaceContextBlock). Chat fileContexts : sanitizeContent() sur path et contenu avant injection XML dans le system prompt. Remote Telegram/Web : comparaison pairing code via crypto.timingSafeEqual (anti timing side-channel), .slice(0,6).padEnd(6) pour normaliser la longueur des buffers. Remote Web : maxPayload 64KB sur WebSocketServer (anti-DoS), broadcastToAuthenticatedClients uniquement (plus de broadcast aux clients non-pairés), sanitize sur sendToolResult avant envoi.

Flux principaux à montrer :
- Renderer → IPC (Zod validation) → Main → LLM APIs (clés chiffrées)
- Main → IPC streaming chunks → Renderer (DOMPurify)
- Workspace open : resolvedRoot → HARD_BLOCKED_ROOTS (hard block) → SENSITIVE_ROOTS (dialog approbation) → stat isDirectory → WorkspaceService
- Workspace : bash tool sandboxé → child_process (env minimal, timeout 30s, blocklist ~36 patterns dont anti-évasion shell)
- MCP : McpManagerService → subprocess stdio / HTTP (env minimal, vars chiffrées, headers masqués)
- Attachments : path confiné (userData + workspace uniquement)
- DB SQLite : WAL mode, prepared statements (Drizzle ORM), credentials jamais en clair, FTS5 queries sanitisées
- Remote Telegram : triple verrou (token chiffré safeStorage + code pairing 6 chiffres crypto.timingSafeEqual 5min/5 tentatives + allowedUserId vérifié sur chaque message/callback), long polling HTTPS sortant (zéro port entrant), sanitization données sensibles avant envoi, tool approval gate (inline keyboards)
- Remote Web : validateSessionToken() obligatoire sur TOUS les handlers WebSocket (get-conversations et cancel-stream inclus), écoute 127.0.0.1 uniquement, session tokens hashés SHA-256 en DB, maxPayload 64KB anti-DoS, broadcast réservé aux clients authentifiés, pairing timing-safe
- Git : env immutable Readonly + construction par appel + HOME=user home (pas workspace) + GIT_CONFIG_NOSYSTEM + validateGitPaths() sur toutes les opérations fichier
- Settings : whitelist ALLOWED_SETTING_KEYS (IPC) + TASK_ALLOWED_KEYS (task executor) — blocage lecture/écriture arbitraire en DB
- MCP subprocess : env minimal (plus d'héritage process.env complet — clés API du shell parent ne fuitent plus)
- Markdown : href validé (whitelist schémas https/http/mailto/#, bloque javascript: et data:)
- Factory reset + cleanup : double confirmation indépendante (renderer + dialog natif main process) sur les DEUX opérations
- XML prompt : contenu fichiers sanitisé (balises fermantes échappées + sanitizeContent sur fileContexts, bloque l'injection de prompt)
- Custom protocol local-image:// : fs.realpathSync() résout les symlinks AVANT la vérification d'allowlist (anti-symlink escape)
- Recherche FTS5 : sanitizeFtsQuery() empêche l'injection d'opérateurs MATCH, résultats tronqués à 500 chars (anti-DoS IPC)
- CI/CD : npm audit strict (sans continue-on-error, --omit=dev)

Style : technique et épuré, fond sombre, couleurs : rouge pour les barrières de sécurité hard block, vert pour les flux validés, jaune/orange pour les zones à risque contrôlé (bash tool, MCP subprocess, SENSITIVE_ROOTS avec dialog approbation), bleu pour les protections anti-timing/anti-DoS.


## Prompt pour diagramme sur la base de données (schéma table)

Crée un diagramme de schéma de base de données (ERD) pour une app desktop multi-LLM avec 16 tables SQLite. Montre les tables, leurs colonnes principales, types, et les relations (foreign keys).

Tables et relations :

**providers** (id PK, name, type [cloud|local], baseUrl?, isEnabled, createdAt)
  ← models.provider_id

**models** (id PK, providerId FK→providers, name, displayName, contextWindow, inputPrice?, outputPrice?, supportsImages, supportsStreaming, isEnabled)

**projects** (id PK, name, description?, systemPrompt?, defaultModelId?, color?, workspacePath?, createdAt, updatedAt)
  ← conversations.project_id, scheduledTasks.project_id, mcpServers.project_id

**roles** (id PK, name, description?, systemPrompt?, icon?, isBuiltin, category?, tags JSON, variables JSON, createdAt, updatedAt)
  ← conversations.role_id, scheduledTasks.role_id

**conversations** (id PK, title, projectId FK→projects, modelId?, roleId FK→roles, createdAt, updatedAt)
  ← messages.conversation_id, images.conversation_id

**messages** (id PK, conversationId FK→conversations, parentMessageId?, role [user|assistant|system], content, contentData JSON, modelId?, providerId?, tokensIn?, tokensOut?, cost?, responseTimeMs?, createdAt)
  ← attachments.message_id, images.message_id

**attachments** (id PK, messageId FK→messages, filename, mimeType, size, path, createdAt)

**prompts** (id PK, title, content, category?, tags JSON, type [complet|complement|system], variables JSON, createdAt, updatedAt)

**settings** (key PK, value?, updatedAt) — Clés API stockées chiffrées via safeStorage

**statistics** (id PK, date, providerId?, modelId?, projectId?, messagesCount, tokensIn, tokensOut, totalCost, avgResponseTimeMs?)

**tts_usage** (id PK, messageId?, provider, model, textLength, cost, createdAt)

**scheduled_tasks** (id PK, name, description, prompt, modelId, roleId FK→roles, projectId FK→projects, scheduleType [manual|interval|daily|weekly], scheduleConfig JSON, isEnabled, lastRunAt?, nextRunAt?, lastRunStatus?, lastRunError?, lastConversationId?, runCount, createdAt, updatedAt)

**mcp_servers** (id PK, name, description?, transportType [stdio|http|sse], command?, args JSON, cwd?, url?, headers JSON, envEncrypted?, isEnabled, projectId FK→projects, icon?, color?, toolTimeout, autoConfirm, createdAt, updatedAt)

**memory_fragments** (id PK, content, isActive, sortOrder, createdAt, updatedAt)

**remote_sessions** (id PK, telegramChatId?, botUsername?, pairedAt?, lastActivity?, isActive, conversationId FK→conversations, autoApproveRead, autoApproveWrite, autoApproveBash, autoApproveList, autoApproveMcp, createdAt)

**images** (id PK, conversationId FK→conversations, messageId FK→messages, prompt, modelId?, width?, height?, path, size?, createdAt)

Relations FK à montrer avec des flèches :
- models → providers
- conversations → projects, roles
- messages → conversations
- attachments → messages
- images → conversations, messages
- scheduled_tasks → roles, projects
- mcp_servers → projects
- remote_sessions → conversations

Style : ERD classique, fond sombre, groupes logiques par couleur : bleu pour le coeur chat (conversations, messages, attachments), violet pour la config (providers, models, settings), vert pour les features (prompts, roles, projects), orange pour les extensions (scheduled_tasks, mcp_servers, memory_fragments, remote_sessions), rouge pour le tracking (statistics, tts_usage, images).

---

## Prompt pour infographie sur les fonctionnalités

Crée une infographie des fonctionnalités pour une app desktop de chat multi-LLM appelée "Multi-LLM Desktop". L'infographie doit présenter visuellement toutes les capacités de l'application, organisées par catégories, avec des icônes et des descriptions courtes.

Titre principal : **Multi-LLM Desktop** — "Tous vos LLMs, une seule interface"

Catégories et fonctionnalités :

**Chat Multi-Provider** (icône : bulles de conversation)
- 10 providers : OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Alibaba Qwen, Perplexity, Ollama, LM Studio
- 8 providers cloud + 2 locaux (Ollama, LM Studio)
- Streaming temps réel token par token
- Historique illimité avec recherche full-text (FTS5)
- Mode Thinking/Reasoning avec 14 modèles supportés (Anthropic, OpenAI, Google, xAI, DeepSeek)
- Annulation de stream en cours

**Génération d'images** (icône : palette/pinceau)
- 3 modèles : Gemini Flash, Gemini Pro, GPT Image
- Sélection d'aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4)
- Galerie d'images avec aperçu
- Stockage local sécurisé via protocole custom local-image://

**Workspace Co-Work** (icône : dossier avec engrenage)
- Arborescence de fichiers interactive (FileTree) avec indicateurs Git (M/A/D/?)
- 4 outils IA : bash (terminal sandboxé), readFile, writeFile, listFiles
- Le LLM lit, écrit et exécute des commandes dans le workspace
- Détection de changements en temps réel (Chokidar file watcher)
- Propositions de modifications de fichiers avec approbation (FileOperationCard)
- Auto-injection des fichiers de contexte (CLAUDE.md, README.md, AGENTS.md, GEMINI.md)

**Intégration Git** (icône : branches/merge)
- Branche courante, indicateur dirty/clean, compteur de fichiers modifiés
- Vue Changes : fichiers staged/unstaged avec actions stage/unstage
- Diff viewer coloré intégré (ajouts vert, suppressions rouge, hunks bleu)
- AI Commit Message : génération one-shot du message via le LLM sélectionné
- Commit direct depuis l'interface avec toast de confirmation

**Remote Telegram** (icône : smartphone)
- Contrôle à distance de l'app depuis un smartphone via Telegram Bot API
- Zéro serveur backend — long polling HTTPS sortant, zéro dépendance npm (fetch natif)
- Triple verrou de sécurité : token bot chiffré (safeStorage) + code pairing 6 chiffres (5 min, 5 tentatives max) + ID Telegram vérifié sur chaque message
- Streaming des réponses LLM en temps réel (editMessageText + debounce 500ms + curseur ▍)
- Approbation des outils via inline keyboards Telegram [Approuver][Refuser] avec auto-approve configurable par type
- Commandes bot : /pair, /stop, /status, /model, /clear, /help
- Split intelligent des messages > 4096 chars (paragraphe > ligne > hard cut, gestion des code blocks)
- Sanitization des données sensibles (clés API, PEM, tokens) avant envoi
- Continue la conversation desktop active (pas de conversation séparée)
- Badge status dans la barre de tokens (vert connecté, jaune pairing, gris déconnecté)
- Reconnexion automatique avec backoff exponentiel (1s→60s), expiration après 10 min d'inactivité

**LM Studio** (icône : serveur local)
- URL configurable (auto-détection sur localhost)
- Liste dynamique des modèles chargés
- Parsing des tags \<think\> pour le mode raisonnement
- Provider OpenAI-compatible (zéro configuration API)

**Projets** (icône : cube/boîte)
- Organisation par projets avec modèle par défaut
- Conversations filtrées par projet
- Workspace lié au projet (auto-ouverture)
- System prompt par projet

**Rôles / System Prompts** (icône : masque de théâtre)
- Rôles intégrés et personnalisés
- Variables dynamiques {{varName}} avec popover de saisie
- Verrouillage du rôle après le premier message
- Sélection via pill dans la zone de saisie

**Prompts** (icône : éclair)
- Bibliothèque de prompts réutilisables
- 3 types : complet, complément, system
- Variables dynamiques, catégories et tags
- Injection rapide dans la conversation

**Attachments** (icône : trombone)
- Images (PNG, JPG, GIF, WebP), PDF, DOCX, fichiers code
- Drag & drop + Cmd+V (coller)
- Extraction de texte (PDF, DOCX) et injection dans le contexte
- Images encodées en base64 pour les modèles vision

**MCP (Model Context Protocol)** (icône : réseau/puzzle)
- Connexion à des serveurs MCP externes (outils tiers)
- Transport stdio (subprocess), HTTP, SSE
- Variables d'environnement chiffrées
- Scope par projet (global ou spécifique)
- Test de connexion intégré
- Outils MCP fusionnés avec les workspace tools dans le chat

**Memory Fragments** (icône : cerveau)
- Contexte personnel persistant injecté dans toutes les conversations
- Max 50 fragments, drag & drop pour réordonner
- Activable/désactivable individuellement
- Injection automatique dans le system prompt

**Tâches planifiées** (icône : horloge)
- 4 types de planification : manuelle, intervalle, quotidienne, hebdomadaire
- Exécution LLM automatique avec notifications
- Conversation dédiée par exécution
- Historique des runs avec statut

**Synthèse vocale (TTS)** (icône : haut-parleur)
- 3 providers : navigateur (Web Speech), OpenAI (Coral), Google (Aoede)
- Lecture audio des réponses du LLM
- Cache audio par message

**Statistiques & Coûts** (icône : graphique)
- Suivi des coûts par provider, modèle et projet
- 6 cartes de stats + 4 graphiques (barres, lignes, camemberts)
- Filtrage par période (7j, 30j, 90j, 1an, tout)
- Compteurs de tokens in/out

**Recherche Web (Perplexity Search)** (icône : loupe/globe)
- Mode Search activable/désactivable dans la zone de saisie (toggle violet)
- Outil Perplexity Search injecté dans le pipeline AI SDK — fonctionne avec n'importe quel provider/modèle
- Le LLM décide quand chercher sur le web (tool call automatique)
- Sources numérotées cliquables affichées sous la réponse (badges interactifs)
- Prompt directif qui priorise la recherche web sur les outils workspace
- Visible uniquement si la clé API Perplexity est configurée
- Persistance des sources dans la base de données (contentData.searchSources)

**Gestion des données** (icône : bouclier/corbeille)
- Nettoyage partiel (zone orange) : supprime conversations, projets, images, tâches, serveurs MCP — conserve rôles, prompts, mémoire, paramètres, clés API
- Factory reset complet (zone rouge) : suppression de TOUTES les tables DB, arrêt des services actifs, trash des fichiers (images, attachments, avatar)
- Validation "DELETE" (case-sensitive) obligatoire pour le factory reset
- Retour à l'état initial (Welcome wizard) après factory reset
- Export/import JSON pour les prompts et les rôles (sauvegarde avant nettoyage)

**Personnalisation** (icône : sliders)
- Thème clair/sombre
- Paramètres modèle globaux (temperature, maxTokens, topP)
- Modèles favoris pour accès rapide
- Raccourcis clavier (Cmd+N, Cmd+K, Cmd+M, Cmd+B)
- Palette de commandes (Cmd+K)

**Sécurité** (icône : bouclier)
- Clés API chiffrées via safeStorage (Keychain macOS)
- Sandbox Electron (nodeIntegration: false, contextIsolation: true)
- CSP stricte, DOMPurify, validation Zod sur tous les IPC
- Bash tool sandboxé (env minimal, blocklist ~30 patterns)
- Données 100% locales, zéro télémétrie

Bandeau bas : **Stack technique** — Electron 35 · React 19 · TypeScript · Tailwind CSS 4 · SQLite · Drizzle ORM · Vercel AI SDK 6

Style : infographie moderne, fond sombre, mise en page en grille (3-4 colonnes), chaque catégorie dans une carte avec icône colorée en haut, titre en gras, bullet points concis en dessous. Palette de couleurs : bleu électrique pour le chat, violet pour la personnalisation et la recherche web, vert pour le workspace et Git, orange pour les extensions (MCP, tâches), cyan pour les médias (images, TTS), rouge pour la sécurité et la gestion des données, indigo pour LM Studio, rose pour le Remote (Telegram, Web). Aspect premium et épuré, pas surchargé.

---

## Prompt pour diagramme Remote Telegram | Web (Architecture & sécurité)

Crée un diagramme d'architecture technique pour la fonctionnalité "Remote Control" d'une app desktop Electron multi-LLM. Le diagramme doit montrer les deux canaux de contrôle à distance (Telegram et Web) et leurs flux de sécurité.

Architecture à montrer :

**Canal 1 — Remote Telegram** (côté gauche)
- TelegramBotService (singleton, EventEmitter) dans le Main process
- Long polling HTTPS sortant vers Telegram Bot API (getUpdates, timeout 30s, AbortController)
- Zéro serveur backend, zéro dépendance npm (fetch natif Node.js)
- Triple verrou de sécurité :
  1. Token bot chiffré via safeStorage (Keychain macOS)
  2. Code pairing 6 chiffres (crypto.randomInt, 5 min expiry, max 5 tentatives >=), comparaison via crypto.timingSafeEqual (anti timing side-channel), normalisation .slice(0,6).padEnd(6)
  3. allowedUserId vérifié sur CHAQUE message ET callback (obligatoire, pas optionnel)
- Streaming : sendMessage('▍') → editMessageText (debounce 500ms) → split intelligent > 4096 chars
- sendToolResult : sanitize des données sensibles avant envoi
- Tool approval : wrapToolsWithApproval() → inline keyboards [Approuver][Refuser], auto-approve configurable par type (5 toggles : read, write, bash, list, mcp)
- Commandes bot : /pair, /stop, /status, /model, /clear, /help
- Sanitization : SENSITIVE_PATTERNS masqués, erreurs génériques vers Telegram (pas de raw stack traces)
- Reconnexion : backoff exponentiel 1s→60s, expiration 10 min inactivité
- Session persistée en DB (table remote_sessions, 16ème table)

**Canal 2 — Remote Web** (côté droit)
- RemoteServerService (singleton, EventEmitter) dans le Main process
- WebSocket server `ws` npm sur localhost:9877 (configurable), maxPayload 64KB (anti-DoS)
- SPA standalone (Vite + React + Tailwind CSS 4) dans `src/remote-web/`, build séparée dans `out/remote-web/`
- Pairing : code 6 chiffres + QR code avec URL params `?ws=...&pair=...` pour auto-connect, comparaison crypto.timingSafeEqual
- Protocol JSON custom via WebSocket (pair, user-message, tool-approval-response, cancel-stream, get-history, stream-start/text-delta/reasoning-delta/end, tool-approval-request, session-expired)
- Broadcast réservé aux clients authentifiés (broadcastToAuthenticatedClients — plus de fuite vers clients non-pairés)
- sendToolResult : sanitize des données sensibles avant broadcast
- UI = calque exact du desktop (même palette OKLCH, même InputZone, même MessageItem avec avatar Sparkles)
- Session persistée en DB (table remote_server_sessions, 17ème table)
- Support optionnel CloudFlare tunnel (wss:// pour accès externe)

**Point de convergence — handleChatMessage()** (centre)
- Fonction unique exportée depuis chat.ipc.ts
- Source : 'desktop' | 'telegram' | 'websocket'
- Dual-forward : chunks streamés simultanément vers le renderer desktop ET le canal remote connecté
- Tool approval gate : wrapToolsWithApproval() enveloppe les execute() des outils AVANT streamText()
- Conversation bridge : les deux canaux continuent la conversation desktop active (pas de conv séparée)

**DB** (en bas)
- remote_sessions : chatId, autoApprove x5, conversationId FK, allowedUserId
- remote_server_sessions : clientId, autoApprove x5, conversationId FK

Flux à montrer avec flèches :
- Smartphone → Telegram Bot API → long polling → TelegramBotService → handleChatMessage() → streamText() → dual-forward chunks → Renderer desktop + Telegram (editMessageText)
- Navigateur/Mobile → WebSocket ws:// → RemoteServerService → handleChatMessage() → streamText() → dual-forward chunks → Renderer desktop + WebSocket client
- Tool call → wrapToolsWithApproval() → inline keyboard (Telegram) / ToolCallCard (Web) → approve/deny → execute ou reject

Style : technique et épuré, fond sombre, couleurs : rose/magenta pour Telegram, bleu/cyan pour Web, vert pour les flux validés, rouge pour les barrières de sécurité (pairing, allowedUserId, token chiffré), jaune pour le tool approval gate. Les deux canaux convergent visuellement vers handleChatMessage() au centre.
