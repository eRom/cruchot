# Guide de Démarrage Rapide

Bienvenue dans Cruchot ! Ce guide vous explique comment installer et configurer l'application pour votre première utilisation.

## 1. Installation

Cruchot est disponible pour macOS, Windows et Linux.

1. Rendez-vous sur la page des [Releases GitHub](#).
2. Téléchargez l'installateur correspondant à votre système :
   - **macOS** : Téléchargez le fichier `.dmg`. L'application est un "Universal Binary" (fonctionne sur les Mac Intel et Apple Silicon).
   - **Windows** : Téléchargez le fichier `.exe`.
   - **Linux** : Téléchargez le fichier `.AppImage` ou `.deb`.
3. Installez et lancez l'application.

## 2. Configuration des Clés d'API

Cruchot est un client "Bring Your Own Key" (Apportez votre propre clé). Pour discuter avec un modèle d'Intelligence Artificielle, vous devez configurer au moins un fournisseur.

1. Ouvrez l'application Cruchot.
2. Cliquez sur l'icône des **Paramètres** (généralement en bas à gauche) pour ouvrir le panneau de configuration.
3. Allez dans l'onglet **Fournisseurs (Providers)**.
4. Entrez la clé secrète de l'API de votre choix :
   - **OpenAI** (pour GPT-4o, GPT-3.5)
   - **Anthropic** (pour Claude 3.5 Sonnet, Opus)
   - **Google** (pour Gemini 1.5 Pro, Flash)
   - *Ou n'importe quel autre fournisseur supporté.*
5. Vos clés sont chiffrées et stockées de manière sécurisée uniquement sur votre machine (dans le trousseau d'accès de votre système d'exploitation).

## 3. Lancer une Conversation

1. Sur l'écran principal, cliquez sur **Nouveau Chat**.
2. Le **Panneau de Droite (Right Panel)** s'ouvre automatiquement.
3. Dans la section **Paramètres**, sélectionnez le modèle que vous souhaitez utiliser (ex: `gpt-4o` ou `claude-3-5-sonnet-20241022`).
4. Posez votre question dans la zone de saisie en bas de l'écran.

## 4. Outils de Base (Tools)

Par défaut, Cruchot permet à l'IA d'interagir avec votre machine de manière sécurisée (si vous le permettez).
- L'IA peut lire des fichiers, écrire du code, et même exécuter des scripts dans un environnement isolé (le "Sandbox").
- Lors de votre première conversation, le dossier de travail par défaut est `~/.cruchot/sandbox/`.
- Chaque fois que l'IA tente d'exécuter une commande potentiellement risquée, Cruchot mettra la conversation en pause et vous demandera votre autorisation.
