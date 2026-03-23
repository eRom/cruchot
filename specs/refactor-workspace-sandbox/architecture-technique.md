# Architecture Technique — refactor-workspace-sandbox

**Date** : 2026-03-23
**Statut** : Decide
**Contexte** : brainstorming.md, architecture-fonctionnelle.md

## Probleme architectural

L'app a 3 chemins pour les tools fichiers (workspace via projet, workspace manuel, sandbox YOLO) avec 2 jeux de tools differents et une feature Git couplee au workspace. Refactorer en un seul concept : un dossier de travail par conversation, un seul jeu de tools, suppression de Git et du mode YOLO.

## Flux principal

```
Conversation creee → workspace_path = projet.defaultWorkspacePath OU ~/.cruchot/sandbox/
                          ↓
Utilisateur envoie un message → chat.ipc.ts
                          ↓
                    Charge conversation.workspace_path
                          ↓
                    buildTools(workspacePath) → 4 tools (bash, readFile, writeFile, listFiles)
                          ↓
                    execSandboxed(command, workspacePath) via Seatbelt
                          ↓
                    streamText() avec tools + MCP tools
```

## Decisions architecturales

### Decision 1 : Un seul jeu de tools (fusion workspace + yolo)
**Probleme** : Aujourd'hui 2 fichiers avec des tools similaires mais des logiques de securite differentes.
**Options** :
  - A : Garder 2 fichiers, router dynamiquement → complexite, duplication
  - B : Fusionner en un seul fichier `conversation-tools.ts` → simplicite, un seul point de maintenance
**Choix** : B — Un seul fichier `conversation-tools.ts`
**Raison** : La securite est deja geree par Seatbelt (OS-level). Plus besoin de blocklist applicative. Les tools sont identiques a la logique de confinement pres.

### Decision 2 : workspace_path NOT NULL sur conversations
**Probleme** : Ou stocker le dossier de travail ? Comment gerer "pas de dossier choisi" ?
**Options** :
  - A : Nullable, et construire les tools seulement si non-null → retour au mode "sans tools"
  - B : NOT NULL avec defaut `~/.cruchot/sandbox/` → tools toujours dispo
**Choix** : B — NOT NULL avec defaut
**Raison** : Decision du brainstorm : toute conversation a toujours des tools. Le dossier par defaut est le sandbox partage.

### Decision 3 : Seatbelt pour tous (pas seulement YOLO)
**Probleme** : Avant, Seatbelt etait reserve au mode YOLO. Le workspace normal utilisait une blocklist bash.
**Options** :
  - A : Seatbelt partout → securite OS uniforme
  - B : Seatbelt seulement si dossier non-sandbox → complexite, 2 modeles de securite
**Choix** : A — Seatbelt partout
**Raison** : Un seul modele de securite. Le bash est libre, la securite est au niveau OS. Plus simple a raisonner.

### Decision 4 : Suppression de Git — clean delete
**Probleme** : Git est integre dans WorkspacePanel, preload, stores, services, IPC. 12 fichiers impactes.
**Options** :
  - A : Desactiver (feature flag) → code mort, complexite residuelle
  - B : Supprimer completement → clean, mais irreversible
**Choix** : B — Suppression complete
**Raison** : Decision explicite de Romain. Le code est dans git history si besoin un jour.

### Decision 5 : Heritage du dossier projet → conversation
**Probleme** : Comment transmettre le `defaultWorkspacePath` du projet a la conversation ?
**Options** :
  - A : A la creation de la conversation (copie du path) → simple, immutable apres creation
  - B : Dynamique (la conversation lit toujours le projet) → couplage, complexite
**Choix** : A — Copie a la creation
**Raison** : Le dossier est une propriete de la conversation, pas du projet. Changer le defaultWorkspacePath du projet n'affecte pas les conversations existantes.

### Decision 6 : Correction du chemin sandbox
**Probleme** : Le code actuel utilise `~/cruchot/sandbox/` (sans point). Convention Unix : dossiers de config/data caches commencent par un point.
**Choix** : `~/.cruchot/sandbox/`
**Raison** : Coherence avec `~/.config`, `~/.cache`, etc. Le dossier n'a pas besoin d'etre visible dans le Finder.

## Structure du projet (fichiers impactes)

