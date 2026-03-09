# Analyse Team — Multi-LLM Desktop

**Date** : 2026-03-09
**Source** : [TASKS.md](./TASKS.md) — 60 tâches, 3 phases
**Nombre de tâches analysées** : 60

---

## Résumé du graphe

### Niveaux de parallélisme

```
Niveau 0  :  T01                                                        (1)
Niveau 1  :  T02, T03, T04                                             (3)
Niveau 2  :  T05, T12, T19                                             (3)
Niveau 3  :  T06, T07, T13, T14, T15                                   (5)
Niveau 4  :  T08, T09, T10                                             (3)
Niveau 5  :  T11                                                        (1) ← goulot
Niveau 6  :  T16, T17                                                   (2)
Niveau 7  :  T18                                                        (1)
Niveau 8  :  T20                                                        (1) ← goulot
═══════════ FIN P0 ═══ DÉBUT P1 ═══════════════════════════════════════
Niveau 9  :  T21, T22,                                                 (16) ← parallélisme max
              T27, T28, T29, T30, T33, T34,
              T35, T38, T39, T40, T41, T42,
              T43, T45
Niveau 10 :  T31, T32, T36, T37, T44                                   (5)
═══════════ FIN P1 ═══ DÉBUT P2 ═══════════════════════════════════════
Niveau 11 :  T46, T47, T48, T49, T50, T52,                             (14)
              T53, T54, T55, T56, T57, T58, T59, T60
Niveau 12 :  T51                                                        (1)
```

### Chemin critique

```
T01 → T03 → T05 → T06 → T08 → T11 → T17 → T18 → T20 → T38 → T37 → T60 → T51
```

**Profondeur : 13 niveaux**

### Goulots d'étranglement

| Tâche | Nombre de dépendants directs | Rôle |
|-------|------------------------------|------|
| **T01** | 3 (T02, T03, T04) | Point de départ unique |
| **T06** | 3 (T08, T09, T10) | Les 3 providers MVP en dépendent |
| **T11** | 2 (T16, T17) | Convergence des providers → persistence |
| **T20** | **16** tâches P1 | Toute la phase P1 attend cette tâche |
| **T37** | **10** tâches P2 | La majorité de P2 attend les stats |

---

## Conflits de fichiers détectés

| Fichier | Tâches concernées | Risque | Mitigation |
|---------|-------------------|--------|------------|
| `src/renderer/src/components/chat/InputZone.tsx` | T15, T18, T29, T31, T33, T42, T44, T46, T48 | **Élevé** | Un seul agent "possède" ce fichier par vague |
| `src/main/ipc/index.ts` | T04, T16, T28-T31, T33-T35, T37 | **Moyen** | Registre d'imports — ajouts non conflictuels |
| `src/renderer/src/components/chat/MessageItem.tsx` | T14, T18, T32, T45, T47 | **Moyen** | Ajout de props/sections indépendantes |
| `src/main/ipc/chat.ipc.ts` | T11, T17, T38, T42, T44 | **Moyen** | Ajout de handlers séparés |
| `src/renderer/src/components/layout/Sidebar.tsx` | T13, T28, T34 | **Faible** | Ajout de sections |
| `src/main/db/schema.ts` | T03, T34, T45 | **Faible** | Ajout de tables/colonnes |
| `src/renderer/src/App.tsx` | T19, T39, T40, T50 | **Faible** | Composition de providers |
| `src/renderer/src/stores/settings.store.ts` | T12, T19, T41 | **Faible** | Ajout de champs |
| `package.json` | T01, T03, T60 | **Faible** | Phases différentes |

---

## Verdict

**OUI PARTIEL — Team sur P1 et P2, séquentiel sur P0.**

P0 a un chemin critique profond (13 niveaux) avec des dépendances croisées main/renderer qui limitent le parallélisme réel. Le gain d'une team serait marginal (~20%) pour un risque de conflits élevé sur les fichiers fondateurs. En revanche, **P1 explose à 20 tâches parallèles** après T20, réparties sur des fichiers distincts — c'est le cas d'usage parfait pour une agent team. P2 offre aussi 14 tâches parallèles.

---

## Composition de team proposée

### Phase P0 — Séquentiel (1 agent leader)

L'agent leader exécute les 20 tâches P0 séquentiellement. Il peut ponctuellement lancer un sous-agent pour paralléliser :
- Niveau 1 : T02 (frontend) et T03 (backend) en parallèle après T01
- Niveau 4 : T08, T09, T10 (3 providers AI SDK) en parallèle

Mais la coordination reste centralisée.

### Phase P1 — 4 agents parallèles

