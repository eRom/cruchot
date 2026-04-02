# Outils, Skills et Model Context Protocol (MCP)

Cruchot ne se contente pas de discuter avec des LLMs, il leur donne des bras et des mains. Pour cela, l'application implémente trois niveaux d'outils : les Tools natifs, les Skills locaux (fichiers), et les serveurs MCP.

## 1. Outils Natifs (Built-in Tools)

Les outils natifs sont codés en dur dans l'application (TypeScript). Ils fournissent les capacités de base au LLM pour interagir avec le système de l'utilisateur.

### 1.1 Opérations Système
- Exécution de commandes Bash confinées.
- Opérations sur les fichiers : lecture (`readFile`), écriture (`writeFile`), listage (`listFiles`).
Ces opérations sont sécurisées et toujours confinées au dossier de travail (`workspacePath`) de la conversation en cours.

### 1.2 Le Moteur de Permissions (`permission-engine.ts`)
Chaque appel d'outil natif passe par un moteur de règles. L'utilisateur peut définir des règles (`allow`, `deny`, `ask`) par outil. S'il n'y a pas de règle `allow` explicite, une boîte de dialogue de confirmation apparaît dans l'interface pour autoriser l'exécution de l'outil.

## 2. Les Skills (Compétences Locales)

Les Skills sont des "mini-applications" ou des scripts encapsulés que le LLM peut invoquer. Ils sont gérés par le `skill.service.ts`.

### 2.1 Format `SKILL.md`
Un Skill est un dossier contenant au minimum un fichier `SKILL.md`. Ce fichier possède :
- Un **Frontmatter YAML** : Définit le nom, la description, le shell à utiliser, les variables requises.
- Un **Corps Markdown** : Le script Bash/Python/Node exécutable, ou les instructions système que le LLM doit suivre pour cette compétence.

### 2.2 Découverte et Installation
Le service `skill.service.ts` scrute le dossier `~/.cruchot/skills/` au démarrage pour synchroniser les skills trouvés sur le disque avec la base de données SQLite. Il permet également de cloner dynamiquement de nouveaux skills depuis un dépôt Git.

## 3. Model Context Protocol (MCP)

Cruchot intègre pleinement le **Model Context Protocol (MCP)**, une norme ouverte permettant de brancher des outils externes standardisés à n'importe quel LLM. L'intégration est gérée par le `mcp-manager.service.ts`.

### 3.1 Types de Transports
Cruchot supporte les deux modes de transport majeurs de MCP :
- **STDIO** : Lancement d'un exécutable local (ex: `npx`, `python`, `docker`) dont les entrées/sorties standard sont utilisées pour communiquer.
- **HTTP / SSE** : Connexion à un serveur MCP distant via Server-Sent Events.

### 3.2 Sécurité et Isolation de l'Environnement (STDIO)
Lorsqu'un serveur MCP est lancé en local (stdio), Cruchot applique des règles strictes :
- **Whitelist de commandes** : Seules certaines commandes de base sont autorisées à spawner des serveurs MCP (`node`, `npx`, `python`, `uvx`, `docker`, `deno`, `bun`).
- **Prévention de l'Injection Shell** : Les métacaractères shell (`|`, `;`, `&`, `$`, etc.) sont bloqués au moment de la validation de la commande.
- **Environnement minimal** : Le processus ne reçoit *pas* le `process.env` complet de Cruchot (qui pourrait contenir des clés API). Seules les variables de base (PATH, HOME, USER) et les variables personnalisées (chiffrées en base de données via `envEncrypted`) sont transmises au serveur MCP.

### 3.3 Cycle de Vie des Serveurs MCP
Les serveurs activés sont lancés automatiquement au démarrage. Leurs `Tools` sont récupérés, mis en cache avec un préfixe unique (pour éviter les collisions de noms entre serveurs), et fournis au Vercel AI SDK lors des requêtes au LLM, si ce dernier supporte l'utilisation d'outils.
