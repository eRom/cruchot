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
2. Ouvrez le **Panneau de Droite**, section **Remote**.
3. Cliquez sur **Générer un code de Pairing**. Cruchot affiche un code à 6 chiffres (valable 5 minutes).
4. Ouvrez Telegram sur votre téléphone et allez sur la conversation avec votre bot.
5. Envoyez le message : `/pair XXXXXX` (remplacez par le code).

C'est fait ! Ce que vous tapez sur Telegram est envoyé à Cruchot sur votre Mac/PC, qui l'envoie au modèle d'IA, et la réponse vous revient en temps réel sur Telegram.

## 3. Accès Distant Web (PWA)

Cruchot dispose également d'une interface Web permettant d'accéder au chat complet depuis un navigateur (sans Telegram).

1. L'application Web (`remote-web`) doit être déployée sur Vercel (voir documentation de déploiement).
2. Dans les paramètres de Cruchot Desktop, activez le **Serveur WebSocket Distant**.
3. Rendez-vous sur l'URL de votre PWA Vercel, entrez l'adresse IP locale de votre Mac/PC (ou utilisez un tunnel comme Ngrok si vous n'êtes pas sur le même réseau WiFi).
4. Entrez le code PIN de session pour vous connecter de manière sécurisée.
