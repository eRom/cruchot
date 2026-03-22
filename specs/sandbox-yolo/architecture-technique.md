# Architecture Technique — sandbox-yolo

**Date** : 2026-03-21
**Statut** : Decide
**Contexte** : brainstorming.md, architecture-fonctionnelle.md

## Probleme architectural

Ajouter un mode d'execution autonome ("YOLO") a Cruchot ou le LLM peut enchainer des tool calls (creer fichiers, executer bash, demarrer serveurs) dans un environnement confine par l'OS. Il faut : (1) un sandbox OS-level, (2) un process manager robuste, (3) un set de tools elargi, (4) un flow plan/approve/execute dans le chat existant.

## Flux principal

```
Renderer: Toggle YOLO ON
    ↓ (IPC sandbox:activate)
Main: SandboxService.create(workspacePath | null)
    → Cree dossier sandbox (workspace ou ~/cruchot/sandbox/[UUID])
    → Prepare profil Seatbelt (macOS) ou chroot config (Windows)
    ↓
Utilisateur saisit message
    ↓ (IPC chat:send avec mode=yolo)
Main: handleChatMessage() detecte mode YOLO
    → Selectionne tools YOLO (bash unrestricted, createFile, readFile, listFiles, openPreview)
    → Injecte system prompt YOLO (plan-then-execute)
    → streamText() avec stopWhen: stepCountIs(MAX_STEPS)
    ↓
LLM genere plan → chunks IPC → Renderer affiche
Utilisateur dit "go"
    ↓
LLM enchaine tool calls → chaque tool-call/tool-result forward IPC
    ↓ (tool bash/startServer)
SandboxService.exec(command) → spawn child_process sous Seatbelt
    → ProcessManager.track(pid, sessionId)
    ↓
Utilisateur clique Stop OU step limit OU timeout
    ↓ (IPC sandbox:stop)
ProcessManager.killAll(sessionId) → SIGTERM → 3s → SIGKILL
SandboxService.cleanup(sessionId)
```

## Decisions architecturales

### Decision 1 : Seatbelt via sandbox-exec (macOS)

**Probleme** : Confiner les process enfants au dossier sandbox sans Docker
**Options** :
  - Option A : `sandbox-exec -p "profil SBPL"` wrappant chaque `exec()` → confinement OS natif / API deprecated
  - Option B : Filesystem guards (realpathSync + isPathAllowed) → simple / contournable
  - Option C : Docker micro-container → isolation parfaite / prerequis Docker
**Choix** : A (macOS) + B fallback (Windows)
**Raison** : Pattern prouve par Claude Code et Codex. Seatbelt confine recursivement tous les sous-process. Le fallback filesystem suffit pour Windows en mono-user.

### Decision 2 : ProcessManager singleton

**Probleme** : Tracker et killer proprement les process enfants (serveurs Vite, scripts Python, npm install)
**Options** :
  - Option A : Map<sessionId, Set<ChildProcess>> dans un service dedie → lifecycle complet / un service de plus
  - Option B : AbortController par process → simple / pas de vue globale
**Choix** : A
**Raison** : Il faut pouvoir killAll par session (stop), par conversation (changement), et globalement (quit app). Un singleton avec une Map est le pattern le plus robuste et coherent avec les autres services (QdrantProcess, McpManager).

### Decision 3 : Tools YOLO = superset des workspace tools

**Probleme** : Quels outils donner au LLM en mode YOLO
**Options** :
  - Option A : Memes tools que Normal mais debrides → simple / pas de nouvelles capacites
  - Option B : Tools specifiques YOLO (bash unrestricted + createFile + readFile + listFiles + openPreview + startServer) → expressif / plus de code
**Choix** : B
**Raison** : Le LLM a besoin de capacites nouvelles (demarrer un serveur, ouvrir un preview). Les tools existants sont trop restrictifs (blocklist bash) et pas assez expressifs. On cree `buildYoloTools()` qui remplace `buildWorkspaceTools()` quand le mode est actif.

### Decision 4 : Flow plan/approve/execute via system prompt

