# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.0] - 2026-04-02

### Added
- **Message Fork** : forker une conversation depuis un message assistant spécifique (bouton GitFork dans le footer message). Fork par position, pas par timestamp
- **Worker Embedding** : inférence ONNX déléguée à un Worker thread (plus de blocage main process)
- **Pagination messages** : chargement par page (50 derniers) + infinite scroll vers l'historique
- **ServiceRegistry** : lifecycle centralisé des services, lazy-load, shutdown coordonné async
- **Seatbelt rewrite** : profil sandbox (allow default + deny ciblé), CWD explicite, READONLY_COMMANDS, Mode YOLO, tool limit 200

### Fixed
- Train sécurité : 7 fixes (SSRF WebFetch, validatePath, MCP pipeline, session approvals, Maton, quote-aware parsing)

### Changed
- Train perf : IPC batching 50ms, Shiki skip streaming, provider/MCP cache TTL 5min, SQLite pragmas, SELECT superflu supprimé
- Tests : 121 tests (5 suites) — vitest, bash-security, permission-engine, cost-calculator, errors, think-tag

## [0.6.0] - 2026-04-01

### Added
- **Skills** : système de packs autonomes installables (GitHub, dossier local, Barda) au format Markdown + frontmatter YAML (compatible Claude Code)
- Scan de sécurité Maton intégré (scanner Python + analyse contextuelle LLM)
- Invocation via `/skill-name` dans les conversations, injection dans le system prompt, exécution de blocs shell via Seatbelt
- UI complète dans Personnaliser > Skills

## [0.5.0] - 2026-03-22

### Added
- **Conversation Tools** : pipeline sécurité 4 étages, 8 outils LLM (bash, readFile, writeFile, FileEdit, listFiles, GrepTool, GlobTool, WebFetchTool)
- Permission engine (deny > allow > ask > fallback)
- Seatbelt macOS
- 22 security checks

## [0.4.0] - 2026-03-21

### Added
- **Bardas (Gestion de Brigade)** : système de packs thématiques importables au format Markdown (.md) — rôles, commandes, prompts, fragments, référentiels, MCP regroupés sous un namespace unique

## [0.3.0] - 2026-03-20

### Added
- **Fork conversations** : dupliquer une conversation (historique et contexte)

### Fixed
- UI fixes : Arena mode, etc.

## [0.2.0] - 2026-03-15

### Added
- **Conversations favorites** : pin/star pour garder les conversations importantes en haut de la sidebar
- **Prompt Optimizer** : amélioration automatique du prompt via LLM avant envoi (one-shot)
- **Arena** : mode comparatif côté à côté pour évaluer 2 LLMs sur le même prompt (streaming parallèle, vote, métriques comparées, design VS Street Fighter)
