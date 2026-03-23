# Architecture Fonctionnelle — Cruchot (Multi-LLM Desktop)

**Date de creation** : 2026-03-09
**Derniere mise a jour** : 2026-03-23
**Chantiers integres** : phase-setup, barda, sandbox-yolo, right-panel, refactor-workspace-sandbox

## Vision produit

Application desktop locale de chat multi-LLM (10 providers cloud + 2 locaux), generation d'images, TTS cloud, statistiques de couts, **dossier de travail par conversation** (tools toujours actifs, bash libre, confinement Seatbelt), taches planifiees, integration MCP, memory fragments, memoire semantique (RAG local Qdrant), referentiels RAG custom, Remote Telegram, Remote Web, export/import securise (.mlx), slash commands, @mention fichiers, prompt optimizer, drag & drop fichiers, conversations favorites, mode Arena (LLM vs LLM), systeme de bardas thematiques (Gestion de Brigade), **Right Panel (panneau lateral de parametres et options)**. Zero serveur backend.

> **Changements refactor-workspace-sandbox** : suppression du mode YOLO (toggle), suppression de la feature Git, unification workspace/sandbox en "dossier de travail par conversation".

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

### Parcours Dossier de travail — Tools fichiers (REFACTORISE)
```
Nouvelle conversation → Dossier = herite du projet OU ~/.cruchot/sandbox/ (defaut)
  → Utilisateur peut changer le dossier dans Right Panel > Options
  → LLM a toujours acces aux tools (bash, readFile, writeFile, listFiles)
  → Execution confinee par Seatbelt au dossier choisi
  → WorkspacePanel affiche l'arbre de fichiers du dossier
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

### Parcours Right Panel — Acces aux parametres du chat
```
Utilisateur → Nouvelle conversation → Right Panel ouvert automatiquement
  → Ajuste modele, reflexion, role, web search dans "Parametres"
  → Selectionne dossier de travail, referentiel dans "Options"
  → Active/desactive des MCP dans "MCP"
  → Utilise outils rapides (Resume, Optimizer, Fork) dans "Outils"
  → Gere Remote (Telegram, Web) dans "Remote"
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

### [CU-04] Changer le dossier de travail d'une conversation (REFACTORISE)
- **Acteur** : Utilisateur
- **Precondition** : Conversation active
- **Scenario nominal** :
  1. Ouvre le Right Panel (OPT+CMD+B)
  2. Dans la section "Options", clique sur le selecteur de dossier
  3. Choisit un dossier via dialog natif OU garde le defaut (~/.cruchot/sandbox/)
  4. Le dossier est persiste sur la conversation en DB
  5. Le WorkspacePanel se met a jour (arbre de fichiers du nouveau dossier)
  6. Les tools utilisent desormais ce dossier
- **Scenarios alternatifs** :
  - [SA-01] Dossier bloque (/, /System, etc.) → rejet avec message d'erreur
  - [SA-02] Dossier inexistant → creation automatique
- **Postcondition** : `workspace_path` mis a jour en DB, tools confines au nouveau dossier
- **Regles metier** : RM-20, RM-21, RM-22

### [CU-05] Execution autonome avec tools (REFACTORISE — ex YOLO)
- **Acteur** : Utilisateur + LLM
- **Precondition** : Conversation active (toute conversation a un dossier)
- **Scenario nominal** :
  1. Utilisateur saisit une demande (ex: "Cree un site Vite React avec un formulaire")
  2. LLM utilise les tools automatiquement (bash, createFile, readFile, listFiles)
  3. Chaque tool call est affiche en temps reel (ToolCallBlock)
  4. Le LLM s'arrete quand la tache est terminee ou a atteint le step limit
- **Scenarios alternatifs** :
  - [SA-01] Utilisateur annule le stream → tool calls en cours sont interrompus
  - [SA-02] Step limit atteint → LLM s'arrete avec message explicatif
  - [SA-03] Erreur dans un tool call → LLM recoit l'erreur et peut adapter
