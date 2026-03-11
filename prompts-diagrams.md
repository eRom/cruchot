# Prompts pour Nano Banana MCP — Diagrammes techniques

## Prompt pour diagramme sur la sécurité

Crée un diagramme d'architecture de sécurité pour une app desktop Electron multi-LLM. Le diagramme doit montrer les couches de sécurité et les flux de données entre les 3 processus principaux.

Architecture à 3 couches :

1. **Renderer (React, sandboxé)** — Aucun accès Node.js, CSP stricte (script-src 'self', connect-src 'self', object-src/frame-src 'none'), pas de clés API, DOMPurify sur le HTML Shiki et Mermaid.

2. **Preload (contextBridge)** — ~84 méthodes typées exposées via `window.api`, jamais ipcRenderer directement. Callbacks nettoyés via removeAllListeners.

3. **Main (Node.js)** — Validation Zod sur tous les IPC handlers. Clés API chiffrées via safeStorage (Keychain macOS). Workspace tools (bash) avec env minimal isolé (PATH restreint, pas d'héritage process.env) et blocklist de commandes (~30 patterns). MCP servers : env vars chiffrées, headers HTTP masqués du renderer. Path traversal protection (path.resolve + startsWith). Fichiers sensibles bloqués (SENSITIVE_PATTERNS case-insensitive). Custom protocol local-image:// avec allowlist de répertoires. shell.openExternal avec confirmation dialog pour domaines non-trusted.

Flux principaux à montrer :
- Renderer → IPC (Zod validation) → Main → LLM APIs (clés chiffrées)
- Main → IPC streaming chunks → Renderer (DOMPurify)
- Workspace : bash tool sandboxé → child_process (env minimal, timeout 30s, blocklist)
- MCP : McpManagerService → subprocess stdio / HTTP (env chiffré, headers masqués)
- Attachments : path confiné (userData + workspace uniquement)
- DB SQLite : WAL mode, prepared statements (Drizzle ORM), credentials jamais en clair

Style : technique et épuré, fond sombre, couleurs : rouge pour les barrières de sécurité, vert pour les flux validés, jaune/orange pour les zones à risque contrôlé (bash tool, MCP subprocess).


## Prompt pour diagramme sur la base de données (schéma table)

Crée un diagramme de schéma de base de données (ERD) pour une app desktop multi-LLM avec 15 tables SQLite. Montre les tables, leurs colonnes principales, types, et les relations (foreign keys).

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

**images** (id PK, conversationId FK→conversations, messageId FK→messages, prompt, modelId?, width?, height?, path, size?, createdAt)

Relations FK à montrer avec des flèches :
- models → providers
- conversations → projects, roles
- messages → conversations
- attachments → messages
- images → conversations, messages
- scheduled_tasks → roles, projects
- mcp_servers → projects

Style : ERD classique, fond sombre, groupes logiques par couleur : bleu pour le coeur chat (conversations, messages, attachments), violet pour la config (providers, models, settings), vert pour les features (prompts, roles, projects), orange pour les extensions (scheduled_tasks, mcp_servers, memory_fragments), rouge pour le tracking (statistics, tts_usage, images).


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

Style : infographie moderne, fond sombre, mise en page en grille (3-4 colonnes), chaque catégorie dans une carte avec icône colorée en haut, titre en gras, bullet points concis en dessous. Palette de couleurs : bleu électrique pour le chat, violet pour la personnalisation, vert pour le workspace et Git, orange pour les extensions (MCP, tâches), cyan pour les médias (images, TTS), rouge pour la sécurité, indigo pour LM Studio. Aspect premium et épuré, pas surchargé.
