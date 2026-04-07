# Cruchot - Documentation Technique et Utilisateur

Bienvenue dans la documentation officielle de Cruchot. Ce projet est une plateforme IA locale puissante, conçue autour d'Electron, React et du Vercel AI SDK, offrant des capacités multi-modèles, du RAG local, un système de skills extensible (MCP) et un accès distant sécurisé.

## 🧭 Sommaire

### 🛠️ Architecture & Technique (Le Moteur)
Ces documents détaillent le fonctionnement interne de Cruchot, destinés aux développeurs, auditeurs et futurs mainteneurs.

1.  [`01-CORE_ARCHITECTURE.md`](./tech/01-CORE_ARCHITECTURE.md) : Modèle Electron, IPC, Remote Web & WebSockets.
2.  [`02-LLM_AND_AI_STACK.md`](./tech/02-LLM_AND_AI_STACK.md) : Vercel AI SDK, Providers, Prompting & Cost Tracking.
3.  [`03-DATA_AND_VECTOR_STORAGE.md`](./tech/03-DATA_AND_VECTOR_STORAGE.md) : SQLite (Drizzle), Qdrant (RAG), Embeddings locaux.
4.  [`04-TOOLS_SKILLS_AND_MCP.md`](./tech/04-TOOLS_SKILLS_AND_MCP.md) : Model Context Protocol, Skills natifs, File OS abstractions.
5.  [`05-SECURITY_AND_SANDBOX.md`](./tech/05-SECURITY_AND_SANDBOX.md) : Seatbelt, Bash Security, Permission Engine.
6.  [`06-BACKGROUND_SERVICES.md`](./tech/06-BACKGROUND_SERVICES.md) : Telegram Bot, Task Scheduler, Gemini Live Voice, Text-to-Speech.
7.  [`07-FRONTEND_STACK.md`](./tech/07-FRONTEND_STACK.md) : React 19, Zustand, TailwindCSS v4, Markdown/Maths rendering.
8.  [`08-OPERATIONS_AND_DEPLOYMENT.md`](./tech/08-OPERATIONS_AND_DEPLOYMENT.md) : Build, CI/CD, Binaires Qdrant, Auto-Updater.
9.  [`09-TESTING_STRATEGY.md`](./tech/09-TESTING_STRATEGY.md) : Stratégie sablier 3-tier (Vitest, E2E security, E2E flows), conventions side-effects-only, plomberie test-mode, enforcement par `cruchot-release` skill.

### 👥 Guide Utilisateur (L'Utilisation)
Ces documents sont destinés aux utilisateurs finaux pour comprendre et exploiter Cruchot au maximum.

1.  [`GETTING_STARTED.md`](./user/GETTING_STARTED.md) : Installation et configuration.
2.  [`WORKSPACE_AND_LIBRARIES.md`](./user/WORKSPACE_AND_LIBRARIES.md) : Gérer son contexte.
3.  [`USING_SKILLS_AND_MCP.md`](./user/USING_SKILLS_AND_MCP.md) : Ajouter des outils à l'IA.
4.  [`MEMORY_AND_PROFILE.md`](./user/MEMORY_AND_PROFILE.md) : Mémoire épisodique, notes et souvenirs sémantiques.
5.  [`REMOTE_ACCESS_AND_BOTS.md`](./user/REMOTE_ACCESS_AND_BOTS.md) : Accéder à Cruchot depuis son téléphone ou Telegram.
6.  [`GEMINI_LIVE_VOICE.md`](./user/GEMINI_LIVE_VOICE.md) : Conversation vocale temps-réel avec Gemini Live.
7.  [`TROUBLESHOOTING.md`](./user/TROUBLESHOOTING.md) : Résolution des problèmes courants.
