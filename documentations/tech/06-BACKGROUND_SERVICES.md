# Services en Arrière-plan (Background Services)

Cruchot ne se limite pas à une interface réactive. L'application exécute plusieurs services en tâche de fond dans le processus Main d'Electron pour offrir des fonctionnalités d'automatisation, d'accès à distance et de synthèse vocale.

## 0. ServiceRegistry et Cycle de Vie (`service-registry.ts`)

Tous les services en arrière-plan sont enregistrés dans un `ServiceRegistry` centralisé. Ce registre fournit :
- **Lazy-loading** : les services lourds (Qdrant, MCP, Telegram, Remote) ne sont initialisés qu'au premier accès effectif, pas au démarrage de l'app.
- **Shutdown coordonné** : à la fermeture (`before-quit`), `serviceRegistry.stopAll()` arrête tous les services via `Promise.allSettled()`, garantissant un arrêt propre même si un service échoue.

## 0.1 Worker Thread Embedding (`embedding.worker.js`)

L'inférence ONNX pour les embeddings (modèle `all-MiniLM-L6-v2`, 384 dimensions) est déléguée à un Worker thread Node.js séparé. Cela évite de bloquer le main process pendant les calculs vectoriels. Le worker est construit comme un entry point séparé dans `electron.vite.config.ts` et communique via `postMessage`/`on('message')`. Timeout de 30 secondes par requête. Le worker est arrêté proprement dans le handler `before-quit` via le ServiceRegistry.

## 1. Mémoire Épisodique (`episode-trigger.service.ts`, `episode-extractor.service.ts`)

Ces deux services singletons forment le pipeline d'apprentissage comportemental automatique de Cruchot.

### 1.1 Service de déclenchement (`EpisodeTriggerService`)

Centralise la logique de "quand extraire" — 3 déclencheurs :

- **Switch de conversation** : quand l'utilisateur change de conversation active, `onConversationLeft(convId)` déclenche une extraction sur la conversation quittée.
- **Idle timeout 5 min** : timer reset à chaque message via `onMessageSent(convId)`. Si 5 min s'écoulent sans message, extraction sur la conversation active.
- **Fermeture app** : le hook `before-quit` appelle `onAppQuitting()` — extraction synchrone sur toutes les conversations avec delta non traité.

Guards intégrés : delta < 4 messages → skip ; extraction déjà en cours (`extractingSet: Set<string>`) → skip ; mémoire épisodique désactivée dans settings → skip.

### 1.2 Service d'extraction (`EpisodeExtractorService`)

Prend un delta de messages + les épisodes existants, et appelle un LLM pour distiller les faits comportementaux.

**Flux d'extraction :**

1. Charger les épisodes actifs depuis SQLite.
2. Charger le delta de messages (depuis `lastEpisodeMessageId` jusqu'au dernier message).
3. `generateText()` avec le modèle configuré (`settings.episodeModelId`, format `providerId::modelId`).
4. Parser le JSON retourné — chaque action est soit `create`, `reinforce`, ou `update`.
5. Appliquer les actions en DB (INSERT ou UPDATE sur la table `episodes`).
6. Mettre à jour `conversations.lastEpisodeMessageId`.

Le LLM reçoit les épisodes existants en contexte pour assurer la déduplication : il doit `create` uniquement si le fait est nouveau, `reinforce` si rré-observé, `update` si le fait a évolué.

Le modèle d'extraction est **configurable par l'utilisateur** depuis l'onglet Profil de la MemoryView (sélecteur provider::modelId). Un petit modèle léger est recommandé (l'extraction est silencieuse en arrière-plan).

## 2. Consolidation Onirique (`oneiric.service.ts`, `oneiric-trigger.service.ts`)

La consolidation onirique est un pipeline de maintenance automatique de la mémoire en **3 phases séquentielles**. Elle s'exécute silencieusement en arrière-plan pour nettoyer et enrichir les deux couches de mémoire (Qdrant + épisodes).

