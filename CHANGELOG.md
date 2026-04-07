# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.9.3] - 2026-04-07

- feat(menu): add native macOS application menu (Cruchot/Fichier/Édition/Affichage/Fenêtre/Aide) with Personnaliser, Sauvegarder, Importer/Exporter .mlx
- feat(menu): customise native About panel with Cruchot icon, version, copyright
- feat(test): full E2E flow suite — 6 Playwright specs running locally on Ollama qwen3.5:4b (Phase 2b1)
- feat(test): add 4 test-mode IPC helpers (db-select, seed-messages, trigger-compact, get-system-prompt)
- feat(llm): extract pure-function buildSystemPrompt module from chat.ipc.ts
- fix(live): register plugins eagerly to avoid Notch race on cold start
- fix(main): move ensureInstanceToken before IPC handler registration (fix export:bulk race)
- fix(csp): allow wasm-unsafe-eval for Shiki Oniguruma engine
- fix(onboarding): use multi-llm: prefix for onboarding_completed setting
- fix(live): replace 1-shot retry with exponential backoff polling (defense in depth)
- deps: bump electron 40.8.5 → 41.1.1 (Chromium 146 + Node 24 + V8 14.6)
- deps: bump react-markdown 9 → 10, i18next 25 → 26, react-i18next 16 → 17, vite 6.4.1 → 6.4.2
- docs(tech): add 09-TESTING_STRATEGY.md documenting the 3-tier sablier strategy
- docs(skill): cruchot-release skill now runs 3 test layers locally before tagging (Phase 2b2 PIVOT)
- chore(git): ignore *.tsbuildinfo and untrack stale tsconfig.node.tsbuildinfo

## [0.9.2] - 2026-04-06

- feat(security): audit-bundle out/ mode + cruchot-release skill + cleanup
- security: fix 3 new CodeQL findings on second pass (S67/2)
- security: fix 5 CodeQL findings on first scan (S67)
- feat(skill): expand cruchot-security-review with Tools 9-10
- docs(security): add audit/security/POLICY.md with SLA + accepted exceptions
- ci(security): release security gate + bundle audit + fuses verification
- chore(security): add lockfile-lint + audit-bundle + dependabot config
- security: wire @electron/fuses via afterPack hook (audit S66 gap)
- security: fix 4 defense-in-depth findings (audit S66)
- feat(skill): add cruchot-security-review skill (3-tour audit pipeline)

## [0.9.1] - 2026-04-06

- security: fix critical command injection + bash bypass + screen share resume (audit S65)
- ui(live): voice selector single-line with weight contrast
- ui(live): polish voice selector with shadcn Select component
- docs: add OpenAI Realtime plugin + voice selector documentation
- fix(live): persist live model and voice settings across restarts
- feat(live): voice selector per plugin
- fix(live): only cancel response on real interruptions, gate screen share icon
- fix(live): handle benign cancel error and cleared event
- fix(live): set output_modalities to ['audio'] only
- fix(live): add rate to OpenAI audio output format
- fix(live): update OpenAI session.update to GA API format
- fix(ui): replace 'bientot' with 'cle API requise' in AudioLiveView
- fix(live): add 'interrupted' to LiveStatus type union
- feat(live): add OpenAI Realtime plugin

## [0.9.0] - 2026-04-05

- update landing page
- chore(landing): highlight screen sharing on Gemini Live feature
- docs: update Live Voice architecture docs for plugin migration
- fix(live): rename ElectronAPI interface methods geminiLive* → live*
- chore(live): delete old gemini-live monolith files
- feat(live): update all renderer components to use live.* imports
- feat(live): AudioLiveView loads plugins dynamically from registry
- feat(live): rename renderer store and audio hook to live.*
- feat(live): rename preload methods geminiLive* → live*
- feat(live): rename IPC handlers gemini-live → live
- feat(live): wire LiveEngineService + GeminiLivePlugin in main startup
- feat(live): create LiveEngineService orchestrator with anti-echo guards
- feat(live): create GeminiLivePlugin with transport and screen share
- feat(live): extract core prompt builder from gemini-live-system-prompt
- feat(live): create LivePluginRegistry with provider resolution
- feat(live): extract 13 core tools to generic format
- feat(live): define LivePlugin interface and shared types
- docs: document Gemini Live screen sharing feature
- fix(screen-share): don't block on permission check — open picker regardless
- feat(screen-share): integrate screen share icon and SourcePicker in NotchBar
- feat(screen-share): create ScreenSourcePicker popover with erom-design tokens
- feat(screen-share): create useScreenCapture hook with adaptive diff-based capture
- feat(screen-share): add isScreenSharing state and first-use notice flag
- feat(screen-share): add request_screenshot, pause/resume tools with inline handlers
- feat(screen-share): add 7 IPC handlers for screen capture pipeline
- feat(screen-share): add sendScreenFrame, setScreenSharing, requestScreenshot to GeminiLiveService
- feat(screen-share): add ScreenSource type and preload bridge methods
- fix: audit cleanup — async I/O, state cleanup, legacy keys, concurrency

## [0.8.5] - 2026-04-05

- feat(compact): CompactService with estimation, microcompact, and full compaction
- feat(compact): IPC handler, chat integration, and preload bridge
- feat(compact): ContextWindowBar UI + isCompacting store + input blocking
- fix(compact): double-invocation guard, MODELS registry, openrouter, toast error
- fix(compact): use real tokensIn from last API response instead of content heuristic
- fix(compact): align ContextWindowBar width with InputZone (max-w-3xl mx-auto)
- feat(costs): add llm_costs table, queries, and cleanup integration
- feat(costs): track episode, summary, prompt optimizer, live memory, image generation costs
- feat(costs): track compaction and skills analysis LLM cost
- feat(costs): persist and include background costs in global statistics
- feat(stats): complete dashboard redesign with cost breakdown and erom design
- feat(stats): enriched store with background costs, previous period, today filter

## [0.8.4] - 2026-04-05

- feat: Applications autorisées — CRUD + ouverture via /open et Gemini Live
- feat(skill): ajout étape 0 déplacement fichiers Superpower dans cruchot-push-main
- chore: fix typo in cruchot-push-main skill (docs/spec -> docs/specs)

## [0.8.3] - 2026-04-05

- feat(gemini-live): real-time voice assistant with Gemini Live API
- fix: graceful shutdown + security hardening (YOLO voice block, HTTPS-only skills)
- feat(live-memory): semantic memory for voice sessions
- feat: Audio Live tab in CustomizeView + landing page section
- docs: Gemini Live Voice guide + security audit + .serena cleanup

## [0.8.2] - 2026-04-04

- feat(oneiric): add OneiricTab UI + MemoryView 4th tab (Zustand store, IPC handlers, preload bridge, types)
- feat(oneiric): add OneiricService 3-phase consolidation pipeline + OneiricTriggerService
- feat(oneiric): integrate lifecycle (init + quit hooks) + CRUD queries + cleanup integration
- feat(oneiric): add LLM prompts + oneiric_runs table + lastOneiricRunAt column
- fix(oneiric): labels français + cleanup runs orphelins au startup + 6 code review findings
- docs: document Oneiric consolidation feature + update landing page
- chore: untrack docs/superpowers/ and .memory/ (local only)

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
