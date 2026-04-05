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

## 6. Live Voice — Architecture Plugin (`live-engine.service.ts`, `live-plugin.interface.ts`, `live.ipc.ts`)

Le système Live Voice est un service de conversation vocale temps-réel. Il a été migré d'une architecture monolithique (Gemini uniquement) vers une **architecture plugin extensible** (v0.9+), prête à accueillir OpenAI Realtime et Voxstral.

### 6.1 Architecture Plugin

```
src/main/live/
  live-plugin.interface.ts     # Interface LivePlugin + types partagés
  live-plugin-registry.ts      # LivePluginRegistry — registration + resolution
  live-engine.service.ts       # LiveEngineService — orchestrateur principal
  live-core-tools.ts           # 13 outils génériques (CoreToolDeclaration[])
  live-core-prompt.ts          # Prompt builder générique (profil + mémoire)
  plugins/
    gemini/
      gemini-live.plugin.ts    # GeminiLivePlugin (transport @google/genai)
      gemini-live-tools.ts     # Outils Gemini-specific (screen share, search grounding)
```

**Interface `LivePlugin`** — contrat minimal qu'implémente chaque plugin :
- `connect(config)` / `disconnect()` — lifecycle
- `sendAudio(base64)` / `sendToolResponse(id, name, result)` — transport audio
- `supportsScreenShare()` / `sendScreenFrame?()` / `setScreenSharing?(active)` — capacités opt-in
- `buildFinalPrompt(corePrompt)` — permet au plugin d'enrichir le prompt (ex: search grounding)
- `getPluginTools()` — outils spécifiques au provider (s'ajoutent aux 13 outils core)
- Callbacks injectés par l'Engine avant `connect()` : `onAudio`, `onToolCall`, `onStatusChange`, `onTranscript`, `onError`

**`LiveEngineService`** (singleton `liveEngineService`) — orchestrateur :
- Résout le plugin actif via `livePluginRegistry.resolveActivePlugin()` (setting `multi-llm:live-model-id`)
- Gère l'anti-écho 3x (voir §6.3), l'idle timer, les diagnostics (turn/chunk counters)
- Délègue le transport audio et les tool calls au plugin actif
- Enregistré dans le `ServiceRegistry` sous la clé `live`

**`LivePluginRegistry`** — registration et résolution :
- `register(plugin)` — enregistre un plugin au startup
- `resolveActivePlugin()` — lit `multi-llm:live-model-id` depuis DB, fallback sur le premier plugin dispo avec clé API
- `getApiKey(providerId)` — déchiffre la clé via `safeStorage`
- `getAvailablePlugins()` — liste tous les plugins avec disponibilité et capacités

Le flux audio est entièrement géré côté renderer via deux **AudioWorklet processors** :
- `capture-processor.ts` : capture le micro à 16 kHz, encode en PCM 16-bit, transfère le buffer au hook `useLiveAudio` qui le forward au main via IPC `live:send-audio`.
- `playback-processor.ts` : reçoit les chunks audio PCM 24 kHz depuis le plugin, les ré-échantillonne en 48 kHz pour le DAC, et joue la réponse en temps réel.

Le singleton tourne entièrement dans le **main process** (pas un UtilityProcess ni un Worker thread) — contrainte GC : le Garbage Collector de Node.js tue la session WebSocket si le client `@google/genai` est dans un processus séparé.

### 6.2 Plugin Gemini (`gemini-live.plugin.ts`)

L'API Gemini Live nécessite **`v1alpha`** (`httpOptions: { apiVersion: 'v1alpha' }`) — la v1beta/v1 ne supporte pas les features avancées (transcription, thinking, proactivité).

Modèle : `gemini-3.1-flash-live-preview`.

Config session :
- `responseModalities: [AUDIO]` — réponse audio uniquement
- `systemInstruction` — prompt assemblé par `live-core-prompt.ts` puis enrichi par `buildFinalPrompt()` du plugin (inject `googleSearch: {}`)
- `tools: [...CORE_TOOLS, ...GEMINI_TOOLS]` — 13 core + outils Gemini-specific
- `thinkingConfig: { thinkingLevel: 'low', includeThoughts: false }` — réflexion légère, non streamée
- `speechConfig` — voix Aoede
- `inputAudioTranscription: {}` + `outputAudioTranscription: {}` — transcriptions activées (loggées en console)
- `realtimeInputConfig` — VAD HIGH sensitivity, 500ms prefix padding, 500ms silence duration

**Search Grounding** : le `GeminiLivePlugin` injecte `{ googleSearch: {} }` dans les outils de la session, permettant à Gemini de récupérer des informations web en temps réel pendant la conversation vocale.

### 6.3 Cycle de vie et états

5 statuts possibles (`LiveStatus`) : `off` → `connecting` → `connected` → `listening` → `speaking` (+ `dormant` + `error`).

**Anti-écho 3x** — 3 guards dans `sendAudio()` de `LiveEngineService` :
1. Si `status === 'speaking'` → mute le micro (le plugin parle, ne pas lui renvoyer sa propre voix)
2. Si `isPlaybackActive === true` → mute (buffer worklet en cours de drainage)
3. Si `Date.now() < postTurnCooldownUntil` → mute (cooldown 500ms post-playback pour laisser l'écho se dissiper)

**Idle timer** : après 5 min sans activité, la session est fermée (statut → `dormant`). Le service passe en `dormant` (pas `off`) pour permettre une reconnexion rapide au prochain clic.

### 6.4 Function Calling (13 outils core + outils plugin)

Les 13 **outils core** (`live-core-tools.ts`) sont partagés entre tous les plugins :

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
| `request_screenshot` | Capture un screenshot haute qualité de l'écran partagé (si partage actif) |
| `pause_screen_share` | Met en pause l'envoi de frames vidéo sans fermer le MediaStream |
| `resume_screen_share` | Reprend l'envoi de frames après une pause |

Quand le plugin appelle un outil, le main envoie un `live:command` event au renderer. Le `CruchotCommandHandler` (renderer, `cruchot-command-handler.ts`) dispatch des `CustomEvent` DOM (`cruchot:navigate`, `cruchot:toggle-ui`, etc.) écoutés par les stores Zustand et les composants React. Le résultat est renvoyé au main via `live:respond-command`, et le main appelle `plugin.sendToolResponse()`.

### 6.5 NotchBar (UI)

La `NotchBar` est un composant flottant positionné dans le `TopBar` (`-webkit-app-region: drag` désactivé sur la pill). Elle affiche 5 états visuels :
- **Off/Dormant** : petite pill grise discrète (hover → expand + label LIVE)
- **Connecting** : pill grise étendue
- **Connected** : pill slate + label LIVE
- **Listening** : pill bleue + waveform bars animées (niveau mic)
- **Speaking** : pill ambrée + waveform bars animées (niveau speaker)

Cliquer la pill connecte/déconnecte. Les bars waveform sont animées via CSS `height` en pixels synchronisé avec les niveaux audio réels.

Le store renderer est `live.store.ts` (ex `gemini-live.store.ts`), le hook audio est `useLiveAudio.ts` (ex `useGeminiLiveAudio.ts`).

### 6.6 Mémoire Sémantique Vocale (`live-memory.service.ts`)

Le `LiveMemoryService` (singleton `liveMemoryService`) offre une mémoire persistante entre les sessions vocales, distincte de la mémoire sémantique des conversations texte.

**Pipeline :**
1. **Accumulation** : `addTranscript(role, text)` accumule les transcriptions (user + assistant) pendant la session.
2. **Extraction** : à la déconnexion (ou idle timeout), `extractAndStore()` — fire-and-forget — envoie les transcripts au LLM configuré si ≥ 3 échanges utilisateur. Le LLM extrait les faits clés sous forme de phrases courtes (retourne un JSON array de strings).
3. **Embedding + stockage** : chaque fait extrait est embeddé localement (384d, `all-MiniLM-L6-v2`) et inséré dans la collection Qdrant `live_memories` avec métadonnées (`sessionId`, `provider`, `timestamp`).
4. **Recall** : `recallRecent(days)` retourne les N derniers souvenirs (SEARCH_TOP_K=5, seuil=0.4) des `days` jours passés. `search(query)` effectue une recherche vectorielle sémantique sur toute l'histoire.

**Intégration dans le system prompt** : `buildLiveMemoryBlock()` dans `live-core-prompt.ts` injecte automatiquement les souvenirs des 7 derniers jours dans le prompt de chaque session via le bloc XML `<live-memory>`.

**Outil `recall_memory`** : le plugin peut invoquer cet outil en temps réel pour effectuer une recherche sémantique sur demande.

**Configurable via Personnaliser > Audio Live :**
- `liveModelId` : modèle Live à utiliser (format `providerId::modelId`).
- `liveIdentityPrompt` : prompt de personnalité injecté en tête du system prompt.

### 6.7 IPC (`live.ipc.ts`) — canaux renommés `gemini-live:*` → `live:*`

| Channel | Direction | Description |
|---------|-----------|-------------|
| `live:check-availability` | invoke | Vérifie si au moins un plugin a une clé API |
| `live:connect` | invoke | Ouvre la session via le plugin résolu |
| `live:disconnect` | invoke | Ferme la session |
| `live:send-audio` | invoke | Forward un chunk PCM 16 kHz au plugin actif |
| `live:respond-command` | invoke | Envoie le résultat d'un tool call au plugin |
| `live:set-playback-active` | invoke | Notifie le service que le buffer worklet est actif/inactif |
| `live:status` | push → renderer | Changement de statut + erreur éventuelle |
| `live:audio` | push → renderer | Chunk audio PCM base64 depuis le plugin |
| `live:command` | push → renderer | Tool call à exécuter |
| `live:clear-playback` | push → renderer | Interruption utilisateur — vider le buffer |
| `live:screen-sources` | invoke | Liste les sources disponibles (écrans + fenêtres) → `ScreenSource[]` |
| `live:screen-frame` | send (R→M) | Fire-and-forget — JPEG base64 depuis le hook renderer |
| `live:screen-sharing:set` | send (R→M) | Toggle `isScreenSharing` dans le plugin |
| `live:screen-sharing:status` | push → renderer | Broadcast du nouvel état isScreenSharing |
| `live:screen-select-source` | invoke | Transmet le sourceId avant appel `getDisplayMedia()` |
| `live:request-screenshot` | push → renderer | Déclenche une capture haute qualité côté renderer |
| `live:screen-permission` | invoke | Check `systemPreferences.getMediaAccessStatus('screen')` |
| `live:list-plugins` | invoke | Retourne `AvailablePlugin[]` avec disponibilité et capacités |

### 6.8 Screen Sharing (`useScreenCapture.ts`, `ScreenSourcePicker.tsx`)

Le screen sharing est un sous-état de la session Live — toujours déclenché explicitement par l'utilisateur, jamais automatiquement.

**Architecture :**

```
Renderer                                    Main
────────                                    ────
Click icône Monitor (NotchBar)
  │
  ├─ IPC: screen-permission          →  systemPreferences.getMediaAccessStatus('screen')
  │  ← 'granted' | 'denied'
  │
  ├─ IPC: screen-sources             →  desktopCapturer.getSources({types:['screen','window']})
  │  ← ScreenSource[] (thumbnails data URL)
  │
  ├─ ScreenSourcePicker (user choisit)
  │
  ├─ IPC: screen-select-source(id)   →  pendingSourceId = id
  │
  ├─ getDisplayMedia()               →  setDisplayMediaRequestHandler callback
  │  ← MediaStream                      (sources via desktopCapturer)
  │
  └─ useScreenCapture hook
     - Canvas offscreen max 1280×720
     - drawImage(video) toutes les 500ms
     - Diff 4×4 pixels grid — delta moyen RGB
     - Si delta >= 10 → JPEG 0.7 → IPC: screen-frame →  sendScreenFrame()
                                                          session.sendRealtimeInput({ video })
```

**`GeminiLiveService` — champs et méthodes ajoutés :**

- `isScreenSharing: boolean` — guard pour `sendScreenFrame()`
- `sendScreenFrame(jpegBase64)` — forward vers `session.sendRealtimeInput()` + `resetIdleTimer()`
- `setScreenSharing(active)` — toggle + broadcast `screen-sharing:status`
- `requestScreenshot()` — broadcast `request-screenshot` au renderer
- `disconnect()` — reset `isScreenSharing = false` + broadcast

**`setDisplayMediaRequestHandler`** est configuré une seule fois dans `src/main/index.ts` au startup, via un `pendingSourceId` string qui sert de rendez-vous entre l'IPC `screen-select-source` et l'appel `getDisplayMedia()` du renderer.

**Cadence adaptative :** 0 FPS si écran statique (delta < 10), ~2 FPS en activité, burst sur changements majeurs. Screenshot haute qualité via le tool `request_screenshot` (résolution native, JPEG 0.9).

**Privacy :** frames en RAM uniquement — aucune écriture disque, aucun log de contenu visuel. Au stop : `MediaStream.getTracks().forEach(t => t.stop())`, canvas GC.

## 7. Gestion du Contexte (CompactService) (`compact.service.ts`, `compact.ipc.ts`)

Le `CompactService` gère automatiquement la fenêtre de contexte LLM pour éviter les erreurs de dépassement (`context_length_exceeded`) sur les longues conversations.

### 7.1 Architecture

Le service est appelé par `chat.ipc.ts` **avant** chaque appel `streamText()`, dans la fonction `prepareMessages()`. Il opère en 3 niveaux :

1. **Injection du résumé existant** : si la conversation possède déjà un `compactSummary`, le service construit un message synthétique `<conversation-summary>` + les messages postérieurs au `compactBoundaryId`. Les messages anciens sont ignorés — la fenêtre de contexte est reconstituée à partir du résumé.

2. **Micro-compaction** : si l'estimation des tokens dépasse 75 % (`COMPACT_THRESHOLD`) du `contextWindow` du modèle, le service supprime les résultats d'outils volumineux (remplacés par `[Resultat supprime]`), en commençant par les plus anciens, jusqu'à descendre sous 60 % (`MICROCOMPACT_TARGET`). Aucune donnée n'est modifiée en DB — c'est une opération en mémoire.

3. **Full compact** (déclenché manuellement via IPC) : appel LLM (`generateText`) avec `COMPACT_PROMPT` pour résumer toute la conversation. Le résumé et le `compactBoundaryId` (ID du dernier message résumé) sont persistés sur `conversations` en SQLite.

### 7.2 Estimation des tokens

L'estimation (`estimateTokens()`) est heuristique : `content.length / 4` pour les messages texte, avec des majorations pour les images JPEG/PNG (2048 tokens) et les images PDF (1024 tokens par page). Elle prend en compte les `contentData` (pièces jointes multi-part).

### 7.3 UI (ContextWindowBar)

Le composant `ContextWindowBar` (`src/renderer/src/components/chat/ContextWindowBar.tsx`) affiche une barre de progression en bas de l'InputZone :
- **Visible** uniquement si l'utilisation dépasse 50 % de la fenêtre de contexte.
- **Couleur** : verte (< 75 %), orange (75–90 %), rouge (> 90 %).
- **Bouton "Compacter"** : déclenche `compact:run` via IPC. L'`ui.store` met `isCompacting = true` pendant l'opération — l'InputZone est bloquée.
- **Label** : affiche le pourcentage d'utilisation et le nom du modèle actif.

### 7.4 IPC (`compact.ipc.ts`)

| Channel | Description |
|---------|-------------|
| `compact:run` | Lance la full compaction. Charge les messages, génère le résumé, persiste `compactSummary` + `compactBoundaryId` |

Le handler `compact:run` enregistre également le coût LLM de la compaction dans la table `llm_costs` via `createLlmCost({ type: 'compact', ... })` avec les métadonnées `tokensBefore` / `tokensAfter`.

### 7.5 Guard anti-double invocation

Un `Set<string>` (`compactingSet`) dans le handler IPC empêche deux compactions simultanées sur la même conversation. Une tentative parallèle retourne une erreur immédiate.

## 8. Synthèse Vocale (Text-to-Speech) (`tts.service.ts`)

Cruchot intègre des capacités de lecture vocale des messages via les APIs cloud d'OpenAI et de Google (Gemini).

### 3.1 Abstraction des APIs
Le service unifie les appels aux APIs TTS. Les coûts sont calculés en temps réel en fonction du nombre de caractères générés (Google TTS étant actuellement en "Preview gratuit", tandis qu'OpenAI facture au million de caractères).

### 3.2 Conversion Audio (PCM vers WAV)
Une spécificité technique est gérée pour l'API Google Gemini : elle retourne un flux audio brut en PCM 16-bit (`audio/L16`). Les navigateurs Web ne sachant pas lire ce format directement avec la balise `<audio>`, le service `tts.service.ts` encapsule ces données brutes dans une en-tête WAV (RIFF chunk) à la volée avant de l'envoyer au frontend React.
