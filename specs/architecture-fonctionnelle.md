# Architecture Fonctionnelle — Cruchot (Multi-LLM Desktop)

**Date de creation** : 2026-03-09
**Derniere mise a jour** : 2026-03-22
**Chantiers integres** : phase-setup, barda, sandbox-yolo, right-panel

## Vision produit

Application desktop locale de chat multi-LLM (10 providers cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, workspace co-work, integration Git, taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), referentiels RAG custom, Remote Telegram, Remote Web, export/import securise (.mlx), slash commands, @mention fichiers, prompt optimizer, drag & drop fichiers, conversations favorites, mode Arena (LLM vs LLM), systeme de bardas thematiques (Gestion de Brigade), mode Sandbox YOLO (execution autonome sandboxee), **Right Panel (panneau lateral de parametres et options)**. Zero serveur backend.

## Personas

### Romain (Utilisateur principal)
- **Qui** : Developpeur senior, power user
- **Objectif** : Centraliser toutes les interactions LLM dans une seule app desktop souveraine
- **Frustration actuelle** : Jongler entre ChatGPT, Claude, Gemini, etc.
- **Frequence d'usage** : Quotidien, intensif

### Utilisateur lambda (beneficiaire des bardas)
- **Qui** : Ami/collegue de Romain, pas forcement technique
- **Objectif** : Utiliser Cruchot avec un kit d'outils pre-configure pour son metier/passion
- **Frustration actuelle** : Ne sait pas par ou commencer, doit tout configurer a la main
- **Frequence d'usage** : Variable, guide par le barda importe

## Parcours utilisateurs

### Parcours principal — Chat multi-LLM
```
Utilisateur → Selectionne modele → Saisit message → IPC → Main: streamText()
→ Forward chunks → Affichage temps reel → Save DB + cout
```

### Parcours YOLO — Execution autonome sandboxee (NOUVEAU)
```
Utilisateur → Active le mode YOLO (toggle + warning)
→ Saisit une demande complexe ("Cree-moi une landing page React")
    ↓
Main: streamText() avec tools YOLO + stepCountIs(N)
    ↓
LLM genere un plan (affiche dans le chat)
    ↓ (utilisateur dit "go" ou equivalent)
LLM enchaine les tool calls automatiquement :
  createFile → installDeps → startServer → ...
    ↓ (chaque step affiche en temps reel)
Utilisateur peut STOP a tout moment
    ↓
Resultat : fichiers crees dans le sandbox dir
→ Bouton "Preview" ouvre dans le navigateur/app OS par defaut
→ Bouton "Stop" kill tous les process enfants
```

### Parcours Barda — Import d'un kit thematique
```
Utilisateur → Gestion de Brigade → "Importer un barda"
→ Selectionne fichier .md → Parsing + validation stricte
    ↓ (erreur)                    ↓ (valide)
  Message d'erreur precis    Preview du contenu (roles, commands, prompts, etc.)
                                  ↓
                              Confirmation → Import atomique (namespace propage)
                                  ↓
                              Rapport post-import (succes, MCP skips, warnings)
                                  ↓
                              Ressources visibles dans les vues existantes (filtrees par namespace)
```

### Parcours Barda — Toggle ON/OFF
```
Utilisateur → Gestion de Brigade → Toggle switch sur un barda
→ Toutes les ressources du namespace masquees/revelees
→ Pas de suppression, juste visibilite
```

### Parcours Barda — Desinstallation
```
Utilisateur → Gestion de Brigade → "Desinstaller" sur un barda
→ Confirmation → Suppression atomique de toutes les ressources du namespace
→ Conversations intactes (roles orphelins acceptes)
→ Ligne barda supprimee du registre
```

### Parcours Right Panel — Acces aux parametres du chat (NOUVEAU)
```
Utilisateur → Nouvelle conversation → Right Panel ouvert automatiquement
  → Ajuste modele, reflexion, role, web search dans "Parametres"
  → Selectionne prompt, referentiel, active YOLO dans "Options"
  → Active/desactive des MCP dans "MCP"
  → Utilise outils rapides (Telegram, Resume, Optimizer, Fork) dans "Outils"
  → Ferme le panel (OPT+CMD+B) → InputZone minimaliste
                                    ↓
Switch vers conversation existante → Panel ferme automatiquement
  → Reouverture manuelle si besoin (OPT+CMD+B ou bouton)
```