**Probleme** : Le LLM doit montrer un plan avant d'executer
**Options** :
  - Option A : Forcer via system prompt "always show a plan first, wait for user approval" → simple / pas garanti
  - Option B : 2 phases IPC separees (plan phase → approve IPC → execute phase) → garanti / complexe
**Choix** : A
**Raison** : Le system prompt guide suffisamment les bons modeles (ceux eligibles YOLO). Une implementation 2 phases ajouterait une complexite IPC significative pour un gain minimal. Le bouton Stop reste le filet de securite.

### Decision 5 : Mode YOLO comme propriete de la conversation

**Probleme** : Ou stocker l'etat YOLO
**Options** :
  - Option A : Colonne `is_yolo` sur table `conversations` (comme `is_arena`) → persiste / simple
  - Option B : State Zustand ephemere → pas de DB / perdu au reload
**Choix** : A
**Raison** : Coherent avec le pattern Arena (`is_arena`). Permet de retrouver le sandbox dir au reopening.

### Decision 6 : Modeles eligibles YOLO

**Probleme** : Quels modeles autoriser en mode autonome
**Choix** : Whitelist basee sur `supportsTools: true` (nouveau champ ModelDefinition) + taille suffisante. Liste initiale permissive :
- Anthropic : Opus 4.6, Sonnet 4.6
- OpenAI : GPT-5.4, GPT-5.3 Codex, GPT-5 Mini
- Google : Gemini 3.1 Pro, Gemini 3 Flash
- Mistral : Magistral Medium, Devstral 2, Mistral Large 3
- xAI : Grok 4.1 Fast Reasoning
- Qwen : Qwen3 Max, Qwen3.5 Plus
- OpenRouter : tous (l'utilisateur sait ce qu'il fait)
- LM Studio / Ollama : tous (l'utilisateur sait ce qu'il fait)

Exclus : Haiku 4.5 (pas de thinking), DeepSeek (tool-use instable), GPT-5 Nano (trop petit), Perplexity (search only, pas de tool-use)

## Structure du projet (nouveaux fichiers)

```
src/main/
  services/
    sandbox.service.ts          # [NEW] Singleton — create/cleanup sandbox dirs, Seatbelt profiles
    process-manager.service.ts  # [NEW] Singleton — track/kill child processes par session
    seatbelt.ts                 # [NEW] Profil SBPL + wrapper sandbox-exec
  llm/
    yolo-tools.ts               # [NEW] buildYoloTools() — bash unrestricted, createFile, readFile, listFiles, openPreview
    yolo-prompt.ts              # [NEW] System prompt YOLO (plan-then-execute)
  ipc/
    sandbox.ipc.ts              # [NEW] 6 handlers (activate, deactivate, stop, getStatus, getProcesses, openPreview)

src/renderer/src/
  stores/
    sandbox.store.ts            # [NEW] State YOLO (isActive, sessionId, sandboxPath, processes)
  components/chat/
    YoloToggle.tsx              # [NEW] Toggle + warning modal
    YoloStatusBar.tsx           # [NEW] Barre status sandbox (path, processes actifs, Stop)
    ProcessList.tsx             # [NEW] Liste des process enfants avec kill individuel

src/main/db/
  schema.ts                     # [MODIFY] +colonne is_yolo, +colonne sandbox_path sur conversations
  queries/
    sandbox.ts                  # [NEW] Queries sandbox sessions (optionnel si on stocke en DB)
```

## Modele de donnees technique

### Table `conversations` (colonnes ajoutees)
```
is_yolo       INTEGER DEFAULT 0  -- mode: boolean
sandbox_path  TEXT               -- chemin du dossier sandbox (null si Normal)
```

### In-memory (pas en DB)
```
ProcessManager.sessions: Map<sessionId, Set<{
  pid: number
  command: string
  type: 'script' | 'server' | 'install'
  startedAt: Date
  port?: number        // si serveur
}>>
```

