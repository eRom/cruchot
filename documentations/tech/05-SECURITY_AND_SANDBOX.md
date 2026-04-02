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
- **Réseau** : Les connexions sortantes sont restreintes à localhost (pour les serveurs de dev) et au port 443 (HTTPS pour télécharger des paquets).

## 2. Nettoyage de l'Environnement et Analyse Bash

Avant même de confiner le processus, la commande générée par le LLM est inspectée statiquement et l'environnement d'exécution est purgé (`src/main/llm/bash-security.ts`).

### 2.1 Environnement Sécurisé (`buildSafeEnv`)
- Le `process.env` complet de Cruchot (qui contient les clés API de l'utilisateur) n'est **jamais** passé au shell.
- Un environnement minimal est construit (PATH restreint, HOME forcé sur le `workspacePath`).

### 2.2 Analyse Statique (22 points de contrôle)
Toute commande Bash passe par un crible de vérifications par expressions régulières pour bloquer les comportements suspects, avant même de demander l'autorisation à l'utilisateur :
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
Une liste blanche d'une quarantaine de commandes strictement passives (`ls`, `cat`, `grep`, `pwd`, `date`, `whoami`) est définie. Si une commande est composée exclusivement de ces outils, elle est exécutée sans confirmation, car le risque de modification est nul.

### 3.2 Règles Utilisateur (Allow / Deny / Ask)
Pour les autres commandes ou outils (writeFile, serveurs MCP), le moteur évalue les règles configurées par l'utilisateur (stockées en base de données) :
1.  **Deny** : Si une règle d'interdiction "matche" (ex: bloquer l'écriture dans `*.js`), l'outil est rejeté silencieusement.
2.  **Allow** : Si une règle d'autorisation "matche" (ex: autoriser `npm test`), l'outil est exécuté.
3.  **Ask (Défaut)** : Si aucune règle ne correspond, l'exécution est suspendue et une notification dans l'UI demande à l'utilisateur d'approuver ou de refuser manuellement l'action.
