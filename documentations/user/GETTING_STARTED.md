# Guide de Démarrage Rapide

Bienvenue dans Cruchot ! Ce guide vous explique comment installer et configurer l'application pour votre première utilisation.

## 1. Installation

Cruchot est disponible pour macOS, Windows et Linux.

1. Rendez-vous sur la page des [Releases GitHub](#).
2. Téléchargez l'installateur correspondant à votre système :
   - **macOS** : Téléchargez le fichier `.dmg` correspondant à votre architecture (`arm64` pour Apple Silicon M1/M2/M3/M4, `x64` pour Intel).
   - **Windows** : Téléchargez le fichier `.exe`.
   - **Linux** : Téléchargez le fichier `.AppImage` ou `.deb`.
3. Installez et lancez l'application.

## 2. Configuration des Clés d'API

Cruchot est un client "Bring Your Own Key" (Apportez votre propre clé). Pour discuter avec un modèle d'Intelligence Artificielle, vous devez configurer au moins un fournisseur.

1. Ouvrez l'application Cruchot.
2. Cliquez sur votre **avatar** en bas de la barre latérale (ou utilisez `Cmd+,`) pour ouvrir les **Parametres**.
3. Allez dans l'onglet **Providers**.
4. Entrez la clé secrète de l'API de votre choix :
   - **OpenAI** (GPT-4.1, o4-mini, etc.)
   - **Anthropic** (Claude Sonnet 4, Opus 4, etc.)
   - **Google** (Gemini 2.5 Pro, Flash, etc.)
   - **xAI** (Grok), **Mistral**, **DeepSeek**, **Perplexity**, **OpenRouter**
   - *Ou des modèles locaux via **Ollama** / **LM Studio**.*
5. Vos clés sont chiffrées via le trousseau du système (`safeStorage`) et stockées uniquement sur votre machine.

## 3. Lancer une Conversation

1. Sur l'écran principal, cliquez sur **Nouveau Chat**.
2. Le **Panneau de Droite (Right Panel)** s'ouvre automatiquement.
3. Dans la section **Parametres**, sélectionnez le modèle que vous souhaitez utiliser (ex: `gpt-4.1` ou `claude-sonnet-4-20250514`).
4. Posez votre question dans la zone de saisie en bas de l'écran.

## 4. Forker une Conversation

Vous pouvez "forker" (dupliquer) une conversation depuis n'importe quel message assistant pour explorer une direction différente :

1. Survolez un message de l'IA dans la conversation.
2. Cliquez sur l'icône **Fork** (branchement) dans le pied du message, à côté des boutons de copie et de lecture audio.
3. Une nouvelle conversation indépendante est créée avec tous les messages jusqu'à ce point.
4. Vous êtes automatiquement redirigé vers la nouvelle conversation.

Les deux conversations restent totalement indépendantes — vous pouvez continuer l'une ou l'autre sans effet sur l'autre.

## 5. Outils de Base (Tools)

Par défaut, Cruchot permet à l'IA d'interagir avec votre machine de manière sécurisée (si vous le permettez).
- L'IA peut lire des fichiers, écrire du code, et même exécuter des scripts dans un environnement isolé (le "Sandbox").
- Lors de votre première conversation, le dossier de travail par défaut est `~/.cruchot/sandbox/`.
- Chaque fois que l'IA tente d'exécuter une commande potentiellement risquée, Cruchot mettra la conversation en pause et vous demandera votre autorisation.
