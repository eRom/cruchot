# Résolution des Problèmes (Troubleshooting)

Voici les solutions aux problèmes les plus courants que vous pourriez rencontrer avec Cruchot.

## L'IA ne répond pas ou affiche "Erreur API"
- **Vérifiez votre connexion internet.**
- **Vérifiez vos clés API** : Allez dans Paramètres > Providers, et assurez-vous que la clé est correctement collée (sans espace au début ou à la fin).
- **Vérifiez vos crédits** : La plupart des fournisseurs cloud (OpenAI, Anthropic) fonctionnent en mode prépayé. Vérifiez sur leur console respective que votre compte est approvisionné.
- **Changement d'API** : Le Vercel AI SDK gère les changements, mais assurez-vous de toujours utiliser la dernière version de Cruchot.

## Qdrant (Base de données vectorielle / Bibliothèques) ne démarre pas
Cruchot utilise un binaire Qdrant en arrière-plan pour le RAG.
- **Port occupé** : Qdrant utilise les ports 6333 et 6334 par défaut. Assurez-vous qu'aucune autre application n'utilise ces ports.
- **Dossier corrompu** : Si Qdrant crash au démarrage, vous pouvez essayer de supprimer le dossier `~/.cruchot/qdrant_storage/` (Attention: vous devrez recréer et ré-indexer vos bibliothèques).

## Le Bot Telegram ne reçoit pas mes messages
- **Erreur de Token** : Avez-vous collé le bon Token de BotFather ?
- **Restriction d'Utilisateur** : Vérifiez que l'ID utilisateur configuré dans les paramètres correspond exactement à VOTRE ID Telegram. Tous les autres utilisateurs sont ignorés par sécurité.
- **Ordinateur en veille** : Telegram Remote nécessite que Cruchot Desktop soit ouvert et que l'ordinateur ne soit pas en veille prolongée (le processus réseau doit tourner).

## L'IA refuse de modifier un fichier (Permission Denied)
- C'est un comportement de sécurité normal de Cruchot.
- **Vérifiez le dossier de travail** : L'IA ne peut modifier que des fichiers situés dans le dossier sélectionné dans le **Panneau de Droite > Options**. Si elle essaie de toucher un fichier en dehors, le système OS l'en empêchera.
- **Mode Ask** : Si une boîte de dialogue s'affiche, vous devez explicitement cliquer sur "Approuver" pour que l'outil s'exécute.

## Un serveur MCP (stdio) s'affiche en erreur
- Les serveurs MCP lancés via la ligne de commande (comme `npx`) dépendent de votre environnement.
- **Chemin des exécutables** : Assurez-vous que Node.js ou Python soient installés sur votre machine. Cruchot tente d'inclure `/usr/local/bin` et `/opt/homebrew/bin` par défaut.
- **Première exécution `npx`** : La première fois que vous exécutez un package via `npx`, il vous demande souvent `Proceed to install? (y)`. Cruchot exécute le processus en arrière-plan et ne peut pas répondre "y". Il est conseillé de lancer la commande une première fois dans votre terminal normal pour installer le paquet en cache.
