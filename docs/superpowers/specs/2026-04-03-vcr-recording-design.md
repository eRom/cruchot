# VCR Recording — Design Spec

> Date : 2026-04-03
> Feature : #18 du feature-research-s52
> Statut : Design validé, prêt pour implémentation

## Résumé

Enregistrer les sessions de conversation tools (tool calls, permissions, texte, reasoning) dans un format rejouable pour audit, debug et demo. Fichiers `.vcr` portables (NDJSON), player intégré avec timeline + replay animé, export HTML standalone avec anonymisation optionnelle.

## Use-cases

1. **Audit sécurité** — revoir les actions LLM, permissions accordées, commandes exécutées
2. **Debug** — rejouer step-by-step un échange qui a mal tourné
3. **Demo / Documentation** — enregistrer un workflow pour le partager

## Décisions de design

| Question | Choix | Justification |
|----------|-------|---------------|
| Périmètre | Session libre (start/stop manuel) | Flexible, l'utilisateur contrôle |
| Replay | Mixte (timeline + replay animé) | Timeline pour naviguer, replay pour revivre |
| Stockage | Fichiers `.vcr` NDJSON | Portable, partageable, zero dépendance DB |
| Déclenchement | Bouton Right Panel (section 7/7) | Cohérent avec l'archi existante, discret |
| Player | Modal/Sheet overlay | Ne perd pas le contexte chat |
| Export | `.vcr` natif + HTML standalone | Brut pour soi, HTML pour les autres |
| Contenu fichiers | Toggle "full capture" (optionnel) | Équilibre taille/utilité |
| Architecture | EventBus découplé | chat émet, VCR écoute, zero overhead si pas de recording |
| Anonymisation | TypeScript pur, regex déterministe | Zero tokens LLM, instantané, offline, déterministe |

---

## 1. Format `.vcr`

NDJSON (une ligne JSON par entrée). Extension `.vcr`.

### Header (ligne 1)

```json
{
  "version": 1,
  "conversationId": "abc-123",
  "modelId": "claude-sonnet-4-6",
  "providerId": "anthropic",
  "workspacePath": "/Users/romain/projet",
  "roleId": "dev",
  "fullCapture": false,
  "startedAt": 1712150400000,
  "metadata": {
    "appVersion": "0.7.1"
  }
}
```

### Événements (lignes 2+)

Format : `[offsetMs, eventType, data]`

- `offsetMs` : millisecondes depuis `startedAt`
- `eventType` : string enum (14 types)
- `data` : payload spécifique au type

### Types d'événements

| Type | Data | Description |
|------|------|-------------|
| `session-start` | `{}` | Début recording |
| `session-stop` | `{ reason: "manual" \| "conversation-end" }` | Fin recording |
| `user-message` | `{ content: string, attachments?: string[] }` | Message utilisateur envoyé |
| `text-delta` | `{ text: string }` | Token de réponse LLM |
| `reasoning-delta` | `{ text: string }` | Token de thinking/reasoning |
| `tool-call` | `{ toolCallId: string, toolName: string, args: Record<string, unknown> }` | Tool lancé par le LLM |
| `tool-result` | `{ toolCallId: string, status: "success" \| "error", result?: string, error?: string, meta?: ToolResultMeta }` | Résultat du tool |
| `permission-decision` | `{ toolCallId: string, decision: "auto-allow" \| "allow" \| "deny" \| "ask", rule?: string }` | Décision du pipeline permission |
| `permission-response` | `{ toolCallId: string, response: "allow" \| "deny" \| "allow-session", responseTimeMs: number }` | Réponse user à l'approval (si decision=ask) |
| `plan-proposed` | `{ plan: object }` | Plan détecté dans le stream |
| `plan-approved` | `{ editedSteps?: object[] }` | Plan validé par l'utilisateur |
| `plan-step` | `{ stepIndex: number, status: "running" \| "done" \| "failed" }` | Step de plan exécuté |
| `file-diff` | `{ filePath: string, oldContent: string, newContent: string }` | Diff complet (full capture uniquement) |
| `finish` | `{ tokensIn: number, tokensOut: number, cost: number, responseTimeMs: number }` | Fin du message assistant |

### ToolResultMeta

```typescript
interface ToolResultMeta {
  duration?: number      // ms
  exitCode?: number      // bash
  lineCount?: number     // readFile
  byteSize?: number      // file size
  matchCount?: number    // grep
  fileCount?: number     // listFiles/glob
}
```