```
src/main/
  llm/
    conversation-tools.ts    [NEW] ← fusion de workspace-tools.ts + yolo-tools.ts
    workspace-tools.ts       [DELETE]
    yolo-tools.ts            [DELETE]
    yolo-prompt.ts           [DELETE]
  services/
    git.service.ts           [DELETE]
    sandbox.service.ts       [DELETE]
    process-manager.service.ts [DELETE]
    seatbelt.ts              [KEEP] ← confine au workspace_path
    workspace.service.ts     [MODIFY] ← simplifie
  ipc/
    git.ipc.ts               [DELETE]
    sandbox.ipc.ts           [DELETE]
    chat.ipc.ts              [MODIFY] ← un seul chemin tools
    workspace.ipc.ts         [MODIFY] ← simplifie
    conversations.ipc.ts     [MODIFY] ← workspace_path a la creation
    index.ts                 [MODIFY] ← retirer git + sandbox
  db/
    schema.ts                [MODIFY] ← workspace_path, retirer is_yolo/sandbox_path
    migrate.ts               [MODIFY] ← migration + cleanup
    queries/
      conversations.ts       [MODIFY] ← retirer yolo, ajouter workspace_path

src/preload/
  index.ts                   [MODIFY] ← retirer git (8 methodes) + sandbox (6 methodes)
  types.ts                   [MODIFY] ← retirer types git + sandbox + supportsYolo

src/renderer/src/
  stores/
    git.store.ts             [DELETE]
    sandbox.store.ts         [DELETE]
    workspace.store.ts       [MODIFY] ← pilote par conversation.workspace_path
    providers.store.ts       [MODIFY] ← retirer supportsYolo
  components/
    workspace/
      ChangesPanel.tsx       [DELETE]
      DiffView.tsx           [DELETE]
      GitBranchBadge.tsx     [DELETE]
      WorkspacePanel.tsx     [MODIFY] ← retirer onglet Git
      FileTree.tsx           [MODIFY] ← retirer decorations Git
    chat/
      YoloToggle.tsx         [DELETE]
      YoloStatusBar.tsx      [DELETE]
      ChatView.tsx           [MODIFY] ← retirer YOLO
      InputZone.tsx          [MODIFY] ← workspace_path
      right-panel/
        OptionsSection.tsx   [MODIFY] ← selecteur dossier, retirer YoloToggle
```

## Modele de donnees technique

### Table `conversations` (modifiee)
```
conversations
  id              TEXT PK
  title           TEXT
  project_id      TEXT FK → projects.id
  workspace_path  TEXT NOT NULL DEFAULT '~/.cruchot/sandbox/'   [NEW]
  -- is_yolo      SUPPRIME
  -- sandbox_path SUPPRIME
  is_favorite     INTEGER DEFAULT 0
  is_arena        INTEGER DEFAULT 0
  created_at      INTEGER
  updated_at      INTEGER
```

### Table `projects` (modifiee)
```
projects
  id                      TEXT PK
  name                    TEXT
  description             TEXT
  system_prompt           TEXT
  default_model_id        TEXT
  color                   TEXT
  default_workspace_path  TEXT          [RENAME from workspace_path]
  created_at              INTEGER
  updated_at              INTEGER
```

### Migration SQL
```sql
-- 1. Ajouter workspace_path sur conversations
ALTER TABLE conversations ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '~/.cruchot/sandbox/';

-- 2. Migrer les donnees : conversations existantes heritent du workspace_path de leur projet
UPDATE conversations SET workspace_path = (
  SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id
) WHERE project_id IS NOT NULL AND (
  SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id
) IS NOT NULL;

-- 3. Renommer workspace_path en default_workspace_path sur projects
-- (SQLite ne supporte pas RENAME COLUMN avant 3.25 — on laisse le nom tel quel en DB
--  mais on l'expose comme defaultWorkspacePath dans le code Drizzle)

-- 4. Supprimer l'index YOLO (devenu inutile)
DROP INDEX IF EXISTS idx_conversations_is_yolo;

-- 5. Creer le dossier ~/.cruchot/sandbox/ au demarrage si inexistant
```

## Securite (Security by Design)

### Confinement Seatbelt
- Profil SBPL genere dynamiquement avec `SANDBOX_DIR = conversation.workspace_path`
- `(allow file-read* file-write* (subpath SANDBOX_DIR))` + `(deny file-read* file-write* (subpath "/"))`
- `(allow network*)` — reseau autorise (decision brainstorm)
- Fichier temp `/tmp/cruchot-sb-[UUID].sb`, cleanup en `finally`
- Fallback sans sandbox sur Windows/Linux (execution directe)

### Validation des chemins
- `realpathSync()` avant `startsWith(workspacePath + path.sep)` sur toutes les operations fichiers
- Dossiers bloques : `/`, `/System`, `/usr`, `/etc`, `/Library`, etc. (liste existante dans workspace.ipc.ts)
- Creation auto de `~/.cruchot/sandbox/` avec `mkdirSync({ recursive: true })`

### Tools unifies
- Bash : libre (pas de blocklist), confine par Seatbelt, timeout 30s, output max 100KB
- readFile : whitelist extensions (~80), max 5MB, realpathSync
- writeFile : max 5MB, realpathSync, creation auto des parents
- listFiles : max 500 entrees, confine au workspace_path

## Risques architecturaux

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| LLM casse des fichiers dans un vrai repo | Moyenne | Haut | Seatbelt + regles prompt. Git (externe) pour backup. |
| Conversations partagent ~/.cruchot/sandbox/ | Faible | Faible | Mono-utilisateur. Cleanup manuel si besoin. |
| Seatbelt indisponible (Windows/Linux) | Certaine | Moyen | Fallback execution directe. Documenter le risque. |
| Migration DB echoue sur conversations existantes | Faible | Moyen | Transaction, DEFAULT safe, test sur copie DB. |
| Code mort oublie apres suppression Git/YOLO | Faible | Faible | Typecheck strict detecte les imports morts. |