- **Postcondition** : Fichiers crees/modifies dans le dossier de travail
- **Regles metier** : RM-22, RM-23, RM-24

### [CU-06] Configurer le chat via le Right Panel
- **Acteur** : Utilisateur
- **Precondition** : Vue chat active (pas Arena)
- **Scenario nominal** :
  1. Le panel est ouvert (auto sur nouvelle conversation ou via OPT+CMD+B)
  2. L'utilisateur ajuste les parametres (modele, reflexion, role, web search)
  3. L'utilisateur choisit le dossier de travail dans Options
  4. L'utilisateur consulte les tokens/cout de la conversation
  5. L'utilisateur peut collapse/expand les sections
  6. L'utilisateur ferme le panel quand il n'en a plus besoin
- **Scenarios alternatifs** :
  - [SA-01] Workspace ouvert → ouvrir le Right Panel ferme le Workspace (mutuellement exclusif)
  - [SA-02] Right Panel ouvert → ouvrir le Workspace ferme le Right Panel
  - [SA-03] Mode Arena → Right Panel non disponible
- **Postcondition** : Parametres appliques immediatement
- **Regles metier** : RM-17, RM-18, RM-19

## Regles metier

| ID | Regle | Justification |
|----|-------|---------------|
| RM-01 | Le namespace est unique dans l'app | Evite les collisions entre bardas et entre barda/custom |
| RM-02 | Le namespace se propage a toutes les ressources du barda | Identification claire de l'origine |
| RM-03 | Un barda est importe en tout ou rien (atomique) | Pas d'etat intermediaire |
| RM-04 | Les serveurs MCP existants ne sont pas ecrases | MCP configure manuellement par l'utilisateur |
| RM-05 | La desinstallation ne touche pas aux conversations | Les conversations ont une valeur superieure |
| RM-06 | Le namespace doit matcher `/^[a-z][a-z0-9-]*$/` | Coherence noms, pas de caracteres speciaux |
| RM-07 | Taille max du fichier barda : 1 MB | Prevention DoS sur le parsing |
| RM-08 | Memory fragments limites a 50 total (barda + custom) | Limite existante du system prompt |
| RM-09 | Le toggle ON/OFF masque TOUTES les ressources du namespace | Tout ou rien |
| RM-17 | Right Panel et Workspace Panel mutuellement exclusifs | Un seul panneau lateral droit a la fois |
| RM-18 | Nouvelle conversation = Right Panel ouvert, switch = ferme | Acces rapide aux parametres |
| RM-19 | ContextWindowIndicator retire du bas, tokens/cout dans le Right Panel | Source unique pour ces infos |
| RM-20 | Toute conversation a un `workspace_path` (jamais null) | Tools toujours actifs, pas de mode "sans tools" |
| RM-21 | Le dossier par defaut est `~/.cruchot/sandbox/` | Dossier jetable pour les conversations sans projet specifique |
| RM-22 | L'execution est confinee par Seatbelt au `workspace_path` | Securite par confinement OS |
| RM-23 | Step limit configurable (defaut 50) | Empecher les boucles infinies du LLM |
| RM-24 | Le bash est libre (pas de blocklist applicative) | La securite repose sur Seatbelt, pas sur un filtre de commandes |
| RM-25 | Nouvelle conversation herite du `defaultWorkspacePath` du projet | Coherence au sein d'un projet |
| RM-26 | Le projet ne porte plus de `workspacePath`, mais un `defaultWorkspacePath` | Le projet est un regroupement, pas un lien vers un dossier |

> **Regles supprimees (refactor-workspace-sandbox)** : RM-10 (supportsYolo), RM-11 (warning YOLO), RM-12 (sandbox UUID), RM-14 (timeout global — simplifie en step limit seul), RM-15 (ProcessManager), RM-16 (reseau loopback — reseau autorise)

