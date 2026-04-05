# Outils, Skills et Model Context Protocol (MCP)

Cruchot ne se contente pas de discuter avec des LLMs, il leur donne des bras et des mains. Pour cela, l'application implémente trois niveaux d'outils : les Tools natifs, les Skills locaux (fichiers), et les serveurs MCP.

## 1. Outils Natifs (Built-in Tools)

Les outils natifs sont codés en dur dans l'application (TypeScript). Ils fournissent les capacités de base au LLM pour interagir avec le système de l'utilisateur.

### 1.1 Les 8 Tools AI SDK
Cruchot fournit **8 outils** au LLM via le Vercel AI SDK :
- **`bash`** : Exécution de commandes shell confinées via Seatbelt (macOS).
- **`readFile`** : Lecture de fichiers avec protection TOCTOU (vérification mtime).
- **`writeFile`** : Écriture de fichiers dans le workspace.
- **`FileEdit`** : Modification partielle de fichiers (remplacement de chaînes, vérification TOCTOU).
- **`listFiles`** : Exploration récursive de l'arborescence du workspace.
- **`GrepTool`** : Recherche par regex dans les fichiers du workspace.
- **`GlobTool`** : Recherche de fichiers par pattern (minimatch).
- **`WebFetchTool`** : Requêtes HTTPS vers des URLs externes (HTML converti en Markdown via turndown, limite 2 MB).

Les 7 premiers outils sont confinés au dossier de travail (`workspacePath`). `WebFetchTool` est restreint au protocole HTTPS avec blocage des IPs privées.

### 1.2 Pipeline de Sécurité (5 étages)
Chaque appel d'outil passe par un pipeline de sécurité à 5 étages :
1.  **Security Checks** (bash uniquement) : 21 vérifications statiques de la commande (hard block, non contournable).
2.  **Deny Rules** : Si une règle d'interdiction utilisateur matche, l'outil est rejeté.
3.  **READONLY_COMMANDS** : ~70 commandes passives (`ls`, `grep`, `cat`, `head`, etc.) auto-approuvées sans règle DB.
4.  **Allow Rules** : Si une règle d'autorisation utilisateur matche, l'outil est exécuté.
5.  **Ask (défaut)** : L'exécution est suspendue et une bannière de confirmation apparaît dans l'UI (timeout 60s).

Le **Mode YOLO** (activable par conversation dans le panneau de droite) bypasse uniquement l'étape 5 (Ask) — les security checks et deny rules restent actifs. Le flag YOLO est géré côté main process (`Map<conversationId, boolean>`), pas dans le payload IPC.

### 1.3 Plan Mode — Porte Read-Only

Le **Plan Mode** ajoute une porte supplémentaire **en amont** du pipeline de sécurité. Lorsque le mode est actif et que la phase de planification est en cours, tous les outils d'écriture (`writeFile`, `FileEdit`, `bash` avec commandes mutantes) sont bloqués avec l'erreur `PLAN_MODE_READ_ONLY`. Seuls les outils de lecture (`readFile`, `listFiles`, `GrepTool`, `GlobTool`) et `WebFetchTool` restent accessibles.

Cette porte est levée automatiquement dès que le LLM bascule en phase d'exécution (signalé par les marqueurs `<plan_start>` / `<plan_end>` dans le stream). La logique est dans `src/main/llm/tools/index.ts`.

## 2. Les Skills (Compétences Locales)

Les Skills sont des "mini-applications" ou des scripts encapsulés que le LLM peut invoquer. Ils sont gérés par le `skill.service.ts`.

### 2.1 Format `SKILL.md`
Un Skill est un dossier contenant au minimum un fichier `SKILL.md`. Ce fichier possède :
- Un **Frontmatter YAML** : Définit le nom, la description, le shell à utiliser, les variables requises.
- Un **Corps Markdown** : Le script Bash/Python/Node exécutable, ou les instructions système que le LLM doit suivre pour cette compétence.

### 2.2 Découverte et Installation
Le service `skill.service.ts` scrute le dossier `~/.cruchot/skills/` au démarrage pour synchroniser les skills trouvés sur le disque avec la base de données SQLite. Il permet également de cloner dynamiquement de nouveaux skills depuis un dépôt Git.

> **Sécurité — Clonage de skills** : Seules les URLs HTTPS GitHub sont autorisées (`https://github.com/owner/repo`). Les URLs SSH, les protocoles locaux (`ext::`, `file://`) et les autres hébergeurs sont rejetés par validation regex avant tout appel `git clone`, prévenant les exploits d'injection via URL.

## 3. Model Context Protocol (MCP)

Cruchot intègre pleinement le **Model Context Protocol (MCP)**, une norme ouverte permettant de brancher des outils externes standardisés à n'importe quel LLM. L'intégration est gérée par le `mcp-manager.service.ts`.

### 3.1 Types de Transports
Cruchot supporte les deux modes de transport majeurs de MCP :
- **STDIO** : Lancement d'un exécutable local (ex: `npx`, `python`, `docker`) dont les entrées/sorties standard sont utilisées pour communiquer.
- **HTTP / SSE** : Connexion à un serveur MCP distant via Server-Sent Events.

### 3.2 Sécurité et Isolation de l'Environnement (STDIO)
Lorsqu'un serveur MCP est lancé en local (stdio), Cruchot applique les mesures suivantes :
- **Environnement minimal** : Le processus ne reçoit *pas* le `process.env` complet de Cruchot (qui pourrait contenir des clés API). Seules les variables de base (PATH, HOME, USER) et les variables personnalisées (chiffrées en base de données via `envEncrypted`) sont transmises au serveur MCP.

> **Note** : La commande de spawn MCP n'est actuellement pas validée avant exécution (pas de whitelist ni de filtrage des métacaractères shell). Les outils MCP ne passent pas non plus par le moteur de permissions. Ces deux points sont identifiés comme pistes d'amélioration sécurité.

### 3.3 Cycle de Vie des Serveurs MCP
Les serveurs activés sont lancés automatiquement au démarrage. Leurs `Tools` sont récupérés, mis en cache avec un préfixe unique (pour éviter les collisions de noms entre serveurs), et fournis au Vercel AI SDK lors des requêtes au LLM, si ce dernier supporte l'utilisation d'outils.