## Cas d'usage

### [CU-01] Importer un barda
- **Acteur** : Utilisateur
- **Precondition** : Possede un fichier `.md` au format barda valide
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Clique "Importer un barda"
  3. Selectionne le fichier `.md` via dialog natif
  4. L'app parse et valide le fichier
  5. Preview du contenu avec compteurs par section
  6. Confirme l'import
  7. Les ressources sont creees avec le namespace propage
  8. Rapport post-import affiche
- **Scenarios alternatifs** :
  - [SA-01] Fichier invalide → message d'erreur precis (ligne, section) + rejet complet
  - [SA-02] Namespace deja existant → erreur "Ce barda est deja installe" + stop
  - [SA-03] Memory fragments overflow (50 max) → erreur + stop
  - [SA-04] Serveur MCP existant → skip silencieux + mentionne dans le rapport
- **Postcondition** : Barda enregistre dans le registre, ressources disponibles
- **Regles metier** : RM-01, RM-02, RM-03, RM-04, RM-05

### [CU-02] Toggle ON/OFF un barda
- **Acteur** : Utilisateur
- **Precondition** : Au moins un barda importe
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Toggle le switch d'un barda
  3. Toutes les ressources du namespace sont masquees/revelees dans les vues
- **Postcondition** : Barda ON ou OFF, ressources filtrees dans les listes

### [CU-03] Desinstaller un barda
- **Acteur** : Utilisateur
- **Precondition** : Barda importe
- **Scenario nominal** :
  1. Ouvre la vue "Gestion de Brigade"
  2. Clique "Desinstaller" sur un barda
  3. Confirmation (dialog)
  4. Suppression atomique de toutes les ressources du namespace
  5. Barda retire du registre
- **Postcondition** : Ressources supprimees, conversations intactes

### [CU-04] Activer le mode YOLO (NOUVEAU)
- **Acteur** : Utilisateur
- **Precondition** : Modele compatible YOLO selectionne, workspace ouvert OU mode sans workspace
- **Scenario nominal** :
  1. Active le toggle "Mode YOLO" dans l'interface
  2. Warning dissuasif s'affiche (risques, responsabilite)
  3. Utilisateur confirme
  4. Le mode YOLO est actif (indicateur visuel)
  5. Les tools elargis sont disponibles pour le LLM
  6. Le dossier sandbox est cree (workspace path ou `~/cruchot/sandbox/[UUID]`)
- **Scenarios alternatifs** :
  - [SA-01] Modele non compatible → toggle desactive, tooltip explicatif
  - [SA-02] Utilisateur annule le warning → retour mode Normal
- **Postcondition** : Mode YOLO actif, sandbox pret
- **Regles metier** : RM-10, RM-11, RM-12

### [CU-05] Execution autonome en mode YOLO (NOUVEAU)
- **Acteur** : Utilisateur + LLM
- **Precondition** : Mode YOLO actif
- **Scenario nominal** :
  1. Utilisateur saisit une demande (ex: "Cree un site Vite React avec un formulaire")
  2. LLM genere un plan (affiche dans le chat)
  3. Utilisateur approuve ("go")
  4. LLM enchaine les tool calls automatiquement (create files, install deps, start server...)
  5. Chaque step est affiche en temps reel (ToolCallBlock)
  6. Le LLM s'arrete quand la tache est terminee ou a atteint le step limit
- **Scenarios alternatifs** :
  - [SA-01] Utilisateur clique "Stop" → tous les process enfants sont tues, LLM s'arrete
  - [SA-02] Step limit atteint → LLM s'arrete avec un message explicatif
  - [SA-03] Timeout global atteint → meme comportement que Stop
  - [SA-04] Erreur dans un tool call → LLM recoit l'erreur et peut adapter (retry, alternative)
- **Postcondition** : Fichiers crees dans le sandbox, process enfants nettoyes
- **Regles metier** : RM-13, RM-14, RM-15, RM-16

### [CU-06] Preview du resultat YOLO (NOUVEAU)
- **Acteur** : Utilisateur
- **Precondition** : Des fichiers ont ete crees en mode YOLO
- **Scenario nominal** :
  1. Utilisateur clique sur "Preview" (bouton dans le chat ou dans la toolbar)
  2. Le fichier/serveur est ouvert via l'app par defaut de l'OS (`shell.openExternal`)
  3. Pour un serveur web (Vite, etc.) : le navigateur s'ouvre sur `localhost:PORT`
  4. Pour un fichier HTML : ouverture dans le navigateur par defaut
  5. Pour un script Python : sortie affichee dans le chat
