# Analyse Team — refactor-workspace-sandbox

**Date** : 2026-03-23
**Nombre de taches analysees** : 12

## Niveaux de parallelisme

```
Vague 1 (parallel) : T01, T02, T03, T04     ← Suppressions independantes
Vague 2 (parallel) : T05, T06, T10          ← Core + cleanup preload (T05+T06 backend, T10 preload)
Vague 3 (parallel) : T07, T08, T09          ← Refactor chat + UI
Vague 4 (sequentiel) : T11, T12             ← Polish + validation finale
```

## Chemin critique
T03 → T06 → T07 → T11 → T12

## Goulots d'etranglement
- **T05 (Migration DB)** : T07, T08, T09 dependent tous de T05
- **T07 (Chat.ipc.ts)** : T11 et T12 en dependent

## Conflits de fichiers

| Fichier | Taches | Risque |
|---------|--------|--------|
| `src/main/db/schema.ts` | T03, T05 | Moyen — sections differentes |
| `src/main/ipc/index.ts` | T01, T03 | Faible — lignes differentes |
| `src/main/ipc/chat.ipc.ts` | T03, T07 | Eleve — memes blocs de code |
| `src/preload/index.ts` | T08, T10 | Moyen — T10 retire, T08 ajoute |
| `OptionsSection.tsx` | T04, T08 | Moyen — meme zone du composant |

## Verdict

**OUI PARTIEL** — Les vagues 1 et 2 se pretent bien au parallelisme (suppressions independantes). Mais les vagues 3-4 ont trop de dependances croisees et de fichiers partages pour beneficier de plus de 2 agents.

**Recommandation** : 2 agents en vague 1 (backend + frontend), puis orchestrateur sequentiel pour les vagues 2-4.

## Composition de team

### Agents

| Agent | Type | Taches | Mode |
|-------|------|--------|------|
| backend-cleanup | worktree | T01, T03 | Suppression Git + YOLO backend |
| frontend-cleanup | worktree | T02, T04 | Suppression Git + YOLO frontend |
| orchestrateur | main | T05, T06, T07, T08, T09, T10, T11, T12 | Sequentiel apres merge vague 1 |

### Sequencage par vagues

**Vague 1** (2 agents paralleles en worktrees) :
- `backend-cleanup` : T01 + T03 — supprimer Git backend + YOLO backend
- `frontend-cleanup` : T02 + T04 — supprimer Git frontend + YOLO frontend

**Sync point** : merge des 2 worktrees dans la branche principale

**Vague 2-4** (orchestrateur sequentiel) :
- T05 : Migration DB
- T06 : Tools unifies (conversation-tools.ts)
- T10 : Preload/Types cleanup
- T07 : Chat.ipc.ts refactor
- T08 : UI selecteur dossier
- T09 : UI WorkspacePanel
- T11 : Heritage projet
- T12 : Code mort final

### Points de synchronisation
- Apres Vague 1 : merge worktrees, verifier compilation, resoudre conflits sur schema.ts et ipc/index.ts

## Estimation du gain

| Metrique | Valeur |
|----------|--------|
| Unites sequentielles | 12 taches |
| Unites avec team | ~8 passes (4 en parallele vague 1, 8 sequentielles) |
| Gain estime | ~30% |

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Conflits merge sur schema.ts | Moyen | Les 2 agents touchent des sections differentes (Git vs YOLO) |
| ipc/index.ts modifie par les 2 agents | Faible | Chacun retire une ligne differente — merge trivial |
| Typecheck casse apres merge vague 1 | Moyen | Verifier compilation avant de lancer vague 2 |
| preload/index.ts conflit T08 vs T10 | Moyen | T10 fait le menage, T08 ajoute — ordre important |
