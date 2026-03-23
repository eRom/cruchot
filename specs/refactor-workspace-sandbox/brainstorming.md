# Brainstorming : refactor-workspace-sandbox

**Date** : 2026-03-23
**Statut** : Decide
**Mode** : Ajout de fonctionnalite

## Idee initiale
Simplifier l'architecture workspace/sandbox en un seul concept : chaque conversation a toujours un dossier de travail (choisi ou `~/.cruchot/sandbox/` par defaut), avec un seul jeu de tools toujours actifs et bash libre. Supprimer le mode YOLO (toggle), supprimer Git, unifier les tools.

## Hypotheses validees
- 1 projet = regroupement logique de conversations, rien a voir avec les fichiers
- Le dossier de travail est porte par la conversation, pas par le projet
- Toute conversation a un dossier : soit choisi par l'utilisateur, soit `~/.cruchot/sandbox/` par defaut
- Les tools (bash, fichiers) sont toujours actifs — pas de mode "sans tools"
- Le bash est libre (pas de blocklist), la securite repose sur le confinement Seatbelt + les regles dans le prompt
- Nouvelles conversations heritent automatiquement du `defaultWorkspacePath` du projet (si defini)
- Le system prompt du projet est utilise et reste en place
- La feature Git entiere est supprimee (GitService, ChangesPanel, DiffView, AI Commit)

## Hypotheses rejetees
- Toggle YOLO explicite (remplace par "tools toujours actifs")
- Sandbox isole dans un UUID (`~/cruchot/sandbox/[UUID]`) — remplace par un dossier partage `~/.cruchot/sandbox/`
- Bash avec blocklist de securite — remplace par bash libre + Seatbelt
- Isolation entre conversations sans dossier explicite — accepte comme non necessaire (mono-utilisateur)

## Risques identifies
- Bash libre sur un vrai repo : le LLM peut casser des fichiers. Mitigation = Seatbelt + regles prompt + consentement implicite
- `~/.cruchot/sandbox/` partage entre toutes les conversations sans dossier explicite : pas d'isolation. Acceptable mono-utilisateur
- Suppression de Git : perte de fonctionnalite. Decision explicite de Romain

## Alternatives considerees
| Approche | Priorise | Sacrifie |
|----------|----------|----------|
| A. Statu quo (3 chemins : projet/workspace, manuel, YOLO sandbox) | Flexibilite, isolation sandbox | Simplicite, coherence |
| B. Dossier par conversation + toggle YOLO (bash restreint vs libre) | Securite graduee | Simplicite (2 modes restent) |
| **C. Dossier par conversation, tools toujours actifs, bash libre** | **Simplicite radicale, UX unifiee** | **Securite graduee (tout ou rien)** |

## Decision retenue
**Approche C** — Un seul concept, zero toggle. Chaque conversation a un dossier, les tools sont toujours la. La simplicite l'emporte sur la granularite de securite, couverte par Seatbelt + prompt.

## Prerequis avant implementation
1. Spec technique detaillee (migration DB, fusion tools, suppression Git, UI)
2. Plan de migration pour les conversations existantes
3. Identifier tous les fichiers impactes

## Hors scope (explicitement exclu)
- Isolation entre conversations partageant `~/.cruchot/sandbox/`
- Gestion multi-dossiers par conversation
- Restauration de la feature Git
- i18n

## Contraintes de securite identifiees
- Bash libre confine par Seatbelt au `workspacePath` de la conversation
- Regles de comportement injectees via le system prompt (pas de rm -rf, etc.)
- Path validation (realpathSync + startsWith) pour les operations fichiers
- Dossier `~/.cruchot/sandbox/` cree automatiquement avec les bonnes permissions
- Pas d'exfiltration reseau grace au profil Seatbelt (`allow network*` — reseau autorise par choix, cf brainstorm)