- **Scenarios alternatifs** :
  - [SA-01] Serveur deja demarre → reutilise le port existant
  - [SA-02] Pas de fichier previewable → bouton desactive
- **Postcondition** : Utilisateur voit le resultat

### [CU-07] Configurer le chat via le Right Panel (NOUVEAU)
- **Acteur** : Utilisateur
- **Precondition** : Vue chat active (pas Arena)
- **Scenario nominal** :
  1. Le panel est ouvert (auto sur nouvelle conversation ou via OPT+CMD+B)
  2. L'utilisateur ajuste les parametres (modele, reflexion, role, web search)
  3. L'utilisateur consulte les tokens/cout de la conversation
  4. L'utilisateur peut collapse/expand les sections Options, MCP, Outils
  5. L'utilisateur ferme le panel quand il n'en a plus besoin
- **Scenarios alternatifs** :
  - [SA-01] Workspace ouvert → ouvrir le Right Panel ferme le Workspace (mutuellement exclusif)
  - [SA-02] Right Panel ouvert → ouvrir le Workspace ferme le Right Panel
  - [SA-03] Mode Arena → Right Panel non disponible
- **Postcondition** : Parametres appliques immediatement (memes stores Zustand)
- **Regles metier** : RM-17, RM-18, RM-19

## Regles metier

| ID | Regle | Justification |
|----|-------|---------------|
| RM-01 | Le namespace est unique dans l'app | Evite les collisions entre bardas et entre barda/custom |
| RM-02 | Le namespace se propage a toutes les ressources du barda | Identification claire de l'origine (ex: `ecrivain:resume-chapitre`) |
| RM-03 | Un barda est importe en tout ou rien (atomique) | Pas d'etat intermediaire, pas de ressources orphelines du barda |
| RM-04 | Les serveurs MCP existants ne sont pas ecrases | Le MCP est un systeme critique, l'utilisateur l'a peut-etre configure manuellement |
| RM-05 | La desinstallation ne touche pas aux conversations | Les conversations ont une valeur superieure aux outils |
| RM-06 | Le namespace doit matcher `/^[a-z][a-z0-9-]*$/` | Coherence avec les noms de slash commands, pas de caracteres speciaux |
| RM-07 | Taille max du fichier barda : 1 MB | Prevention DoS sur le parsing |
| RM-08 | Memory fragments limites a 50 total (barda + custom) | Limite existante du system prompt |
| RM-09 | Le toggle ON/OFF masque TOUTES les ressources du namespace | Pas de granularite par type, c'est tout ou rien |
| RM-10 | Mode YOLO restreint aux modeles capables de tool-use multi-step | Les modeles faibles en agentic produisent des resultats inutilisables |
| RM-11 | Activation YOLO requiert un warning explicite et une confirmation | L'utilisateur doit comprendre les risques avant d'activer |
| RM-12 | Le dossier sandbox est le workspace courant OU `~/cruchot/sandbox/[UUID]` | Pas de melange entre sandbox YOLO et fichiers systeme |
| RM-13 | Execution confinee par Seatbelt (macOS) ou filesystem (Windows) | Empecher tout acces hors du dossier sandbox |
| RM-14 | Step limit configurable (defaut 50) + timeout global (defaut 10 min) | Empecher les boucles infinies du LLM |
| RM-15 | Tous les process enfants sont tues au Stop/changement de conversation/quit | Pas de process orphelins |
| RM-16 | Reseau confine au loopback (127.0.0.1) en mode sandbox | Pas d'exfiltration de donnees |
| RM-17 | Right Panel et Workspace Panel mutuellement exclusifs | Un seul panneau lateral droit a la fois, preserve l'espace du chat |
| RM-18 | Nouvelle conversation = Right Panel ouvert, switch conversation = ferme | Acces rapide aux parametres en debut, pas de bruit en cours de discussion |
| RM-19 | ContextWindowIndicator retire du bas, tokens/cout dans le Right Panel | Evite la duplication, le panel est la source unique pour ces infos |

## Modele de donnees metier

