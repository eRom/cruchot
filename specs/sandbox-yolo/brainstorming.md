# Brainstorming : sandbox-yolo

**Date** : 2026-03-21
**Statut** : Decide
**Mode** : Ajout de fonctionnalite

## Idee initiale
Ajouter a Cruchot un mode d'execution autonome ("YOLO") inspire de Claude Cowork, ou le LLM peut enchainer des actions (creer des fichiers, executer du code, previsualiser des resultats HTML/Python/Node) sans approbation step-by-step, dans un environnement sandbox confine par OS (Seatbelt macOS, filesystem Windows, bubblewrap Linux prevu).

## Hypotheses validees
- Deux modes distincts : Normal (sandbox actuelle avec blocklist) et YOLO (execution autonome confinee)
- L'utilisateur selectionne le mode explicitement, avec un warning dissuasif
- Seatbelt (`sandbox-exec`) est le standard de facto pour le sandboxing macOS — utilise par Claude Code, Codex, Chromium, Slack
- Execution native (Python/Node/Bash systeme), pas de Docker/WASM/Pyodide
- Dossier sandbox isole : `~/cruchot/sandbox/[UUID]` sans workspace, workspace path avec workspace
- Preview via `shell.openExternal` (navigateur/app par defaut de l'OS)
- Process manager robuste necessaire (Vite, Python, Node — killable, stoppable, annulable)
- Mode YOLO restreint a certains modeles (ceux capables de tool-use multi-step)
- Flow plan/code : le LLM montre un plan, attend un "go", puis execute avec bouton stop

## Hypotheses rejetees
- Docker comme prerequis (casse le zero-infra, utilisateur peut ne pas l'avoir)
- Pyodide/WASM (trop limite, pas de pip, pas de filesystem reel)
- Preview dans un right panel Electron (trop contraint, shell.openExternal suffit)
- Assouplir le bash tool existant (on cree un contexte separe, on ne touche pas au mode Normal)
- Tous les modeles en YOLO (certains providers sont mauvais en multi-step agentic)

## Risques identifies
- `sandbox-exec` deprecated par Apple (mais Chromium en depend, risque faible a moyen terme)
- Isolation filesystem Windows = best-effort, pas d'isolation OS reelle
- Un LLM en mode autonome peut boucler indefiniment → necessite un step limit + timeout
- Process enfants orphelins si crash de l'app → cleanup au demarrage
- Le profil Seatbelt SBPL est complexe a ecrire et tester
- Spawn de serveurs (Vite) = ports locaux ouverts → confiner au loopback

## Alternatives considerees
| Approche | Priorise | Sacrifie |
|----------|----------|----------|
| A — Seatbelt natif macOS + filesystem Win + bwrap Linux | Securite OS-level, zero infra, pattern prouve (Claude Code) | Portabilite (profil par OS), API deprecated macOS |
| B — Isolation filesystem pure (toutes plateformes) | Simplicite, cross-platform uniforme | Pas d'isolation OS reelle, contournable |
| C — Docker micro-container | Isolation parfaite, reproductible | Docker requis, latence, complexite, casse zero-infra |

## Decision retenue
**Approche A — Sandbox hybride par OS** : Seatbelt custom sur macOS, isolation filesystem sur Windows, bubblewrap prevu sur Linux (hors scope v1). On reutilise les patterns prouves par Anthropic/OpenAI.

## Prerequis avant implementation
1. Ecrire le profil SBPL Seatbelt (inspire de Codex seatbelt.rs)
2. Concevoir le process manager (lifecycle tracking des child processes)
3. Definir la liste des modeles eligibles au mode YOLO
4. Definir le set de tools elargi pour le mode YOLO
5. Concevoir le flow plan → approve → execute → preview

## Hors scope (explicitement exclu)
- Docker / containers
- bubblewrap Linux (prevu mais pas cette version)
- Langages autres que HTML/JS, Python, Node, Bash
- Remote execution (tout est local)
- Jupyter notebooks / REPL interactif
- Modification du mode Normal existant
- MCP tools en mode YOLO (trop complexe pour v1)

## Contraintes de securite identifiees
- Execution de code arbitraire genere par un LLM → confinement OS obligatoire
- Filesystem : ecriture uniquement dans le dossier sandbox ou workspace
- Reseau : loopback seulement (pas d'exfiltration de donnees)
- Process : pas de fork bomb, pas de privilege escalation
- Step limit + timeout global pour eviter les boucles infinies du LLM
- Warning explicite a l'activation du mode YOLO
- Cleanup des process enfants au stop/changement de conversation/crash
