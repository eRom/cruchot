# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.8.1] - 2026-04-04

- fix(landing): manual updates to landing page
- feat(landing): add episodic memory to Memory & RAG section
- docs: document episodic memory feature (S55)
- fix(episode): redesign ProfileTab — switch ON/OFF + Radix Select
- docs: update .memory with episodic memory architecture
- fix(episode): review fixes — XML sanitization, active filter, cleanup reset
- feat(episode): wire conversation switch detection to trigger service
- feat(episode): refactor MemoryView into 3 tabs (Notes/Souvenirs/Profil)
- feat(episode): add ProfileTab component with model selector
- feat(episode): add Zustand store for episodes
- feat(episode): add preload bridge (7 episode methods + focusConversation)
- feat(episode): inject <user-profile> in system prompt + wire trigger service
- feat(episode): add episodes to cleanup and factory reset
- feat(episode): add 7 IPC handlers with Zod validation
- feat(episode): add trigger service (switch/idle/quit)
- feat(episode): add LLM-based episode extractor service
- feat(episode): add episode profile block builder for system prompt
- feat(episode): add CRUD queries for episodes table
- feat(episode): add episodes table + lastEpisodeMessageId column

## [0.8.0] - 2026-04-03

- fix(plan): only inject plan prompt when explicitly activated (switch ON or /plan)
- docs(vcr): document VCR Recording — services, IPC, UI components
- fix(vcr): use Cruchot brand color (orange #FFAF5F) and exact dark palette
- fix(vcr): write template to ~/.cruchot/ instead of userData
- style(vcr): redesign HTML template with erom-design system
- refactor(vcr): simplify to export-only flow — remove in-app player
- update cruchot.romain-ecarnot.com
- feat(vcr): integrate VcrPlayer and VcrRecordingsList in ChatView
- feat(vcr): add VcrPlayer sheet with dual-mode switching
- feat(vcr): add VcrReplay animated playback component
- feat(vcr): add VcrProgressBar and VcrTimeline components
- feat(vcr): add VcrRecordingsList sheet component
- feat(vcr): add anonymizer, HTML template, and exporter services
- feat(vcr): add VcrSection to Right Panel (position 7/7)
- feat(vcr): add blinking REC badge in ContextWindowIndicator
- feat(vcr): add Zustand store for VCR recording state
- feat(vcr): add EventBus emission points in chat streaming pipeline
- feat(vcr): add IPC handlers and preload bridge for VCR recording
- feat(vcr): add VcrRecorderService with NDJSON write stream
- feat(vcr): add VCR types and typed EventBus
- feat(landing): add SearchView section + cruchot-landing-section skill
- chore: move VCR spec to _internal/ (gitignored)
- docs(vcr): add VCR Recording design spec (#18)
- docs(search): document SearchView, FTS5 prefix matching, and CMD+F shortcut
- refactor(search): import types from preload/types — remove duplicate definitions
- feat(search): enable FTS5 prefix matching — 'arti' matches 'article'
- fix(search): move menu item below Parametres, add clear button, persist state across view switches
- feat(search): add SearchView with filters, grouping, and highlight
- feat(search): add search ViewMode, CMD+F shortcut, UserMenu entry
- feat(search): add filters (role, projectId) to FTS5 search backend

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