### Exemple complet

```jsonl
{"version":1,"conversationId":"abc","modelId":"claude-sonnet-4-6","providerId":"anthropic","workspacePath":"/Users/romain/projet","roleId":"dev","fullCapture":false,"startedAt":1712150400000,"metadata":{"appVersion":"0.7.1"}}
[0,"session-start",{}]
[142,"user-message",{"content":"Refactorise le router","attachments":["schema.ts"]}]
[185,"text-delta",{"text":"Je vais "}]
[201,"text-delta",{"text":"examiner "}]
[890,"tool-call",{"toolCallId":"tc_1","toolName":"readFile","args":{"file_path":"/src/main/llm/router.ts"}}]
[920,"permission-decision",{"toolCallId":"tc_1","decision":"auto-allow","rule":"READONLY_COMMANDS"}]
[1250,"tool-result",{"toolCallId":"tc_1","status":"success","result":"...","meta":{"lineCount":89,"duration":12}}]
[3400,"tool-call",{"toolCallId":"tc_2","toolName":"FileEdit","args":{"file_path":"/src/main/llm/router.ts"}}]
[3420,"permission-decision",{"toolCallId":"tc_2","decision":"ask","rule":"default"}]
[8750,"permission-response",{"toolCallId":"tc_2","response":"allow","responseTimeMs":5330}]
[9100,"tool-result",{"toolCallId":"tc_2","status":"success","meta":{"duration":45}}]
[15000,"finish",{"tokensIn":1200,"tokensOut":450,"cost":0.0082,"responseTimeMs":15000}]
[15001,"session-stop",{"reason":"manual"}]
```

---

## 2. Architecture

### EventBus

```
chat.ipc.ts ──emit──→ VcrEventBus ──listen──→ VcrRecorderService
                                   ──listen──→ (futur: audit log, telemetry...)
```

`VcrEventBus` : EventEmitter Node.js typé, singleton. Interface `VcrEventMap` pour le type-safety. Si personne n'écoute, les événements sont ignorés — zero overhead.

### Points d'émission dans chat.ipc.ts

8 points d'émission ajoutés dans le streaming handler existant :

| Lieu dans chat.ipc.ts | Événement émis |
|------------------------|----------------|
| `onChunk` callback — chunk type `text-delta` | `text-delta` |
| `onChunk` callback — chunk type `tool-call` | `tool-call` |
| `onChunk` callback — chunk type `tool-result` | `tool-result` |
| Reasoning accumulation | `reasoning-delta` |
| Permission engine (dans `buildConversationTools` wrapper) | `permission-decision` |
| Approval callback response | `permission-response` |
| Plan detection / approval / step | `plan-proposed`, `plan-approved`, `plan-step` |
| Finalize phase | `finish` |

Le chat handler émet toujours, indépendamment de l'état du recording.

---

## 3. Services

### VcrRecorderService — `src/main/services/vcr-recorder.service.ts`

Singleton. Gère le cycle de vie des recordings.

**State** :
- `activeRecording: { id, conversationId, filePath, writeStream, startedAt, eventCount, toolCallCount, fullCapture } | null`
- Abonnement au `VcrEventBus` actif seulement pendant un recording

**API** :
- `startRecording(conversationId: string, options?: { fullCapture?: boolean }): { recordingId: string }`
- `stopRecording(): { recordingId: string, duration: number, eventCount: number }`
- `isRecording(): boolean`
- `getActiveRecording(): ActiveRecordingInfo | null`
- `listRecordings(): VcrRecordingHeader[]` — scanne `{userData}/vcr-recordings/`, parse la première ligne de chaque `.vcr`
- `getRecording(recordingId: string): VcrRecording` — parse le `.vcr` complet
- `deleteRecording(recordingId: string): void` — `trash` (pas rm)
- `exportVcr(recordingId: string, destPath: string): void` — copie le `.vcr`
- `exportHtml(recordingId: string, destPath: string, options?: { anonymize?: boolean }): void` — génère HTML standalone

