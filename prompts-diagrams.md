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