```
[Barda] 1──N [Role]
         1──N [SlashCommand]
         1──N [Prompt]
         1──N [MemoryFragment]
         1──N [Library (definition)]
         1──N [McpServer (definition)]

[Conversation] ── mode: 'normal' | 'yolo'
                   ↓ (si yolo)
               [SandboxSession] 1──N [SandboxProcess]
```

Relations :
- Un barda est identifie par son namespace (unique)
- Chaque ressource porte le namespace de son barda source
- Les ressources custom (sans namespace) coexistent avec les ressources de bardas
- La desinstallation supprime par namespace (pas par FK — le namespace est le lien)
- Une conversation YOLO est liee a une session sandbox (dossier + processes)
- Une session sandbox peut avoir 0..N process enfants actifs (serveurs, scripts)

## Exigences non-fonctionnelles

| Categorie | Exigence | Priorite |
|-----------|----------|----------|
| Performance | Le parsing d'un barda doit prendre < 100ms | P1 |
| Performance | L'import atomique doit etre transactionnel (rollback si echec) | P0 |
| Performance | Le spawn d'un process sandbox doit prendre < 2s | P1 |
| Performance | Le cleanup des process au Stop doit etre < 1s | P0 |
| Securite | Les system prompts sont sanitises (pas d'injection XML/HTML) | P0 |
| Securite | Le namespace est valide strictement (regex) | P0 |
| Securite | Taille max 1 MB pour le fichier barda | P0 |
| Securite | Le sandbox confine l'execution au dossier autorise (Seatbelt/filesystem) | P0 |
| Securite | Reseau confine au loopback en mode YOLO | P0 |
| Securite | Process enfants tues systematiquement au cleanup | P0 |
| Robustesse | Rejet strict du fichier barda si format invalide | P0 |
| Robustesse | Step limit + timeout global pour le mode YOLO | P0 |
| Robustesse | Cleanup des process orphelins au demarrage de l'app | P1 |
| UX | Preview du contenu barda avant import | P1 |
| UX | Warning dissuasif avant activation YOLO | P0 |
| UX | Bouton Stop visible en permanence en mode YOLO | P0 |
| UX | Preview via app OS par defaut (shell.openExternal) | P0 |
| UX | Filtre par namespace dans les vues existantes | P0 |

## Contraintes de securite (Security by Design)

- **Donnees sensibles** : les system prompts peuvent contenir du contenu malicieux (prompt injection). Sanitization XML/HTML a l'import. En mode YOLO, le LLM genere du code executable → confinement OS obligatoire
- **Authentification** : non applicable (mono-utilisateur)
- **Autorisation** : non applicable (mais le mode YOLO necessite une confirmation explicite)
- **Surface d'attaque** :
  - Fichier .md fourni par un tiers → parsing strict, taille limitee, namespace valide
  - Code genere par le LLM → execution confinee par Seatbelt (macOS) / filesystem (Windows)
  - Process enfants → timeout, kill signal, cleanup
  - Reseau → loopback only en sandbox
- **Conformite** : aucune
- **Chiffrement** : non applicable (pas de secrets dans un barda, pas de secrets dans le sandbox)

## Priorites

| Priorite | Fonctionnalites |
|----------|----------------|
| P0 (MVP) | Parseur Markdown barda, validation, import atomique, table `bardas`, namespace, vue Brigade, filtre namespace. **YOLO** : toggle mode, warning, sandbox dir, tools YOLO (bash unrestricted, createFile, readFile, listFiles), profil Seatbelt macOS, process manager, step limit, Stop button, cleanup |
| P1 (confort) | Preview barda, rapport post-import, toggle ON/OFF. **YOLO** : preview via shell.openExternal, startServer tool (Vite/Python http.server), filesystem isolation Windows, orphan process cleanup au startup, timeout global configurable |
| P2 (nice-to-have) | Export barda, catalogue exemples. **YOLO** : installDeps tool (npm/pip), modeles eligibles configurables, bubblewrap Linux (prevu hors scope) |

### Right Panel (NOUVEAU)

| Priorite | Fonctionnalites |
|----------|----------------|
| P0 (MVP) | RightPanel assembleur + 4 sections (ParamsSection, OptionsSection, McpSection, ToolsSection), migration controles depuis InputZone, layout mutuellement exclusif avec WorkspacePanel, raccourci OPT+CMD+B, comportement ouvert/ferme sur switch conversation |
| P1 (confort) | Animations de transition, persistence etat collapse des sections, tooltip enrichis |
