# Team — sandbox-yolo

**Date** : 2026-03-21
**Agents** : 3
**Vagues** : 4

## Prerequis

- Branche `feature-sandbox-yolo` a jour
- Specs lues : `specs/sandbox-yolo/` (brainstorming, architecture-technique, plan, tasks)
- Architecture existante lue : `.memory/architecture.md`, `.memory/patterns.md`, `.memory/gotchas.md`

---

## Prompt d'orchestration

Tu es l'orchestrateur du chantier **sandbox-yolo** pour Cruchot (Multi-LLM Desktop).
Tu coordonnes 3 agents en 4 vagues pour implementer le mode YOLO (execution autonome sandboxee).

Tu es lancé dans CMUX, utilise le Skill **cmux**  pour créer des agents séparés.

### Contexte projet

- Electron 35 + React 19 + TypeScript 5.7 + Tailwind 4 + shadcn/ui + AI SDK v6
- Architecture : Main (Node.js) → Preload (contextBridge) → Renderer (React)
- Conventions : singletons `export const fooService = new FooService()`, Zod validation IPC, `crypto.randomUUID()`, `trash` au lieu de `rm`
- AI SDK v6 : `inputSchema` (pas `parameters`), `stopWhen: stepCountIs(N)`, `chunk.text` (pas `textDelta`), pas de `onFinish`

### Agents

| Agent | Taches | Worktree | Branche |
|-------|--------|----------|---------|
| backend-core | T01, T02, T03, T05, T07, T14, T15 | oui | `sandbox-yolo-backend-core` |
| backend-integration | T04, T06, T08 | oui | `sandbox-yolo-backend-integration` |
| frontend | T09, T10, T11, T12, T13 | oui | `sandbox-yolo-frontend` |

### Vague 1 — Services core (backend-core)

**Agent backend-core** execute T01 + T02 + T03 + T05 + T07 + T14 en parallele.

Ce sont des fichiers independants sans conflit :
- `src/main/services/sandbox.service.ts` (T01)
- `src/main/services/process-manager.service.ts` (T02)
- `src/main/services/seatbelt.ts` (T03)
- `src/main/llm/yolo-prompt.ts` (T05)
- `src/main/db/schema.ts` + `migrate.ts` + `queries/conversations.ts` (T07)
- `src/main/llm/registry.ts` + `types.ts` (T14)

**Critere de completion Vague 1** : tous les fichiers crees, typecheck main 0 erreurs sur les nouveaux fichiers.

### Vague 2 — Integration backend + Cleanup (backend-core + backend-integration)

**Agent backend-core** execute T15 :
- `src/main/index.ts` — cleanup process orphelins au startup

**Agent backend-integration** execute T04 + T06 :
- `src/main/llm/yolo-tools.ts` (T04) — utilise SandboxService + ProcessManager + seatbelt
- `src/main/ipc/sandbox.ipc.ts` (T06) — 6 handlers IPC, enregistre dans index.ts

**Critere de completion Vague 2** : T04 et T06 compiles, T15 integre.

### Vague 3 — chat.ipc + Frontend (backend-integration + frontend)

**Agent backend-integration** execute T08 :
- `src/main/ipc/chat.ipc.ts` — branche YOLO dans handleChatMessage

**Agent frontend** execute T09 → T10 → T11 + T12 → T13 (sequentiel) :
- `src/preload/index.ts` + `types.ts` (T09)
- `src/renderer/src/stores/sandbox.store.ts` (T10)
- `src/renderer/src/components/chat/YoloToggle.tsx` (T11)
- `src/renderer/src/components/chat/YoloStatusBar.tsx` (T12)
- `src/renderer/src/components/chat/InputZone.tsx` + `ChatView.tsx` (T13)

**Critere de completion Vague 3** : typecheck 0 erreurs sur chaque branche.

### Vague 4 — Merge + Validation (orchestrateur)

1. Merge `sandbox-yolo-backend-core` dans `main`
2. Merge `sandbox-yolo-backend-integration` dans `main` (resoudre conflits ipc/index.ts si necessaire)
3. Merge `sandbox-yolo-frontend` dans `main`
4. Typecheck complet (`npm run typecheck`)
5. Test manuel : activer YOLO, envoyer un message, verifier tool calls, Stop, cleanup

---

## Annexe — Detail des taches

### T01 · SandboxService
Singleton. `createSession(workspacePath?)` cree `~/cruchot/sandbox/[UUID]` ou utilise workspace path. `destroySession(sessionId)` supprime (trash). `generateSeatbeltProfile(sandboxDir)` retourne le profil SBPL avec paths substitues.

### T02 · ProcessManagerService
Singleton. `Map<sessionId, Set<ProcessInfo>>`. `track(sessionId, child, meta)`. `killOne/killAll/killGlobal`. SIGTERM → 3s → SIGKILL. Kill par groupe (`-pid`). Max 5 process/session. Auto-cleanup sur exit event.

### T03 · seatbelt.ts
`isSeatbeltAvailable()` → check `/usr/bin/sandbox-exec`. `execSandboxed(cmd, sandboxDir, opts)` → `sandbox-exec -p "profile" /bin/bash -c "cmd"`. Fallback `exec()` si non dispo. Env minimal. Detection `process.platform`.

### T04 · yolo-tools.ts
`buildYoloTools(sandboxService, processManager, sessionId)` → 5 tools AI SDK v6 : bash (unrestricted, via execSandboxed), createFile (realpathSync + startsWith), readFile, listFiles, openPreview (shell.openExternal). `inputSchema` Zod.

### T05 · yolo-prompt.ts
Constante `YOLO_SYSTEM_PROMPT`. Guide le LLM : (1) plan d'abord, (2) attendre approbation, (3) executer, (4) s'arreter. Liste les tools et contraintes. Indique le sandboxDir.

### T06 · sandbox.ipc.ts
6 handlers : activate, deactivate, stop, getStatus, getProcesses, openPreview. Zod validation. Enregistrer dans ipc/index.ts.

### T07 · DB migration
`is_yolo` INTEGER DEFAULT 0, `sandbox_path` TEXT sur conversations. Migration idempotente. Index. Queries Drizzle.

### T08 · chat.ipc.ts integration
Dans `handleChatMessage()` : si `is_yolo` → `buildYoloTools()` + `YOLO_SYSTEM_PROMPT` + `stepCountIs(MAX_STEPS)`. Streaming identique. Zero regression mode Normal.

### T09 · Preload
6 methodes : sandboxActivate, sandboxDeactivate, sandboxStop, sandboxGetStatus, sandboxGetProcesses, sandboxOpenPreview. Types SandboxInfo, ProcessInfo.

### T10 · sandbox.store.ts
Zustand. State : isActive, sessionId, sandboxPath, processes. Actions : activate, deactivate, stop, refreshProcesses, reset.

### T11 · YoloToggle.tsx
Toggle switch. Desactive si modele non compatible. Dialog warning dissuasif a l'activation. Badge visuel YOLO actif.

### T12 · YoloStatusBar.tsx
Barre sous header. Chemin sandbox tronque. Nombre process. Boutons Stop (rouge) + Open Folder. Style amber.

### T13 · Integration
YoloToggle dans InputZone (zone pills). YoloStatusBar dans ChatView. Reset au changement de conversation.

### T14 · registry.ts
`supportsYolo: boolean` sur ModelDefinition. True pour les modeles capable de tool-use multi-step. False pour Haiku, DeepSeek, Nano, Perplexity, image models.

### T15 · Cleanup startup
Au boot : query conversations YOLO orphelines, reset is_yolo/sandbox_path, log cleanups. Deferred init.