**Écriture** : `fs.createWriteStream` en mode append. Chaque événement = un `write()` + `\n`. Pas de buffering — crash-safe (les événements précédents survivent même si l'app crash).

**Stockage** : `{userData}/vcr-recordings/{conversationId}_{timestamp}_{nanoid(6)}.vcr`

**recordingId** : le basename du fichier sans extension (ex: `abc-123_1712150400000_x7k9m2`). Utilisé comme identifiant unique dans toute l'API.

### VcrEventBus — `src/main/services/vcr-event-bus.ts`

EventEmitter typé, singleton.

```typescript
interface VcrEventMap {
  'text-delta': { text: string }
  'reasoning-delta': { text: string }
  'tool-call': { toolCallId: string; toolName: string; args: Record<string, unknown> }
  'tool-result': { toolCallId: string; status: string; result?: string; error?: string; meta?: ToolResultMeta }
  'permission-decision': { toolCallId: string; decision: string; rule?: string }
  'permission-response': { toolCallId: string; response: string; responseTimeMs: number }
  'user-message': { content: string; attachments?: string[] }
  'plan-proposed': { plan: object }
  'plan-approved': { editedSteps?: object[] }
  'plan-step': { stepIndex: number; status: string }
  'finish': { tokensIn: number; tokensOut: number; cost: number; responseTimeMs: number }
}
```

### VcrAnonymizer — `src/main/services/vcr-anonymizer.service.ts`

Singleton. Pipeline de patterns regex avec remplacement déterministe.

**Patterns par défaut** :

| Catégorie | Pattern | Préfixe remplacement |
|-----------|---------|---------------------|
| IPs | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` | `IP-` (IP-001, IP-002...) |
| Emails | `[\w.-]+@[\w.-]+\.\w+` | `Mail-` (Mail-A, Mail-B...) |
| Chemins user | `/Users/<username>/` | `/Users/user1/` |
| Clés API | `(sk-\|key_\|token_)[a-zA-Z0-9]{8,}` | `KEY-REDACTED-` |
| URLs avec secrets | `[?&](token\|key\|secret\|password)=[^&\s]+` | `REDACTED` |

**Patterns custom** : fichier `{userData}/vcr-anonymize-rules.json` :

```json
[
  { "label": "Numéro agent", "pattern": "AGT-\\d{4}", "prefix": "Agent" },
  { "label": "IP interne", "pattern": "10\\.\\d+\\.\\d+\\.\\d+", "prefix": "IP-INT" }
]
```

**Mapping** : `Map<string, string>` interne, garantit que la même valeur reçoit toujours le même code. Non exportée dans le HTML. Disponible en fichier `.vcr.map.json` séparé si l'utilisateur veut dé-anonymiser.

**Champs ciblés par type d'événement** :

| Event type | Champs anonymisés |
|------------|-------------------|
| `user-message` | `content` |
| `text-delta` | `text` |
| `reasoning-delta` | `text` |
| `tool-call` | `args` (récursif sur valeurs string) |
| `tool-result` | `result` |
| `file-diff` | `filePath`, `oldContent`, `newContent` |

### VcrHtmlExporter — `src/main/services/vcr-html-exporter.service.ts`

Génère un fichier HTML standalone à partir d'un `.vcr`.

**Structure du HTML** :
- Données `.vcr` embarquées en `<script type="application/json" id="vcr-data">`
- Player complet (timeline + replay) en CSS/JS vanilla inline
- Dark mode, responsive
- Template dans `src/main/services/vcr-html-template.ts` (template literal TypeScript)

**Footer branding** (supprimable) :
- Logo Cruchot SVG inline + "Recorded with Cruchot"
- Auteur (optionnel, configurable dans settings)
- Date d'enregistrement + durée
- Element `<footer id="vcr-branding">` — facilement supprimable

**Pipeline** :
```
.vcr → (anonymize?) → inject dans template → écrire .html
```

**Taille estimée** : 30-50KB (player + données recording moyen).

---

## 4. IPC

### Handlers — `src/main/ipc/vcr.ipc.ts`

| Channel | Type | Payload | Retour |
|---------|------|---------|--------|
| `vcr:start` | invoke | `{ conversationId: string, fullCapture?: boolean }` | `{ recordingId: string }` |
| `vcr:stop` | invoke | `{}` | `{ recordingId: string, duration: number, eventCount: number }` |
| `vcr:status` | invoke | `{}` | `{ recording: boolean, info?: ActiveRecordingInfo }` |
| `vcr:list` | invoke | `{}` | `VcrRecordingHeader[]` |
| `vcr:get` | invoke | `{ recordingId: string }` | `VcrRecording` |
| `vcr:delete` | invoke | `{ recordingId: string }` | `void` |
| `vcr:export-html` | invoke | `{ recordingId: string, destPath: string, anonymize?: boolean }` | `{ path: string }` |
| `vcr:recording-state` | send | — | `{ recording: boolean, info?: ActiveRecordingInfo }` |

Validation Zod sur tous les handlers invoke.

### Preload — `src/preload/index.ts`

```typescript
vcr: {
  startRecording: (conversationId: string, fullCapture?: boolean) =>
    ipcRenderer.invoke('vcr:start', { conversationId, fullCapture }),
  stopRecording: () => ipcRenderer.invoke('vcr:stop', {}),
  getStatus: () => ipcRenderer.invoke('vcr:status', {}),
  listRecordings: () => ipcRenderer.invoke('vcr:list', {}),
  getRecording: (recordingId: string) => ipcRenderer.invoke('vcr:get', { recordingId }),
  deleteRecording: (recordingId: string) => ipcRenderer.invoke('vcr:delete', { recordingId }),
  exportHtml: (recordingId: string, destPath: string, anonymize?: boolean) =>
    ipcRenderer.invoke('vcr:export-html', { recordingId, destPath, anonymize }),
  onRecordingState: (cb: (state: RecordingState) => void) => {
    ipcRenderer.on('vcr:recording-state', (_e, state) => cb(state))
  },
  offRecordingState: () => ipcRenderer.removeAllListeners('vcr:recording-state'),
}
```

---

## 5. UI — Renderer

### Store — `src/renderer/src/stores/vcr.store.ts`

```typescript
interface VcrStore {
  // État recording
  isRecording: boolean
  activeRecording: ActiveRecordingInfo | null

  // Liste recordings
  recordings: VcrRecordingHeader[]

  // Player
  playerOpen: boolean
  playerRecordingId: string | null
  playerMode: 'timeline' | 'replay'

  // Recordings list sheet
  listOpen: boolean

  // Actions
  startRecording: (conversationId: string, fullCapture?: boolean) => Promise<void>
  stopRecording: () => Promise<void>
  loadRecordings: () => Promise<void>
  openPlayer: (recordingId: string) => void
  closePlayer: () => void
  togglePlayerMode: () => void
  openList: () => void
  closeList: () => void
  deleteRecording: (recordingId: string) => Promise<void>
  exportHtml: (recordingId: string, anonymize?: boolean) => Promise<void>
}
```

### Composants

| Composant | Fichier | Rôle |
|-----------|---------|------|
| `VcrSection` | `chat/right-panel/VcrSection.tsx` | Section 7/7 du Right Panel — toggle record/stop, checkbox full capture, bouton Recordings |
| `VcrBadge` | `chat/VcrBadge.tsx` | Pill REC clignotant dans ContextWindowIndicator |
| `VcrPlayer` | `chat/vcr/VcrPlayer.tsx` | Sheet/Modal principal avec header, contrôles, switch mode |
| `VcrTimeline` | `chat/vcr/VcrTimeline.tsx` | Mode timeline — sidebar événements + panneau détail + barre progression avec marqueurs |
| `VcrReplay` | `chat/vcr/VcrReplay.tsx` | Mode replay animé — chat simulé avec tokens + tool cards |
| `VcrRecordingsList` | `chat/vcr/VcrRecordingsList.tsx` | Sheet liste des recordings — cards avec actions |
| `VcrProgressBar` | `chat/vcr/VcrProgressBar.tsx` | Barre de progression partagée avec marqueurs colorés tool calls |

### Right Panel — Section VCR

Position 7/7 (dernier), pattern identique aux autres sections (`bg-sidebar`).

**État idle** :
- Bouton "Record" + bouton "Recordings" (📂)
- Checkbox "Full capture (diffs fichiers)"

**État recording** :
- Badge REC clignotant
- Compteurs live : durée, événements, tool calls
- Bouton "Stop Recording" (rouge)

**Collapsed (40px)** : icône ⏺ — grise idle, rouge clignotant recording.

### Badge REC — ContextWindowIndicator

Quand `isRecording === true`, un pill `<span>` rouge clignotant apparaît à côté des tokens dans le `ContextWindowIndicator`. Visible même si le Right Panel est fermé.

### Player — VcrPlayer (Sheet)

**Sheet shadcn/ui** pleine hauteur, largeur ~80vw. Deux modes switchables :

**Mode Timeline** :
- Sidebar gauche (260px) : liste des événements, colorés par type (vert success, orange asked, rouge error), timestamp, résumé une ligne
- Panneau droit : détail de l'événement sélectionné (JSON formaté, contenu, diff si full capture)
- Barre de progression en bas : marqueurs colorés positionnés proportionnellement aux tool calls
- Contrôles : play/pause, vitesse (0.5x, 1x, 2x, 4x), switch vers replay (🎬)

**Mode Replay** :
- Zone chat simulée : messages user + assistant avec tokens animés
- Tool calls en cards inline (même rendu que le chat normal)
- Curseur clignotant pendant le streaming simulé
- Contrôles : pause, vitesse, switch vers timeline (📊)

**Mécanique du replay** :
- `requestAnimationFrame` loop qui consomme les événements selon `offsetMs × speed`
- Les `text-delta` sont groupés par batch de 50ms pour fluidité
- Les `tool-call`/`tool-result` apparaissent instantanément (pas de simulation d'attente artificielle sauf pour l'approval time réel)
- Pause = arrêt de la loop, position conservée
- Clic sur un événement timeline = saut direct (recalcule l'état accumulé jusqu'à ce point)

### Recordings List — VcrRecordingsList (Sheet)

Sheet shadcn/ui depuis la droite. Liste de cards :
- Date, durée, modèle, nombre de tool calls, conversation source
- Tri par date (plus récent en haut)
- Actions : ▶ Play, 📂 Export .vcr, 🌐 Export HTML, 🗑 Supprimer

---

## 6. Fichiers à créer

| Fichier | Type |
|---------|------|
| `src/main/services/vcr-event-bus.ts` | Service — EventBus typé |
| `src/main/services/vcr-recorder.service.ts` | Service — Recording lifecycle |
| `src/main/services/vcr-anonymizer.service.ts` | Service — Anonymisation regex |
| `src/main/services/vcr-html-exporter.service.ts` | Service — Export HTML |
| `src/main/services/vcr-html-template.ts` | Template — HTML standalone player |
| `src/main/ipc/vcr.ipc.ts` | IPC — 8 handlers Zod |
| `src/renderer/src/stores/vcr.store.ts` | Store — Zustand |
| `src/renderer/src/components/chat/right-panel/VcrSection.tsx` | UI — Section Right Panel |
| `src/renderer/src/components/chat/VcrBadge.tsx` | UI — Pill REC |
| `src/renderer/src/components/chat/vcr/VcrPlayer.tsx` | UI — Player principal |
| `src/renderer/src/components/chat/vcr/VcrTimeline.tsx` | UI — Mode timeline |
| `src/renderer/src/components/chat/vcr/VcrReplay.tsx` | UI — Mode replay animé |
| `src/renderer/src/components/chat/vcr/VcrRecordingsList.tsx` | UI — Liste recordings |
| `src/renderer/src/components/chat/vcr/VcrProgressBar.tsx` | UI — Barre progression partagée |

## 7. Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/main/ipc/chat.ipc.ts` | ~8 lignes d'émission VcrEventBus aux points de capture |
| `src/main/ipc/index.ts` | Enregistrer `registerVcrIpc()` |
| `src/preload/index.ts` | Ajouter namespace `vcr` (~10 méthodes) |
| `src/preload/types.ts` | Types VCR (VcrRecordingHeader, VcrRecording, VcrEvent, ActiveRecordingInfo, RecordingState) |
| `src/renderer/src/components/chat/right-panel/RightPanel.tsx` | Ajouter `<VcrSection />` en position 7 |
| `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Ajouter `<VcrBadge />` conditionnel |
| `src/renderer/src/components/chat/ChatView.tsx` | Monter `<VcrPlayer />` et `<VcrRecordingsList />` |

## 8. Ce qui n'est PAS dans le scope

- Pas de table SQLite (filesystem only)
- Pas d'enregistrement automatique (toujours manuel)
- Pas de recording côté Arena (scope chat normal uniquement)
- Pas de recording des MCP tool calls (scope conversation tools 8 built-in uniquement)
- Pas d'import de `.vcr` externe (v1 = lecture locale uniquement)
- Pas de compression des fichiers `.vcr` (NDJSON brut, éventuellement en v2)
