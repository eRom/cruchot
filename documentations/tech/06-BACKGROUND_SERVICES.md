# Services en Arrière-plan (Background Services)

Cruchot ne se limite pas à une interface réactive. L'application exécute plusieurs services en tâche de fond dans le processus Main d'Electron pour offrir des fonctionnalités d'automatisation, d'accès à distance et de synthèse vocale.

## 0. ServiceRegistry et Cycle de Vie (`service-registry.ts`)

Tous les services en arrière-plan sont enregistrés dans un `ServiceRegistry` centralisé. Ce registre fournit :
- **Lazy-loading** : les services lourds (Qdrant, MCP, Telegram, Remote) ne sont initialisés qu'au premier accès effectif, pas au démarrage de l'app.
- **Shutdown coordonné** : à la fermeture (`before-quit`), `serviceRegistry.stopAll()` arrête tous les services via `Promise.allSettled()`, garantissant un arrêt propre même si un service échoue.

## 0.1 Worker Thread Embedding (`embedding.worker.js`)

L'inférence ONNX pour les embeddings (modèle `all-MiniLM-L6-v2`, 384 dimensions) est déléguée à un Worker thread Node.js séparé. Cela évite de bloquer le main process pendant les calculs vectoriels. Le worker est construit comme un entry point séparé dans `electron.vite.config.ts` et communique via `postMessage`/`on('message')`. Timeout de 30 secondes par requête. Le worker est arrêté proprement dans le handler `before-quit` via le ServiceRegistry.

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

## 4. VCR Recording (`vcr-recorder.service.ts`, `vcr-anonymizer.service.ts`, `vcr-html-exporter.service.ts`)

Le système VCR (Video Cassette Recorder) permet d'enregistrer une session de chat complète — messages, streaming LLM, appels d'outils, décisions de permissions, étapes de Plan Mode — et de l'exporter en deux formats partageables.

### 4.1 Architecture du pipeline

Le pipeline VCR se compose de 4 couches :

1. **EventBus (`vcr-event-bus.ts`)** : `TypedEventEmitter` centralisé. Les points d'émission sont instrumentés dans `chat.ipc.ts` (`onChunk`, `onFinish`, appels d'outils, décisions de permissions, étapes de plan).
2. **Recorder (`vcr-recorder.service.ts`)** : singleton `vcrRecorderService`. À l'`startRecording()`, il souscrit à 14 types d'événements et écrit chaque événement en NDJSON dans un fichier `.vcr` temporaire (`~/.cruchot/recordings/<id>.vcr`) via un `WriteStream`. Format de chaque ligne : `[offsetMs, type, data]`.
3. **Anonymizer (`vcr-anonymizer.service.ts`)** : appliqué au stop. Masque les chemins home utilisateur, adresses IP, emails, numéros de téléphone, tokens Bearer, API keys (>32 chars) et URL secrets. Les images attachées sont supprimées.
4. **Exporter (`vcr-html-exporter.service.ts` + `vcr-html-template.ts`)** : génère un fichier HTML standalone (~640 lignes de template) avec player intégré, timeline, liste d'événements et affichage des diffs de fichiers. Le template est stocké dans `~/.cruchot/vcr-template.html` (copié au premier appel).

### 4.2 Flux stop → export

```
vcr:stop IPC
  → vcrRecorderService.stopRecording()   # flush WriteStream
  → vcrRecorderService.parseRecordingFile()  # relire le .vcr
  → vcrAnonymizerService.anonymizeEvents()   # masquage PII
  → dialog.showSaveDialog()              # choix du dossier/nom
  → writeFile(.ndjson)                   # export NDJSON anonymisé
  → vcrHtmlExporterService.generateHtml()  # inject data dans template
  → writeFile(.html)                     # export HTML standalone
  → trash(.vcr)                          # supprime le fichier temp
```

### 4.3 Format NDJSON (.vcr / .ndjson)

- **Ligne 0** : header JSON (`VcrRecordingHeader`) — `recordingId`, `conversationId`, `modelId`, `providerId`, `workspacePath`, `fullCapture`, `startedAt`, `metadata.appVersion`.
- **Lignes 1+** : `[offsetMs: number, type: VcrEventType, data: object]`.

Types d'événements capturés : `session-start`, `session-stop`, `user-message`, `text-delta`, `reasoning-delta`, `tool-call`, `tool-result`, `permission-decision`, `permission-response`, `plan-proposed`, `plan-approved`, `plan-step`, `file-diff`, `finish`.

### 4.4 IPC (`vcr.ipc.ts`)

| Handler | Rôle |
|---------|------|
| `vcr:start` | Démarre l'enregistrement (validation Zod) |
| `vcr:stop` | Stoppe, anonymise, ouvre dialog save, exporte |
| `vcr:status` | Retourne l'état courant (`RecordingState`) |

L'état est pushé au renderer via `vcr:recording-state` event après start/stop.

## 3. Synthèse Vocale (Text-to-Speech) (`tts.service.ts`)

Cruchot intègre des capacités de lecture vocale des messages via les APIs cloud d'OpenAI et de Google (Gemini).

### 3.1 Abstraction des APIs
Le service unifie les appels aux APIs TTS. Les coûts sont calculés en temps réel en fonction du nombre de caractères générés (Google TTS étant actuellement en "Preview gratuit", tandis qu'OpenAI facture au million de caractères).

### 3.2 Conversion Audio (PCM vers WAV)
Une spécificité technique est gérée pour l'API Google Gemini : elle retourne un flux audio brut en PCM 16-bit (`audio/L16`). Les navigateurs Web ne sachant pas lire ce format directement avec la balise `<audio>`, le service `tts.service.ts` encapsule ces données brutes dans une en-tête WAV (RIFF chunk) à la volée avant de l'envoyer au frontend React.
