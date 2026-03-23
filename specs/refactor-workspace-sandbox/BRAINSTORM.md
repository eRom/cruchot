# Decision : Refactor Workspace + Sandbox → Dossier de travail par conversation

**Date** : 2026-03-23
**Statut** : Decide

## Idee initiale
Simplifier l'architecture workspace/sandbox en un seul concept : chaque conversation a un dossier de travail (toujours defini), avec tools toujours actifs et confinement Seatbelt. Le mode YOLO disparait en tant que toggle — c'est le comportement par defaut.

## Hypotheses validees
- 1 projet = regroupement logique de conversations, rien a voir avec les fichiers
- Le dossier de travail est porte par la conversation, pas par le projet
- Toute conversation a un dossier : soit choisi par l'utilisateur, soit `~/.cruchot/sandbox/` par defaut
- Les tools (bash, fichiers) sont toujours actifs — pas de mode "sans tools"
- Le bash est libre (pas de blocklist), la securite repose sur le confinement Seatbelt + les regles dans le prompt
- Nouvelles conversations heritent automatiquement du `defaultWorkspacePath` du projet (si defini)
- Le system prompt du projet est utilise et reste en place

## Risques identifies
- Bash libre sur un vrai repo : un LLM peut casser des fichiers. Mitigation = Seatbelt + regles prompt + l'utilisateur est averti
- `~/.cruchot/sandbox/` partage entre toutes les conversations sans dossier explicite : pas d'isolation entre elles. Acceptable pour un outil mono-utilisateur
- Suppression de Git (feature entiere) : perte de fonctionnalite. Mais Romain le veut explicitement

## Alternatives considerees
| Approche | Priorise | Sacrifie |
|----------|----------|----------|
| A. Statu quo (3 chemins : projet/workspace, manuel, YOLO sandbox) | Flexibilite, isolation sandbox | Simplicite, coherence |
| B. Dossier par conversation + toggle YOLO (bash restreint vs libre) | Securite graduee | Simplicite (2 modes restent) |
| **C. Dossier par conversation, tools toujours actifs, bash libre** | **Simplicite radicale, UX unifiee** | **Securite graduee (tout ou rien)** |

## Decision retenue
**Approche C** — Un seul concept, zero toggle. Chaque conversation a un dossier, les tools sont toujours la. La simplicite l'emporte sur la granularite de securite, qui est suffisamment couverte par Seatbelt + prompt.

## Ce qui est supprime
- **Git** : GitService, ChangesPanel, DiffView, AI Commit, git.ipc.ts, onglet Git du WorkspacePanel
- **YOLO toggle** : YoloToggle.tsx, YoloStatusBar.tsx, sandbox.store.ts, warning dialog
- **SandboxService** : plus de sessions UUID dans `~/cruchot/sandbox/`
- **ProcessManagerService** : tracking de process enfants
- **Dual tools** : workspace-tools.ts + yolo-tools.ts fusionnes en un seul jeu
- **Schema** : `is_yolo`, `sandbox_path`, `supportsYolo` sur les modeles
- **Projet** : `workspacePath` migre vers les conversations

## Ce qui reste
- **Seatbelt** : confine au `workspacePath` de la conversation
- **WorkspacePanel** : arbre de fichiers (sans onglet Git)
- **System prompt projet** : injecte dans le chat
- **Un seul jeu de tools** : bash (libre), readFile, writeFile/createFile, listFiles

## Ce qui change
- **Table `conversations`** : ajout `workspace_path` TEXT NOT NULL DEFAULT '~/.cruchot/sandbox/'
- **Table `projects`** : `workspace_path` renomme en `default_workspace_path` (suggestion pour nouvelles conversations)
- **Nouvelle conversation** : herite `defaultWorkspacePath` du projet, sinon `~/.cruchot/sandbox/`
- **Right panel OptionsSection** : selecteur de dossier (remplace le YoloToggle)
- **chat.ipc.ts** : un seul chemin, tools toujours construits depuis `conversation.workspacePath`
- **Correction** : `~/cruchot/sandbox/` → `~/.cruchot/sandbox/` (point manquant)

## Prerequis avant implementation
1. Spec technique detaillee (migration DB, fusion tools, suppression Git, UI)
2. Plan de migration pour les conversations existantes (recuperer workspacePath du projet)
3. Identifier tous les fichiers impactes par la suppression de Git

## Hors scope (explicitement exclu)
- Isolation entre conversations partageant `~/.cruchot/sandbox/`
- Gestion multi-dossiers par conversation
- Restauration de la feature Git
- i18n
