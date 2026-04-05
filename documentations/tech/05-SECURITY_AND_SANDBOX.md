# Sécurité et Confinement (Sandbox)

La sécurité est un pilier fondamental de Cruchot, car l'application permet à un modèle d'intelligence artificielle (potentiellement sujet aux hallucinations ou aux injections de prompt) d'exécuter des commandes sur la machine de l'utilisateur.

Le modèle de sécurité s'articule autour de trois couches de défense en profondeur.

## 1. Confinement OS (Seatbelt / macOS Sandbox)

La première et plus robuste ligne de défense repose sur les mécanismes natifs du système d'exploitation. Sur macOS, Cruchot utilise `sandbox-exec` (Seatbelt). Le code se trouve dans `src/main/services/seatbelt.ts`.

### 1.1 Principe du "Allow-default, Deny-specific"
Le profil Seatbelt généré dynamiquement pour chaque exécution autorise le fonctionnement normal du shell (pipes, stdout/stderr), mais **bloque strictement** l'accès aux ressources sensibles :
- **Système de fichiers** : L'écriture n'est autorisée **que** dans le dossier de travail de la conversation (`workspacePath`), dans `/tmp` et `/dev`. Toute tentative d'écriture ailleurs est bloquée par le noyau macOS.
- **Dossiers sensibles** : La lecture est explicitement interdite pour les dossiers `.ssh`, `.aws`, `.gnupg`, `.docker`, le Keychain macOS, etc.
- **Fichiers sensibles** : La lecture est interdite pour `.env`, `.npmrc`, `.zsh_history`, etc.
- **Base de données Cruchot** : Le sandbox empêche le LLM d'aller lire ou modifier la base SQLite de l'application.
- **Réseau** : Les connexions sortantes sont restreintes à `localhost` (nécessaire pour Ollama, LM Studio et les serveurs MCP locaux) et au port 443 (HTTPS pour télécharger des paquets). Toute autre connexion réseau est bloquée.

## 2. Nettoyage de l'Environnement et Analyse Bash

Avant même de confiner le processus, la commande générée par le LLM est inspectée statiquement et l'environnement d'exécution est purgé (`src/main/llm/bash-security.ts`).

### 2.1 Environnement Sécurisé (`buildSafeEnv`)
- Le `process.env` complet de Cruchot (qui contient les clés API de l'utilisateur) n'est **jamais** passé au shell.
- Un environnement minimal est construit (PATH restreint, HOME forcé sur le `workspacePath`).

### 2.2 Analyse Statique (23 points de contrôle, 22 actifs)
Toute commande Bash passe par un crible de vérifications par expressions régulières (checks #1 à #23, avec #6 désactivé car les commandes multi-lignes sont légitimes pour les LLM) pour bloquer les comportements suspects, avant même de demander l'autorisation à l'utilisateur :
- **Substitution de commandes** (`$(...)`, `` `...` ``)
- **Redéfinition de variables dangereuses** (`LD_PRELOAD`, `PATH`, `IFS`)
- **Obfuscation** (backslash en milieu de mot, commentaires cachés `#`)
- **Commandes ZSH dangereuses** (`zmodload`, `sysopen`)
- **Échappement de l'environnement** (accès à `/proc/environ`)

### 2.3 Wrapping de Commande
Les commandes sont enveloppées (`wrapCommand`) pour forcer le bon répertoire de travail (`cd`), désactiver les globs étendus (prévention d'attaques par expansion) et rediriger l'entrée standard depuis `/dev/null` (pour éviter qu'une commande interactive ne bloque l'exécution).

## 3. Le Moteur de Permissions (`permission-engine.ts`)

La dernière couche de défense implique directement l'utilisateur.

### 3.1 Commandes Read-Only (Auto-Allow)
Une liste blanche de **~70 commandes** strictement passives (`ls`, `cat`, `grep`, `head`, `tail`, `find`, `pwd`, `date`, `whoami`, `jq`, `diff`, etc.) est définie dans `READONLY_COMMANDS`. Si une commande (y compris les commandes chaînées via `&&`, `||`, `;`, `|`) est composée exclusivement de ces outils, elle est exécutée sans confirmation, car le risque de modification est nul.

### 3.2 Règles Utilisateur (Allow / Deny / Ask)
Pour les autres commandes ou outils (writeFile, serveurs MCP), le moteur évalue les règles configurées par l'utilisateur (stockées en base de données) :
1.  **Deny** : Si une règle d'interdiction "matche" (ex: bloquer l'écriture dans `*.js`), l'outil est rejeté silencieusement.
2.  **Allow** : Si une règle d'autorisation "matche" (ex: autoriser `npm test`), l'outil est exécuté.
3.  **Ask (Défaut)** : Si aucune règle ne correspond, l'exécution est suspendue et une notification dans l'UI demande à l'utilisateur d'approuver ou de refuser manuellement l'action.

## 4. Protections Spécifiques aux Fonctionnalités

### 4.1 Mode YOLO
Le mode YOLO désactive les confirmations de l'utilisateur pour accélérer les tâches. Les protections dures restent actives (23 checks Bash + Seatbelt). Depuis la Session 59, **le mode YOLO ne peut pas être activé via les commandes vocales Gemini Live** — uniquement via les éléments d'interface (sidebar, right-panel). Cela bloque toute attaque par injection vocale de prompt visant à contourner les approbations.

### 4.2 Sécurité d'Installation de Skills
La commande `git clone` dans le système de Skills est restreinte aux URLs GitHub HTTPS uniquement (`https://github.com/owner/repo`). Les transports SSH, `ext::`, et les chemins locaux sont rejetés. Un scanner optionnel (Maton) analyse le code du skill avant installation.

### 4.3 Gemini Live Voice — Restrictions
Le tool `toggle_ui` accessible via Gemini Live Voice permet de montrer/masquer les panneaux de l'interface. Le toggle YOLO est explicitement exclu de la liste des cibles autorisées, empêchant une activation involontaire ou malveillante par commande vocale.

## 5. Historique des Audits

| Audit | Date | Score |
|-------|------|-------|
| S16 | 2026-03-09 | — |
| S20 | 2026-03-11 | — |
| S32 | 2026-03-13 | — |
| S36 | 2026-03-14 | 97/100 |
| S42 — Sandbox | 2026-03-20 | 97/100 |
| S50 — Improvement | 2026-04-02 | 97/100 |
| S59 — Post-Voice | 2026-04-04 | 97/100 |

Score actuel : **97/100** (zéro issue P0/P1 ouverte).