### 2.1 Déclenchement (`OneiricTriggerService`)

Deux modes de déclenchement :

- **Planifié** : configurable en mode `daily` (heure précise) ou `interval` (toutes les N heures). Le timer est un simple `setTimeout` Node.js qui se reprogramme après chaque run.
- **Fermeture app** : `onAppQuitting()` lance une consolidation `quit` si le dernier run date de plus d'1 heure. Timeout de 30 secondes pour ne pas bloquer la fermeture.

Guards intégrés : si `isRunning = true`, le run est ignoré. Si aucun modèle n'est configuré (`multi-llm:oneiric-model-id`), un run `failed` est créé en DB pour traçabilité.

### 2.2 Pipeline 3 phases (`OneiricService`)

#### Phase 1 — Sémantique

- Charge les conversations Qdrant **non encore consolidées** (`lastOneiricRunAt IS NULL OR updatedAt > lastOneiricRunAt`), max 30 par run.
- Pour chaque conversation avec ≥ 3 chunks : envoie les chunks (max 100) au LLM avec `SEMANTIC_CONSOLIDATION_PROMPT`.
- Le LLM retourne des actions JSON : `merge` (fusionner N chunks en 1 avec re-embedding), `delete` (supprimer un chunk obsolète), `keep` (no-op).
- Les chunks merged sont re-embeddés localement et upserté dans Qdrant avec les métadonnées préservées.

#### Phase 2 — Épisodique

