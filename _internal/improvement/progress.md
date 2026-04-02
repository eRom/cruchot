# Audit d'amelioration — Progression

> Derniere mise a jour : 2026-04-02 (S50+)

## HAUTE+ — Termine (14/14)

| # | ID | Item | Commit | Gains |
|---|-----|------|--------|-------|
| 1 | B4 | minimatch declare dans deps | `bdfff57` | Build fiable |
| 2 | S6 | typecheck main process | `bdfff57` | ~30 erreurs latentes revelees |
| 3 | P4 | FTS5 content-sync + triggers + backfill | `45188d0` | Recherche fonctionnelle |
| 4 | P5 | Seatbelt deny network | `aaaf85e` | Seul localhost + HTTPS 443 |
| 5 | P6 | MCP command allowlist validation | `aaaf85e` | Blocage injection commande |
| 6 | X1 | Seatbelt deny reads sensibles | `aaaf85e` | .config, Library/*, userData |
| 7 | B3 | Console logs en prod + unhandledRejection | `8327a1b` | Observabilite prod |
| 8 | P1 | Token batching IPC 50ms | `8a16e19` | -80% overhead IPC |
| 9 | P2 | Skip Shiki pendant streaming | `8f51dc4` | -90% CPU blocs code |
| 10 | P3 | Shiki grammars subset (12 langs) | `8f51dc4` | 11 MB → 1.6 MB (-86%) |
| 11 | S5 | FK cascade delete triggers | `cbd00cc` | 0 orphelins DB |
| 12 | M1 | Enrichissements paralleles (Promise.allSettled) | `9267858` | -200-1000ms TTFT |
| 13 | D3+S3 | ThinkTagParser + split handleChatMessage | `2b41dbf` + `9e04747` | 900 lignes → 3 phases |
| 14 | S1 | 114 tests unitaires (5 suites) | `5c0ec98` + `69974cb` | 0 → 114 tests, 1.38s |

**12 commits, ~20 fichiers modifies/crees**

---

## MOYENNE — Termine (13/13)

| # | ID | Item | Commit | Gains |
|---|-----|------|--------|-------|
| 15 | X4 | validatePath traversal + absolute path block | `3c10041` | Pas d'escape workspace |
| 16 | X3 | WebFetchTool SSRF redirect:manual + private IP block | `3d711dd` | Pas de SSRF via redirect |
| 17 | X5 | Maton scan pipeline securite | `8b45b32` | Maton confine par permissions |
| 18 | X7 | isReadOnlyCommand quote-aware parsing | `0336df2` | 42 tests, operators dans quotes |
| 19 | X8+X2 | Session approvals par conversation + YOLO cote main | `11173e5` | Plus de cross-conv leak |
| 20 | X6 | MCP tools wrapping permission pipeline | `8128ccf` | MCP soumis a deny/allow/ask |
| 21 | M6 | createMessage sans SELECT redondant | `7ac177f` | -1 query/message |
| 22 | M2+M8 | Cache providers TTL 5min + local providers paralleles | `59feda8` | -DB read/message, -latence |
| 23 | M4+M5 | Cache MCP tools 5min + startup parallele | `9704d78` | -API call/message, init rapide |
| 24 | M7 | Cleanup will-quit coordonne (before-quit async) | `9bb6c18` | Plus de race WAL/orphans |
| — | M3 | Cache permission rules | — | **Deja fait** (cachedRules) |
| — | S4 | ~~Pagination messages DB~~ | — | **Fait en S49** |

**10 commits, ~20 fichiers modifies, 121 tests (42 permission-engine)**

---

## BASSE — Backlog

### Bundle & build

| ID | Item | Effort | Fichier(s) |
|----|------|--------|-----------|
| B1 | Mermaid lazy par type de diagramme | 2h | MermaidBlock.tsx |
| B2 | ~~manualChunks shiki/mermaid~~ | ~~30min~~ | **Fait dans P3** |
| B5 | ~~Code splitting main process (lazy services)~~ | ~~3h~~ | **Fait (`bc7589a`→`0e79121`) — ServiceRegistry + lazy dynamic imports** |

### Code quality & DX

| ID | Item | Effort | Statut |
|----|------|--------|--------|
| D1 | StreamChunk type duplique renderer/preload | 30min | Deferred (renderer superset, divergence acceptable) |
| D2 | Model shape literal repete x7 | 30min | Deferred (cosmétique) |
| D3 | ~~Extraire think tag parser~~ | ~~2h~~ | **Fait dans S3** |
| D4 | Constantes extensions dupliquees x3 | 15min | Deferred (chaque module a ses besoins) |
| D5 | ~~unhandledRejection handler~~ | ~~5min~~ | **Fait dans B3** |
| D6 | ~~Table statistics morte~~ | ~~15min~~ | **Non — utilisee par statistics.ipc.ts** (queries agrement depuis messages mais table existe) |
| D7 | ~~SQLite pragmas~~ | ~~5min~~ | **Fait (synchronous NORMAL, cache 20MB, temp MEMORY)** |
| D8 | ~~WAL checkpoint au shutdown~~ | ~~5min~~ | **Fait (wal_checkpoint TRUNCATE dans closeDatabase)** |
| D9 | ~~Seeds permissions desync~~ | ~~30min~~ | **Deja synchro (fix S47 I3)** |
| D10 | removeAllListeners trop large | 1h | Accepted risk (single-window, 1 listener/channel) |
| D11 | ~~home path resolution~~ | ~~15min~~ | **Fait (os.homedir() dans chat.ipc + seatbelt)** |

### Database

| ID | Item | Effort | Statut |
|----|------|--------|--------|
| — | ~~SELECT-after-INSERT (9 fonctions)~~ | ~~2h~~ | **Fait (9 create* dans 8 fichiers)** |
| — | ~~incrementRunCount read-then-write~~ | ~~15min~~ | **Fait (atomic SQL UPDATE)** |
| — | ~~setSyncStatus SELECT+INSERT → upsert~~ | ~~15min~~ | **Fait (onConflictDoUpdate)** |
| — | ~~reorderMemoryFragments sans transaction~~ | ~~15min~~ | **Fait (db.transaction)** |
| — | ~~Index manquants (is_enabled)~~ | ~~15min~~ | **Fait (2 index ajoutes)** |
| — | ~~Blind catch ALTER TABLE~~ | ~~30min~~ | **Acceptable (SQLite n'a pas IF NOT EXISTS pour ADD COLUMN)** |
| — | conversations.activeLibraryId sans FK | 15min | Deferred |
| — | bardas counter columns denormalisation | 30min | Deferred |
| — | arenaMatches FK manquantes | 15min | Deferred |
| — | skills.installedAt inconsistance timestamp | 5min | Deferred |
| — | updateLibraryStats 3 SELECTs → 1 query | 30min | Deferred |
| — | getArenaStats merge JS → SQL CTE | 1h | Deferred |
| — | Pas de table de versions migrations | 2h | Deferred |
| — | contentData opaque blob → message_type | 2h | Deferred |
| — | librarySources.extractedText gros texte en DB | 1h | Deferred |
| — | Pas de cleanup fichiers orphelins disque | 2h | Deferred |
| — | vector_sync_state orphelins Qdrant | 1h | Deferred |
| — | ~~deleteConversationsProjectsImages supprime bardas/skills~~ | ~~30min~~ | **Fait (`5b29470`) — conservation stricte zone orange** |
