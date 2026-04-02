# Services en Arrière-plan (Background Services)

Cruchot ne se limite pas à une interface réactive. L'application exécute plusieurs services en tâche de fond dans le processus Main d'Electron pour offrir des fonctionnalités d'automatisation, d'accès à distance et de synthèse vocale.

## 1. Serveur Remote Telegram (`telegram-bot.service.ts`)

Ce service permet à l'utilisateur de continuer ses conversations Cruchot depuis son smartphone via l'application Telegram, en utilisant sa propre machine locale comme "serveur".

### 1.1 Polling et Connexion
Le service utilise la méthode de *Long Polling* pour récupérer les messages depuis l'API Telegram. Cela évite d'avoir à configurer un Webhook ou d'ouvrir un port sur le routeur de l'utilisateur (pas de redirection de port nécessaire).

### 1.2 Sécurité et Authentification (Pairing)
- **Code de Pairing** : La connexion initiale nécessite de générer un code temporaire (5 min) sur l'application Desktop et de l'envoyer au bot Telegram (`/pair CODE`).
- **Restriction d'Utilisateur** : Seul l'ID utilisateur Telegram autorisé (`allowedUserId`) peut interagir avec le bot. Les messages provenant d'autres utilisateurs sont ignorés silencieusement.

### 1.3 Streaming et UI Telegram
Pour simuler le streaming typique des LLMs, le service met à jour le message Telegram en temps réel :
- **Debouncing** : Les mises à jour de l'API Telegram sont regroupées (debounce de 500ms) pour éviter le *Rate Limiting* (erreur 429).
- **Validation d'Outils (Inline Keyboard)** : Si le LLM utilise un outil nécessitant une permission (`Ask`), le bot envoie un message avec des boutons interactifs "Approuver" ou "Refuser" directement dans Telegram.

## 2. Planificateur de Tâches (`scheduler.service.ts`)

Cruchot peut exécuter des requêtes LLM de manière autonome et récurrente.

### 2.1 Moteur de Planification
Le planificateur (`SchedulerService`) n'utilise pas Cron, mais les timers natifs de Node.js (`setTimeout`, `setInterval`). Il gère trois types de récurrences :
- **Intervalle** : Toutes les X minutes/heures.
- **Quotidien** : À une heure précise chaque jour (ex: 08:00).
- **Hebdomadaire** : À une heure précise certains jours de la semaine (ex: Lundi, Mercredi).

### 2.2 Exécution (`task-executor.ts`)
Lorsqu'un timer se déclenche, le `TaskExecutor` crée une conversation invisible (ou reprend la précédente), injecte le prompt de la tâche et déclenche le routeur LLM. Si des outils (MCP ou Bash) sont configurés en auto-approve, la tâche peut interagir avec le système de fichiers ou des APIs pendant la nuit, et l'utilisateur retrouvera le résultat au matin dans l'interface.

## 3. Synthèse Vocale (Text-to-Speech) (`tts.service.ts`)

Cruchot intègre des capacités de lecture vocale des messages via les APIs cloud d'OpenAI et de Google (Gemini).

### 3.1 Abstraction des APIs
Le service unifie les appels aux APIs TTS. Les coûts sont calculés en temps réel en fonction du nombre de caractères générés (Google TTS étant actuellement en "Preview gratuit", tandis qu'OpenAI facture au million de caractères).

### 3.2 Conversion Audio (PCM vers WAV)
Une spécificité technique est gérée pour l'API Google Gemini : elle retourne un flux audio brut en PCM 16-bit (`audio/L16`). Les navigateurs Web ne sachant pas lire ce format directement avec la balise `<audio>`, le service `tts.service.ts` encapsule ces données brutes dans une en-tête WAV (RIFF chunk) à la volée avant de l'envoyer au frontend React.