| Agent | Nom | Type | Mode | Tâches | Fichiers isolés |
|-------|-----|------|------|--------|-----------------|
| A | `llm` | general-purpose | bypassPermissions | T21, T22 | `src/main/llm/router.ts, providers.ts, cost-calculator.ts, image.ts, src/main/services/openrouter.service.ts, local-providers.service.ts` |
| B | `features-main` | general-purpose | bypassPermissions | T28, T29, T30, T34, T35, T36, T38 | `src/main/db/queries/`, `src/main/ipc/`, `src/main/services/` |
| C | `features-ui` | general-purpose | bypassPermissions | T27, T32, T39, T40, T43, T44, T45 | `src/renderer/src/components/chat/`, `src/renderer/src/hooks/` |
| D | `features-rich` | general-purpose | bypassPermissions | T31, T33, T37, T41, T42 | `src/renderer/src/components/images,statistics,settings/`, `src/renderer/src/locales/` |

#### Règles d'isolation des fichiers

- **Agent A** : ne touche QUE `src/main/llm/` + `src/main/services/openrouter.service.ts` + `src/main/services/local-providers.service.ts` — AI SDK config, zéro conflit
- **Agent B** : possède `src/main/db/queries/`, `src/main/ipc/` (sauf chat.ipc.ts), `src/main/services/`
- **Agent C** : possède `src/renderer/src/components/chat/` y compris `InputZone.tsx` et `MessageItem.tsx`
- **Agent D** : possède `src/renderer/src/components/images/`, `statistics/`, `src/renderer/src/locales/`

#### Fichiers partagés — protocole

| Fichier partagé | Propriétaire | Autres agents |
|-----------------|-------------|---------------|
| `src/main/ipc/index.ts` | Agent B | A, C, D ajoutent un import — merge trivial |
| `InputZone.tsx` | Agent C | D ajoute des props via interface — C intègre |
| `preload/index.ts` | Agent B | Ajouts de méthodes — merge linéaire |
| `stores/*.store.ts` | Agent C | D crée de nouveaux stores — pas de conflit |

### Phase P2 — 3 agents parallèles

| Agent | Nom | Type | Mode | Tâches |
|-------|-----|------|------|--------|
| E | `voice-a11y` | general-purpose | bypassPermissions | T46, T47, T48, T53, T54 |
| F | `data-infra` | general-purpose | bypassPermissions | T49, T52, T55, T56, T57, T60 |
| G | `ux-polish` | general-purpose | bypassPermissions | T50, T58, T59 |

Puis T51 (auto-update) séquentiel après T60.

---

## Séquençage par vagues

