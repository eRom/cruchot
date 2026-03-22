# Analyse Team — sandbox-yolo

**Date** : 2026-03-21
**Nombre de taches analysees** : 23 (15 P0, 5 P1, 3 P2)

## Niveaux de parallelisme

```
Niveau 0 (parallel) : T01, T02, T03, T05, T07, T14
Niveau 1 (parallel) : T04, T06, T15           ← attend Niveau 0
Niveau 2 (sequentiel): T08                     ← attend T04, T05, T06, T07
Niveau 3 (sequentiel): T09                     ← attend T06
Niveau 4 (parallel) : T10                      ← attend T09
Niveau 5 (parallel) : T11, T12                 ← attend T10, T14
Niveau 6 (sequentiel): T13                     ← attend T11, T12
```

## Chemin critique

T01 → T04 → T08 (backend integration)
T01 → T06 → T09 → T10 → T11 → T13 (frontend integration)

Le plus long : **T01 → T06 → T09 → T10 → T11 → T13** (6 niveaux)

## Goulots d'etranglement

| Tache | Dependants | Impact |
|-------|-----------|--------|
| T01 SandboxService | T04, T06 (2 taches) | Moyen — doit etre fait en premier |
| T06 sandbox.ipc.ts | T08, T09, T16 (3 taches) | Fort — bloque backend et frontend |
| T10 sandbox.store | T11, T12, T17 (3 taches) | Moyen — bloque tout le frontend |

## Conflits de fichiers

| Fichier | Taches | Risque |
|---------|--------|--------|
| src/main/ipc/index.ts | T06, T08 | Faible (ajout registre) |
| src/main/ipc/chat.ipc.ts | T08 uniquement | Aucun |
| src/preload/types.ts | T09 uniquement | Aucun |
| src/main/db/schema.ts | T07 uniquement | Aucun |

## Verdict

**OUI** — Le parallelisme est significatif : 6 taches independantes au Niveau 0, 2 pistes bien separees (backend / frontend) avec peu de fichiers partages.

## Composition de team

### Agents

| Agent | Type | Taches | Mode |
|-------|------|--------|------|
| backend-core | code-architect | T01, T02, T03, T05, T07, T14, T15 | worktree |
| backend-integration | code-architect | T04, T06, T08 | worktree |
| frontend | code-architect | T09, T10, T11, T12, T13 | worktree |

### Sequencage par vagues

**Vague 1** (parallel) :
- Agent `backend-core` : T01 + T02 + T03 + T05 + T07 + T14
- (frontend attend)

**Vague 2** (parallel) :
- Agent `backend-core` : T15 (cleanup startup)
- Agent `backend-integration` : T04 + T06
- (frontend attend T06)

**Vague 3** (parallel) :
- Agent `backend-integration` : T08 (chat.ipc.ts integration)
- Agent `frontend` : T09 + T10 + T11 + T12 + T13

**Vague 4** (orchestrateur) :
- Merge des 3 worktrees
- Integration test
- Typecheck

### Points de synchronisation

- Apres Vague 1 : les services core sont prets, les types sont definis
- Apres Vague 2 : les IPC handlers existent, le preload peut etre ecrit
- Apres Vague 3 : backend et frontend sont complets independamment
- Vague 4 : merge + validation

## Estimation du gain

| Metrique | Valeur |
|----------|--------|
| Unites sequentielles (P0) | ~15 unites |
| Unites avec team | ~8 unites (4 vagues) |
| Gain estime | ~47% |

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Conflit merge chat.ipc.ts | Moyen | Un seul agent touche ce fichier (backend-integration) |
| Types preload desynchronises | Faible | T09 cree les types, frontend les consomme apres |
| Seatbelt non testable en CI | Moyen | Tests manuels macOS requis, CI teste uniquement le fallback filesystem |