### Profil Seatbelt SBPL (macOS)
```scheme
(version 1)
(deny default)

;; Lecture systeme minimale
(allow file-read* (subpath "/usr/lib"))
(allow file-read* (subpath "/usr/local/lib"))
(allow file-read* (subpath "/usr/bin"))
(allow file-read* (subpath "/usr/local/bin"))
(allow file-read* (subpath "/bin"))
(allow file-read* (subpath "/sbin"))
(allow file-read* (subpath "/System/Library"))
(allow file-read* (subpath "/Library/Frameworks"))
(allow file-read* (subpath "/opt/homebrew"))

;; Node.js / Python / runtimes
(allow file-read* (subpath "${HOME}/.nvm"))
(allow file-read* (subpath "${HOME}/.pyenv"))
(allow file-read* (subpath "${HOME}/.local"))

;; Sandbox dir — lecture + ecriture
(allow file-read* (subpath "${SANDBOX_DIR}"))
(allow file-write* (subpath "${SANDBOX_DIR}"))

;; Temp
(allow file-read* (subpath "/tmp"))
(allow file-write* (subpath "/tmp"))
(allow file-read* (subpath "/private/tmp"))
(allow file-write* (subpath "/private/tmp"))

;; Process
(allow process-exec*)
(allow process-fork)
(allow signal)

;; Reseau — loopback seulement
(allow network* (local ip "localhost:*"))
(allow network* (remote ip "localhost:*"))
(deny network* (remote ip "*"))

;; Deny tout le reste
(deny file-write* (subpath "/"))
(deny file-read* (subpath "${HOME}") (require-not (subpath "${SANDBOX_DIR}")))
```

## Securite (Security by Design)

### Confinement OS (Seatbelt macOS)

- Profil SBPL compile genere dynamiquement avec `SANDBOX_DIR` substitue
- `sandbox-exec -p "${profile}" /bin/bash -c "${command}"` pour chaque exec
- Tous les sous-process heritent du sandbox automatiquement
- Reseau restreint a loopback (pas d'exfiltration)
- Ecriture restreinte au dossier sandbox + /tmp

### Confinement filesystem (Windows fallback)

- `realpathSync()` + `startsWith(sandboxDir)` sur chaque operation fichier
- PATH minimal (pas de PATH utilisateur complet)
- Env vars nettoyees (pas de HOME, pas de credentials)
- Blocklist reduite (pas de rm -rf /, pas de format, pas de sudo) mais pas de blocklist granulaire (mode YOLO)

### Process lifecycle

- SIGTERM d'abord, SIGKILL apres 3s grace period
- Kill par arbre de process (`process.kill(-pid)` pour tuer le groupe)
- Cleanup au changement de conversation (`conversations:select` → killAll session precedente)
- Cleanup au quit app (`app.on('before-quit')` → killAll global)
- Cleanup au startup (scan /tmp pour les PIDs orphelins du crash precedent)

### Limites d'execution

- Step limit : defaut 50 (configurable dans settings)
- Timeout global : defaut 10 min (configurable)
- Taille fichier cree : max 10 MB par fichier
- Nombre de fichiers : max 500 par session
- Nombre de process simultanes : max 5

### Surface d'attaque & Mitigations

| Point d'entree | Menace | Mitigation |
|-----------------|--------|------------|
| bash tool YOLO | LLM execute du code malicieux | Seatbelt confine au sandbox dir, reseau loopback only |
| createFile tool | Ecriture hors sandbox | realpathSync + startsWith(sandboxDir) |
| startServer tool | Port hijacking | Ports > 3000, loopback only |
| process spawn | Fork bomb | Max 5 process simultanes + timeout |
| npm install | Package malicieux | Confine au sandbox dir, reseau loopback (registry inaccessible sauf allowlist) |
| LLM boucle infinie | Cout tokens + timeout | Step limit + timeout global + bouton Stop |

## Risques architecturaux

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Apple retire sandbox-exec | Faible (Chromium en depend) | Fort | Fallback filesystem, surveiller WWDC |
| LLM genere du code destructeur | Moyenne | Faible (confine) | Seatbelt empêche les degats hors sandbox |
| Process orphelins apres crash | Moyenne | Moyen | Cleanup au startup + PID tracking file |
| npm install sans reseau (loopback) | Haute | Moyen | Allowlist npm registry dans Seatbelt OU npm offline cache |
| Modeles non-YOLO tentes en YOLO | Faible | Faible | Whitelist stricte, toggle desactive |