```
┌─────────────────────────────────────────────────────────────────────┐
│ VAGUE 0 — Séquentiel (1 agent)                                     │
│                                                                     │
│  T01 → T02/T03/T04 → T05 → T06 → T08/T09/T10 → T11               │
│  → T12-T15 → T16-T17 → T18 → T19-T20                              │
│                                                                     │
│  Sous-parallélisme ponctuel :                                       │
│    T02 ‖ T03 ‖ T04     (après T01)                                 │
│    T08 ‖ T09 ‖ T10     (après T06)                                 │
│    T13 ‖ T14 ‖ T15     (après T12)                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ══════ SYNC P0 ══════
                    Validation : l'app démarre,
                    on chatte en streaming,
                    les messages sont persistés.
                              │
┌─────────────────────────────────────────────────────────────────────┐
│ VAGUE 1 — 4 agents parallèles (P1)                                 │
│                                                                     │
│  Agent A (llm)           : T21, T22                                │
│  Agent B (features-main) : T28, T29, T30, T34, T35, T38           │
│  Agent C (features-ui)   : T27, T39, T40, T43, T45                │
│  Agent D (features-rich) : T33, T41, T42                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ══════ SYNC P1a ══════
                    Merge des 4 branches.
                    Résolution conflits ipc/index.ts.
                    Tests de base.
                              │
┌─────────────────────────────────────────────────────────────────────┐
│ VAGUE 2 — 4 agents parallèles (P1 suite — dépendances résolues)   │
│                                                                     │
│  Agent A : (terminé)                                                │
│  Agent B : T36 (après T35)                                          │
│  Agent C : T32 (après T23), T44 (après T43)                        │
│  Agent D : T31 (après T24), T37 (après T38)                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ══════ SYNC P1b ══════
                    Merge final P1.
                    Tests E2E complets.
                    Toutes les features fonctionnent.
                              │
┌─────────────────────────────────────────────────────────────────────┐
│ VAGUE 3 — 3 agents parallèles (P2)                                 │
│                                                                     │
│  Agent E (voice-a11y) : T46, T47, T48, T53, T54                   │
│  Agent F (data-infra) : T49, T52, T55, T56, T57, T60              │
│  Agent G (ux-polish)  : T50, T58, T59                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ══════ SYNC P2 ══════
                    Merge final.
                    Tests E2E + packaging.
                              │
┌─────────────────────────────────────────────────────────────────────┐
│ VAGUE 4 — Séquentiel                                                │
│                                                                     │
│  T51 (auto-update) — après T60                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Points de synchronisation obligatoires

| Point | Après | Raison |
|-------|-------|--------|
| **SYNC P0** | Vague 0 (T20 terminé) | L'app MVP doit fonctionner. Validation manuelle : démarrage, chat streaming, persistence, thème. Sans ça, les agents P1 construisent sur du sable. |
| **SYNC P1a** | Vague 1 | Merge des 4 branches worktree. Résolution des conflits sur `ipc/index.ts` et `preload/index.ts`. Vérification que les providers AI SDK compilent. |
| **SYNC P1b** | Vague 2 | Merge final P1. Tests E2E : images, recherche web, stats, FTS, export/import. Validation que `InputZone.tsx` intègre tous les ajouts sans régression. |
| **SYNC P2** | Vague 3 | Merge final. Tests : voix, offline, notifications, packaging. Validation du build distribué. |

---

## Estimation du gain

| Métrique | Valeur |
|----------|--------|
| Unités séquentielles totales | 60 unités |
| P0 séquentiel | 13 unités (chemin critique) |
| P1 avec team (4 agents) | 5 unités (niveaux 9-10 compressés) + 1 sync |
| P2 avec team (3 agents) | 4 unités (niveau 11 compressé) + 1 sync |
| P2 finale séquentielle | 1 unité (T51) |
| **Total avec team** | **~24 unités** |
| **Gain estimé** | **~60%** |

### Détail du gain par phase

| Phase | Séquentiel | Avec team | Gain |
|-------|------------|-----------|------|
| P0 (20 tâches) | 13 unités | 13 unités (séquentiel) | 0% |
| P1 (21 tâches) | 21 unités | 6 unités (4 agents) | **71%** |
| P2 (15 tâches) | 15 unités | 5 unités (3 agents) | **67%** |
| Syncs | 0 | 4 unités | — |
| **Total** | **49 unités** | **28 unités** | **~43%** |

> Note : les unités P0 comptent le chemin critique (13) et non les 20 tâches, car certaines sont déjà parallélisables en interne.

---

## Risques & Mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Conflits de merge sur `InputZone.tsx` | Élevé | Moyen | Agent C est le propriétaire exclusif. Les autres agents définissent des interfaces/props dans leurs propres fichiers. L'intégration dans InputZone est faite par Agent C uniquement. |
| Conflits sur `ipc/index.ts` | Moyen | Élevé | Chaque agent crée son propre fichier IPC (`projects.ipc.ts`, `images.ipc.ts`). L'index ne fait que les importer — le merge est un ajout de lignes. |
| Divergence de conventions de code | Moyen | Moyen | CLAUDE.md est la source de vérité. Chaque agent le lit au démarrage. Les patterns (stores, IPC, composants) sont établis en P0. |
| Agent bloqué / en erreur | Faible | Moyen | Les tâches sont indépendantes. Un agent bloqué ne bloque pas les autres (sauf ses propres dépendances internes). |
| Types partagés incohérents | Moyen | Faible | Les types AI SDK sont fournis par le Vercel AI SDK. Les agents lisent mais ne modifient pas. |
| Conflits sur `preload/index.ts` | Moyen | Moyen | Agent B est le propriétaire. Les autres agents documentent les méthodes à ajouter dans un fichier `preload-additions.md`. Agent B intègre au sync. |
| Régression après merge P1 | Élevé | Moyen | Suite de tests Vitest exécutée systématiquement au sync. Tests E2E Playwright sur les flux critiques. |

---

## Recommandation finale

1. **Commencer P0 en solo** — c'est le fondement. Pas de raccourci possible.
2. **Lancer la team à 4 agents dès que T20 est validé** — c'est là que le gain est maximal.
3. **Utiliser le mode `worktree`** pour chaque agent P1/P2 — isolation git native.
4. **Prévoir 30 min de merge/validation** à chaque point de sync.
5. **Agent A (llm) finira en premier** — ses 2 tâches (OpenRouter + providers locaux) sont simples et isolées. Le réassigner à du support ou des tests.

Le vrai risque n'est pas technique, c'est la discipline de merge. Si chaque agent respecte son périmètre de fichiers, les conflits seront triviaux.
