# Utilisation des Skills et de MCP

Pour décupler les capacités de l'IA, Cruchot supporte deux systèmes d'outils : les Skills (compétences locales) et le Model Context Protocol (MCP).

## 1. Les Skills (Compétences)

Un "Skill" est un petit script ou un ensemble d'instructions que vous installez dans Cruchot.

### Installer un Skill
1. Allez dans l'onglet **Skills**.
2. Vous pouvez installer un Skill de deux manières :
   - En indiquant l'URL d'un dépôt GitHub public.
   - En créant un dossier manuellement dans `~/.cruchot/skills/` contenant un fichier `SKILL.md`.
3. Une fois installé, le Skill apparaît dans la liste.

### Utiliser un Skill
Si un Skill est activé, l'IA en a connaissance. Si vous lui demandez de faire une action liée à ce Skill, elle l'invoquera automatiquement.
*Exemple : Si vous avez un Skill "Générateur d'images", demandez simplement "Génère une image d'un chat" dans la conversation.*

## 2. Model Context Protocol (MCP)

Le MCP (Model Context Protocol) est un standard de l'industrie qui permet à l'IA de se connecter à des bases de données externes, des outils d'entreprise (Slack, Jira, Github), ou des APIs.

### Ajouter un Serveur MCP
1. Ouvrez les **Paramètres**, allez dans l'onglet **MCP Servers**.
2. Cliquez sur **Ajouter un serveur**.
3. Remplissez le formulaire :
   - **Nom** : Identifiant du serveur.
   - **Type** : `stdio` (pour un script local) ou `SSE/HTTP` (pour un serveur distant).
   - **Commande** (pour `stdio`) : Exemple `npx` et les arguments `-y @modelcontextprotocol/server-postgres`.
4. Ajoutez les variables d'environnement nécessaires (comme les mots de passe de base de données). Elles sont chiffrées localement.

### Activer un MCP dans une conversation
1. Dans votre conversation, ouvrez le **Panneau de Droite**.
2. Allez dans la section **Outils MCP**.
3. Cochez les serveurs que vous souhaitez rendre disponibles pour cette conversation spécifique.
4. L'IA pourra désormais requêter ces serveurs de manière autonome pour vous répondre.
