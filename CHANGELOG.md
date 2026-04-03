# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.1] - 2026-04-03

### Added
- **OCR Mistral** : reconnaissance optique de caractères via l'API Mistral OCR (`/v1/ocr`). PDF scannés et images automatiquement transcrits dans les pièces jointes chat et la bibliothèque RAG
- Badge OCR sur les pièces jointes + affichage du coût OCR dans les stats de message
- Service `OcrService` singleton avec partage de la clé API Mistral existante, envoi base64 data URL (50 MB max)
- Pricing OCR intégré dans le cost-calculator
- **Plan Mode** : mode de planification adaptatif en 3 niveaux (light / standard / deep) avec gate en lecture seule pendant la phase de réflexion
- Composants `PlanMessage`, `PlanStickyIndicator`, `PlanErrorBanner` — 4 états visuels
- Commande slash `/plan` pour activer le Plan Mode
- Toggle Plan Mode dans le Right Panel
- **Landing page** : section Mistral OCR dans Memory & RAG

### Fixed
- OCR : envoi en base64 data URL au lieu de file ID (Files API non accepté par `/v1/ocr`)
- Attachments : copie des fichiers sélectionnés dans `userData/attachments/` — corrige la validation de chemin
- Plan Mode : abandon du buffer sur détection de plan (évite les résidus texte), parsing/stripping des marqueurs déplacé dans `flushBatch`, abort du stream sur détection de plan, marqueurs non fuyants
- Plan Mode : révision critique — phase d'exécution, porte outil, timeouts
- Workspace : dérivation du `workspacePath` depuis le store — corrige le bouton Finder sur les nouvelles conversations

### Changed
- Tests : +24 tests OCR (`ocr.test.ts`) — ~145 tests total (7 suites)
- Docs : tech docs Plan Mode + skill cruchot-push-main, SECURITY.md mis à jour v0.7.x

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
