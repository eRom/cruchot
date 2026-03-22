# Analyse Team — Right Panel

**Date** : 2026-03-22
**Nombre de taches analysees** : 11 (P0)

## Niveaux de parallelisme

```
Niveau 1 (parallel) : T01, T02, T10
Niveau 2 (parallel) : T03, T04, T05, T06    <- attend T01+T02
Niveau 3 (sequentiel) : T07                  <- attend T03+T04+T05+T06
Niveau 4 (parallel) : T08, T09              <- attend T07
Niveau 5 (sequentiel) : T11                  <- attend T08+T09
```

## Chemin critique
T01 → T03 → T07 → T08 → T11

## Goulots d'etranglement
- **T07 (RightPanel assembleur)** : 4 taches dependent de lui en amont, 2 en aval. Mais c'est un composant trivial (~60 lignes), donc pas un vrai goulot.
- **T01 (Store openPanel)** : 4 sections en dependent. Petit fichier, risque faible.

## Conflits de fichiers
| Fichier | Taches | Risque |
|---------|--------|--------|
| ChatView.tsx | T08, T11 | Faible — T08 ajoute le panel, T11 ajoute la logique d'auto-open. Sections distinctes du fichier |
| ui.store.ts | T01 (write), T08/T11 (read) | Aucun — T01 est prerequis |

## Verdict
**OUI PARTIEL** — Les 4 sections (T03-T06) sont 100% parallelisables car elles ne partagent aucun fichier. Mais le volume total est modeste (11 taches, ~700 lignes de code nouveau). 2 agents suffisent.

## Composition de team

### Agents
| Agent | Type | Taches | Mode |
|-------|------|--------|------|
| orchestrateur | principal | T01, T02, T07, T08, T09, T10, T11 | sequentiel |
| agent-sections | worktree | T03, T04, T05, T06 | parallele interne |

### Sequencage par vagues

**Vague 1 — Fondations (orchestrateur)**
- T01 : ui.store openPanel
- T02 : CollapsibleSection
- T10 : Raccourci OPT+CMD+B

**Vague 2 — Sections (agent-sections en worktree)**
- T03 : ParamsSection
- T04 : OptionsSection
- T05 : McpSection
- T06 : ToolsSection
(Executees sequentiellement par l'agent, pas de conflit de fichiers)

**Vague 3 — Assemblage (orchestrateur, apres merge worktree)**
- T07 : RightPanel assembleur

**Vague 4 — Integration (orchestrateur)**
- T08 : ChatView layout
- T09 : InputZone cleanup

**Vague 5 — Finition (orchestrateur)**
- T11 : Comportement ouverture/fermeture auto

### Points de synchronisation
- Apres Vague 2 : merge du worktree agent-sections avant T07
- Apres Vague 4 : verification visuelle avant T11

## Estimation du gain
| Metrique | Valeur |
|----------|--------|
| Unites sequentielles | 11 taches |
| Unites avec team | ~7 unites (4 sections parallelisees) |
| Gain estime | ~35% |

Le gain est modeste car le volume est faible. Le principal avantage est l'isolation : l'agent-sections travaille sur des fichiers 100% nouveaux, zero risque de conflit.

## Risques & Mitigations
| Risque | Impact | Mitigation |
|--------|--------|------------|
| Merge worktree avec conflit | Faible | Les 4 sections sont des fichiers NEW, pas de conflit possible |
| Les sections necessitent des ajustements post-merge | Faible | L'orchestrateur ajuste dans T07 |
| Store pas encore pret quand les sections sont codees | Nul | T01 est dans la Vague 1, prerequis |
