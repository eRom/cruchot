# Analyse Team — Barda (Gestion de Brigade)

**Date** : 2026-03-20
**Nombre de taches analysees** : 17 (12 P0, 3 P1, 2 P2)

## Niveaux de parallelisme

```
Niveau 1 (parallel) : T01, T02, T07
Niveau 2 (parallel) : T03, T08    ← T03 attend T01, T08 attend T07
Niveau 3 (serial)   : T04         ← attend T02 + T03
Niveau 4 (serial)   : T05         ← attend T04
Niveau 5 (parallel) : T06, T09, T10  ← T06 attend T05, T09/T10 attendent T08
Niveau 6 (parallel) : T11, T12       ← T11 attend T09, T12 attend T06
Niveau 7 (parallel) : T13, T14, T15  ← P1
Niveau 8 (parallel) : T16, T17       ← P2
```

## Chemin critique

T01 → T03 → T04 → T05 → T06 → T12

6 taches en serie sur le backend. Le frontend (T07→T08→T09→T11) est une chaine de 4 qui peut demarrer au Niveau 1 en parallele.

## Goulots d'etranglement

| Tache | Dependants | Commentaire |
|-------|------------|-------------|
| T04 (BardaImportService) | T05 | Tout le backend depend de ce service |
| T08 (Store barda) | T09, T10 | Tout le frontend depend du store |

## Conflits de fichiers

| Fichier | Taches | Risque |
|---------|--------|--------|
| `src/preload/types.ts` | T07, T06 | **Faible** — T07 ajoute les types, T06 les utilise (sequentiel) |
| `src/main/db/schema.ts` | T01 | Aucun conflit (seul T01 le touche) |
| `BrigadeView.tsx` | T09, T13, T14 | **Faible** — T13/T14 sont P1, arrivent apres T09 |

## Verdict

**OUI PARTIEL** — Le parallelisme est possible mais limite par la chaine backend (T01→T03→T04→T05) qui doit etre sequentielle. En revanche, la piste frontend (T07→T08→T09/T10→T11) peut demarrer en parallele du backend des le Niveau 1.

Le gain est modeste car il n'y a que 2 pistes reellement paralleles, et la piste frontend a besoin du bridge (T06) pour la tache T12 (filtre namespace). On recommande **2 agents** pour le P0.

## Composition de team

### Agents

| Agent | Type | Taches | Mode |
|-------|------|--------|------|
| backend-agent | feature-dev | T01, T02, T03, T04, T05, T06 | bypassPermissions |
| frontend-agent | feature-dev | T07, T08, T09, T10, T11 | bypassPermissions |

Note : T12 (filtre namespace) doit etre fait apres que les 2 pistes soient terminees (besoin du bridge + du store).

### Sequencage par vagues

**Vague 1** (parallele) :
- `backend-agent` : T01 (Schema DB) + T02 (Parser)
- `frontend-agent` : T07 (Types) + T08 (Store)

**Vague 2** (parallele) :
- `backend-agent` : T03 (Queries) → T04 (Import Service) → T05 (IPC) → T06 (Preload)
- `frontend-agent` : T09 (BrigadeView) + T10 (BardaCard) → T11 (Navigation)

**Vague 3** (sequentiel — orchestrateur) :
- T12 (Filtre namespace) — touche 6 vues existantes, besoin du bridge complet

**Vague 4 — P1** (sequentiel) :
- T13 (Preview), T14 (Rapport), T15 (Badge)

### Points de synchronisation

- Apres Vague 2 : les 2 agents doivent avoir fini avant de lancer T12
- T12 doit etre fait par un seul agent (touche beaucoup de fichiers renderer existants)

## Estimation du gain

| Metrique | Valeur |
|----------|--------|
| Unites sequentielles (P0) | 12 taches |
| Unites avec team | ~8 unites (Vagues 1+2 en parallele + Vague 3 en serial) |
| Gain estime | ~33% |

## Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Types partages (T07) pas coherents avec le backend | Moyen | T07 est base sur l'architecture-technique.md, pas sur le code backend |
| Frontend avance plus vite que le backend → mocks necessaires | Faible | Le store peut utiliser des donnees mockees en attendant le bridge |
| T12 (filtre namespace) touche 6 vues existantes → merge conflicts | Moyen | Fait en dernier par l'orchestrateur, apres merge des 2 branches |
