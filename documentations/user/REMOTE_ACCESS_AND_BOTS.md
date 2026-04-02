# Accès Distant et Bot Telegram

L'une des fonctionnalités les plus puissantes de Cruchot est la possibilité de continuer vos conversations depuis votre téléphone, tout en utilisant votre ordinateur comme "cerveau" (gardant ainsi vos données et clés API chez vous).

## 1. Configurer le Bot Telegram

Vous pouvez contrôler Cruchot via la messagerie Telegram.

### Créer le Bot
1. Sur Telegram, cherchez le compte officiel **@BotFather**.
2. Envoyez-lui la commande `/newbot` et suivez les instructions.
3. BotFather vous donnera un **Token d'API** (ex: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`).

### Configurer Cruchot
1. Dans Cruchot (sur votre ordinateur), allez dans **Paramètres** > **Remote / Telegram**.
2. Collez le **Token** dans le champ dédié.
3. Cruchot vous demandera également votre **User ID Telegram** (un numéro). Cela garantit que vous seul pouvez communiquer avec votre bot. Si vous ne le connaissez pas, vous pouvez utiliser un bot comme `@userinfobot` sur Telegram pour l'obtenir.

## 2. Démarrer une session (Pairing)

Une fois configuré, vous devez "appairer" une conversation.

1. Ouvrez une conversation sur votre ordinateur.
2. Ouvrez le **Panneau de Droite** (`Opt+Cmd+B`), section **Remote**.
3. Activez le **switch Telegram**. Cruchot génère automatiquement un code de pairing (valable 5 minutes) et l'affiche dans un toast.
4. Ouvrez Telegram sur votre téléphone et allez sur la conversation avec votre bot.
5. Envoyez le message : `/pair XXXXXX` (remplacez par le code affiché).

C'est fait ! Ce que vous tapez sur Telegram est envoyé à Cruchot sur votre Mac/PC, qui l'envoie au modèle d'IA, et la réponse vous revient en temps réel sur Telegram.

## 3. Accès Distant Web

Cruchot intègre un serveur WebSocket local avec support optionnel de **Cloudflare Tunnel** pour un accès depuis n'importe où.

1. Dans les **Parametres** > onglet **Remote**, activez le **Serveur WebSocket**.
2. Si `cloudflared` est installé sur votre machine, Cruchot lance automatiquement un tunnel et affiche l'URL publique (ex: `https://xxx.trycloudflare.com`).
3. Sans tunnel, seul `localhost` est accessible (utile sur le même réseau WiFi).
4. Ouvrez l'URL dans un navigateur et entrez le code PIN de session affiché dans Cruchot pour vous connecter.