- Attend la fin des extractions épisodiques en cours (`episodeTriggerService.isExtracting()`, timeout 30s).
- Charge tous les épisodes actifs et leur présente au LLM avec `EPISODIC_CONSOLIDATION_PROMPT` (avec âge, confiance, occurrences).
- Actions LLM : `stale` (diminuer la confiance d'un épisode obsolète), `merge` (fusionner des doublons), `delete` (supprimer un épisode caduc).

#### Phase 3 — Croisée

- Croise les épisodes actifs avec les **chunks récents des 7 derniers jours** (max 50) via `CROSS_CONSOLIDATION_PROMPT`.
- Actions LLM : `create` (créer un nouvel épisode synthétisé, seuil de confiance minimum 0.5, max 10 nouveaux épisodes par run), `reinforce` (augmenter la confiance d'un épisode), `update` (réécrire un épisode).

### 2.3 Traçabilité (`oneiric_runs`)

Chaque run est enregistré dans la table `oneiric_runs` avec statut (`running` | `completed` | `failed` | `cancelled`), déclencheur, modèle utilisé, statistiques détaillées (chunks/épisodes analysés, mergés, supprimés, créés) et coût LLM. Un `cleanupOrphanRuns()` marque les runs `running` restants comme `failed` au redémarrage (crash recovery).

### 2.4 IPC (`oneiric.ipc.ts`)

| Channel | Description |
|---------|-------------|
| `oneiric:consolidate-now` | Lance une consolidation manuelle |
| `oneiric:cancel` | Annule via `AbortController` |
| `oneiric:status` | Retourne `isRunning` + dernier run complété |
| `oneiric:list-runs` | Liste tous les runs (historique) |
| `oneiric:get-run` | Détail d'un run spécifique |
| `oneiric:set-model` | Configure le modèle + refresh schedule |
| `oneiric:set-schedule` | Configure le schedule + refresh schedule |

La progression est pushée au renderer via `oneiric:progress` events (phase 1/2/3 en cours).

## 3. Serveur Remote Telegram (`telegram-bot.service.ts`)

Ce service permet à l'utilisateur de continuer ses conversations Cruchot depuis son smartphone via l'application Telegram, en utilisant sa propre machine locale comme "serveur".

### 2.1 Polling et Connexion
Le service utilise la méthode de *Long Polling* pour récupérer les messages depuis l'API Telegram. Cela évite d'avoir à configurer un Webhook ou d'ouvrir un port sur le routeur de l'utilisateur (pas de redirection de port nécessaire).

### 2.2 Sécurité et Authentification (Pairing)
- **Code de Pairing** : La connexion initiale nécessite de générer un code temporaire (5 min) sur l'application Desktop et de l'envoyer au bot Telegram (`/pair CODE`).
- **Restriction d'Utilisateur** : Seul l'ID utilisateur Telegram autorisé (`allowedUserId`) peut interagir avec le bot. Les messages provenant d'autres utilisateurs sont ignorés silencieusement.

### 2.3 Streaming et UI Telegram
Pour simuler le streaming typique des LLMs, le service met à jour le message Telegram en temps réel :
- **Debouncing** : Les mises à jour de l'API Telegram sont regroupées (debounce de 500ms) pour éviter le *Rate Limiting* (erreur 429).
- **Validation d'Outils (Inline Keyboard)** : Si le LLM utilise un outil nécessitant une permission (`Ask`), le bot envoie un message avec des boutons interactifs "Approuver" ou "Refuser" directement dans Telegram.

## 4. Planificateur de Tâches (`scheduler.service.ts`)

Cruchot peut exécuter des requêtes LLM de manière autonome et récurrente.

### 2.1 Moteur de Planification
Le planificateur (`SchedulerService`) n'utilise pas Cron, mais les timers natifs de Node.js (`setTimeout`, `setInterval`). Il gère trois types de récurrences :
- **Intervalle** : Toutes les X minutes/heures.
- **Quotidien** : À une heure précise chaque jour (ex: 08:00).
- **Hebdomadaire** : À une heure précise certains jours de la semaine (ex: Lundi, Mercredi).

### 2.2 Exécution (`task-executor.ts`)
Lorsqu'un timer se déclenche, le `TaskExecutor` crée une conversation invisible (ou reprend la précédente), injecte le prompt de la tâche et déclenche le routeur LLM. Si des outils (MCP ou Bash) sont configurés en auto-approve, la tâche peut interagir avec le système de fichiers ou des APIs pendant la nuit, et l'utilisateur retrouvera le résultat au matin dans l'interface.

## 5. VCR Recording (`vcr-recorder.service.ts`, `vcr-anonymizer.service.ts`, `vcr-html-exporter.service.ts`) (`vcr-recorder.service.ts`, `vcr-anonymizer.service.ts`, `vcr-html-exporter.service.ts`)

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

## 6. Gemini Live Voice (`gemini-live.service.ts`, `gemini-live.ipc.ts`, `gemini-live-tools.ts`)

Gemini Live est un service de conversation vocale temps-réel basé sur l'API Gemini Live de Google. Il permet à l'utilisateur de parler directement à l'IA (et de l'entendre répondre) sans passer par le pipeline text LLM habituel.

### 6.1 Architecture

Le service tourne entièrement dans le **main process** (pas un UtilityProcess ni un Worker thread) — une contrainte découverte après debug : le Garbage Collector de Node.js tuait la session WebSocket si le client `@google/genai` était dans un processus séparé. Le singleton `geminiLiveService` est enregistré dans le `ServiceRegistry` sous la clé `gemini-live`.

Le flux audio est entièrement géré côté renderer via deux **AudioWorklet processors** :
- `capture-processor.ts` : capture le micro à 16 kHz, encode en PCM 16-bit, transfère le buffer au hook `useGeminiLiveAudio` qui le forward au main via IPC `gemini-live:send-audio`.
- `playback-processor.ts` : reçoit les chunks audio PCM 24 kHz depuis Gemini, les ré-échantillonne en 48 kHz pour le DAC, et joue la réponse en temps réel.

### 6.2 Connexion et configuration

L'API Gemini Live nécessite **`v1alpha`** (`httpOptions: { apiVersion: 'v1alpha' }`) — la v1beta/v1 ne supporte pas les features avancées (transcription, thinking, proactivité).

Modèle : `gemini-3.1-flash-live-preview`.

Config session :
- `responseModalities: [AUDIO]` — réponse audio uniquement
- `systemInstruction` — prompt assemblé par `gemini-live-system-prompt.ts` (profil utilisateur + contexte dynamique)
- `tools: CRUCHOT_TOOLS` — 10 function declarations (voir §6.4)
- `thinkingConfig: { thinkingLevel: 'low', includeThoughts: false }` — réflexion légère, non streamée
- `speechConfig` — voix Aoede
- `inputAudioTranscription: {}` + `outputAudioTranscription: {}` — transcriptions activées (loggées en console)
- `realtimeInputConfig` — VAD HIGH sensitivity, 500ms prefix padding, 500ms silence duration

### 6.3 Cycle de vie et états

5 statuts possibles (`GeminiLiveStatus`) : `off` → `connecting` → `connected` → `listening` → `speaking` (+ `dormant` + `error`).

**Anti-écho 3x** — bug de répétition audio résolu par 3 guards dans `sendAudio()` :
1. Si `status === 'speaking'` → mute le micro (Gemini parle, ne pas lui renvoyer sa propre voix)
2. Si `isPlaybackActive === true` → mute (buffer worklet en cours de drainage)
3. Si `Date.now() < postTurnCooldownUntil` → mute (cooldown 500ms post-playback pour laisser l'écho se dissiper)

**Idle timer** : après 5 min sans activité, la session est fermée (statut → `dormant`). Le service passe en `dormant` (pas `off`) pour permettre une reconnexion rapide au prochain clic.

### 6.4 Function Calling (11 outils Cruchot)

Le fichier `gemini-live-tools.ts` déclare 11 outils que Gemini peut invoquer en temps réel pour contrôler l'application :

| Outil | Action |
|-------|--------|
| `navigate_to` | Naviguer vers une vue ou une conversation |
| `toggle_ui` | Afficher/masquer sidebar, right-panel (le mode YOLO est exclu par sécurité) |
| `change_model` | Changer le modèle LLM actif |
| `change_thinking` | Changer le niveau de réflexion |
| `send_prompt` | Écrire et envoyer un prompt dans l'InputZone |
| `summarize_conversation` | Générer un résumé de la conversation courante |
| `fork_conversation` | Dupliquer la conversation courante |
| `get_current_state` | Lire la vue courante, modèle actif, conversations |
| `list_conversations` | Lister les conversations récentes |
| `list_models` | Lister tous les modèles disponibles |
| `recall_memory` | Recherche sémantique dans les souvenirs des sessions vocales passées |

Quand Gemini appelle un outil, le main envoie un `gemini-live:command` event au renderer. Le `CruchotCommandHandler` (renderer, `cruchot-command-handler.ts`) dispatch des `CustomEvent` DOM (`cruchot:navigate`, `cruchot:toggle-ui`, etc.) écoutés par les stores Zustand et les composants React. Le résultat est renvoyé au main via `gemini-live:respond-command`, et le main appelle `session.sendToolResponse()`.

### 6.5 NotchBar (UI)

La `NotchBar` est un composant flottant positionné dans le `TopBar` (`-webkit-app-region: drag` désactivé sur la pill). Elle affiche 5 états visuels :
- **Off/Dormant** : petite pill grise discrète (hover → expand + label LIVE)
- **Connecting** : pill grise étendue
- **Connected** : pill slate + label LIVE
- **Listening** : pill bleue + waveform bars animées (niveau mic)
- **Speaking** : pill ambrée + waveform bars animées (niveau speaker)

Cliquer la pill connecte/déconnecte. Les bars waveform sont animées via CSS `height` en pixels synchronisé avec les niveaux audio réels.

### 6.5b Search Grounding

Google Search Grounding est activé sur chaque session Gemini Live via `tools: [{ googleSearch: {} }]` dans la config. Cela permet à Gemini de récupérer des informations web en temps réel pendant la conversation vocale, sans configuration supplémentaire de l'utilisateur.

### 6.6 Mémoire Sémantique Vocale (`live-memory.service.ts`)

Le `LiveMemoryService` (singleton `liveMemoryService`) offre une mémoire persistante entre les sessions vocales, distincte de la mémoire sémantique des conversations texte.

**Pipeline :**
1. **Accumulation** : `addTranscript(role, text)` accumule les transcriptions (user + assistant) pendant la session.
2. **Extraction** : à la déconnexion (ou idle timeout), `extractAndStore()` — fire-and-forget — envoie les transcripts au LLM configuré si ≥ 3 échanges utilisateur. Le LLM extrait les faits clés sous forme de phrases courtes (retourne un JSON array de strings).
3. **Embedding + stockage** : chaque fait extrait est embeddé localement (384d, `all-MiniLM-L6-v2`) et inséré dans la collection Qdrant `live_memories` avec métadonnées (`sessionId`, `provider`, `timestamp`).
4. **Recall** : `recallRecent(days)` retourne les N derniers souvenirs (SEARCH_TOP_K=5, seuil=0.4) des `days` jours passés. `search(query)` effectue une recherche vectorielle sémantique sur toute l'histoire.

**Intégration dans le system prompt** : `buildLiveMemoryBlock()` dans `gemini-live-system-prompt.ts` injecte automatiquement les souvenirs des 7 derniers jours dans le prompt de chaque session via le bloc XML `<live-memory>`.

**Outil `recall_memory`** : Gemini peut invoquer cet outil en temps réel pour effectuer une recherche sémantique sur demande ("Qu'est-ce qu'on avait discuté la semaine dernière ?").

**Configurable via Personnaliser > Audio Live :**
- `liveModelId` : modèle Live à utiliser (actuellement Gemini 3.1 Flash Live, GPT-4o Realtime en préparation).
- `liveIdentityPrompt` : prompt de personnalité injecté en tête du system prompt (comportement, langue, ton).

### 6.6 IPC (`gemini-live.ipc.ts`)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `gemini-live:check-availability` | invoke | Vérifie si une clé Google est configurée |
| `gemini-live:connect` | invoke | Ouvre la session WebSocket |
| `gemini-live:disconnect` | invoke | Ferme la session |
| `gemini-live:send-audio` | invoke | Forward un chunk PCM 16 kHz au service |
| `gemini-live:respond-command` | invoke | Envoie le résultat d'un tool call à Gemini |
| `gemini-live:set-playback-active` | invoke | Notifie le service que le buffer worklet est actif/inactif |
| `gemini-live:status` | push → renderer | Changement de statut + erreur éventuelle |
| `gemini-live:audio` | push → renderer | Chunk audio PCM base64 depuis Gemini |
| `gemini-live:command` | push → renderer | Tool call à exécuter |
| `gemini-live:clear-playback` | push → renderer | Interruption utilisateur — vider le buffer |

## 7. Synthèse Vocale (Text-to-Speech) (`tts.service.ts`)

Cruchot intègre des capacités de lecture vocale des messages via les APIs cloud d'OpenAI et de Google (Gemini).

### 3.1 Abstraction des APIs
Le service unifie les appels aux APIs TTS. Les coûts sont calculés en temps réel en fonction du nombre de caractères générés (Google TTS étant actuellement en "Preview gratuit", tandis qu'OpenAI facture au million de caractères).

### 3.2 Conversion Audio (PCM vers WAV)
Une spécificité technique est gérée pour l'API Google Gemini : elle retourne un flux audio brut en PCM 16-bit (`audio/L16`). Les navigateurs Web ne sachant pas lire ce format directement avec la balise `<audio>`, le service `tts.service.ts` encapsule ces données brutes dans une en-tête WAV (RIFF chunk) à la volée avant de l'envoyer au frontend React.