## Modele de donnees metier

```
[Projet] 1──N [Conversation]
                  │
                  ├── workspace_path (toujours defini)
                  │
                  └── 1──N [Message]

[Barda] 1──N [Role]
         1──N [SlashCommand]
         1──N [Prompt]
         1──N [MemoryFragment]
         1──N [Library (definition)]
         1──N [McpServer (definition)]
```

Relations :
- Un projet a un `defaultWorkspacePath` optionnel (suggestion pour les nouvelles conversations)
- Une conversation a un `workspace_path` obligatoire (defaut `~/.cruchot/sandbox/`)
- Chaque conversation = dossier de travail + tools toujours actifs
- Un barda est identifie par son namespace (unique)
- La desinstallation d'un barda supprime par namespace

> **Supprime (refactor)** : SandboxSession, SandboxProcess, mode 'normal'|'yolo'

## Exigences non-fonctionnelles

| Categorie | Exigence | Priorite |
|-----------|----------|----------|
| Performance | Le parsing d'un barda doit prendre < 100ms | P1 |
| Performance | L'import atomique doit etre transactionnel (rollback si echec) | P0 |
| Securite | Les system prompts sont sanitises (pas d'injection XML/HTML) | P0 |
| Securite | Le namespace est valide strictement (regex) | P0 |
| Securite | Taille max 1 MB pour le fichier barda | P0 |
| Securite | L'execution est confinee au dossier de travail (Seatbelt macOS) | P0 |
| Securite | Path validation (realpathSync + startsWith) sur toutes les operations fichiers | P0 |
| Robustesse | Rejet strict du fichier barda si format invalide | P0 |
| Robustesse | Step limit pour les tool calls du LLM | P0 |
| UX | Preview du contenu barda avant import | P1 |
| UX | Selecteur de dossier dans le Right Panel | P0 |
| UX | WorkspacePanel affiche l'arbre du dossier de la conversation | P0 |
| UX | Filtre par namespace dans les vues existantes | P0 |

> **Supprime (refactor)** : spawn process < 2s, cleanup process < 1s, reseau loopback, cleanup orphelins, warning YOLO, bouton Stop YOLO, preview shell.openExternal

## Contraintes de securite (Security by Design)

- **Donnees sensibles** : les system prompts peuvent contenir du contenu malicieux (prompt injection). Sanitization XML/HTML a l'import. Le LLM genere du code executable → confinement OS obligatoire
- **Authentification** : non applicable (mono-utilisateur)
- **Autorisation** : non applicable
- **Surface d'attaque** :
  - Fichier .md fourni par un tiers → parsing strict, taille limitee, namespace valide
  - Code genere par le LLM → execution confinee par Seatbelt (macOS)
  - Bash libre → confine au dossier de travail, pas de blocklist applicative
  - Operations fichiers → realpathSync + startsWith pour eviter le path traversal
- **Conformite** : aucune
- **Chiffrement** : non applicable

## Priorites

| Priorite | Fonctionnalites |
|----------|----------------|
| P0 (MVP) | Migration DB (workspace_path sur conversations, defaultWorkspacePath sur projets), tools unifies (bash libre + readFile + writeFile + listFiles), Seatbelt confine au workspace_path, suppression Git, suppression YOLO toggle, selecteur dossier dans Right Panel, WorkspacePanel sans Git |
| P1 (confort) | Migration donnees existantes (workspacePath projet → conversations), creation auto ~/.cruchot/sandbox/, nettoyage code mort |

### Right Panel

| Priorite | Fonctionnalites |
|----------|----------------|
| P0 (MVP) | RightPanel assembleur + 5 sections (ParamsSection, OptionsSection avec selecteur dossier, McpSection, ToolsSection, RemoteSection), raccourci OPT+CMD+B |
| P1 (confort) | Animations de transition, persistence etat collapse des sections |
