# Team — refactor-workspace-sandbox

**Date** : 2026-03-23
**Verdict** : OUI PARTIEL — 2 agents paralleles (vague 1) + orchestrateur sequentiel (vagues 2-4)

## Prerequis

- Branche `refactor-workspace-sandbox` creee depuis `main`
- `npm install` fait (ou symlink node_modules)
- Specs lues : `specs/refactor-workspace-sandbox/tasks.md`

## Commandes de lancement

```bash
# Option A : 2 agents en worktrees paralleles (vague 1)
# Puis orchestrateur sequentiel (vagues 2-4)

# Option B : tout sequentiel (plus simple, moins de risque de conflit)
```

---

## Prompt d'orchestration

### Vague 1 — Suppressions paralleles

**Agent `backend-cleanup`** (worktree) :

Contexte : Refactoring de l'app Electron Cruchot. On simplifie l'architecture workspace/sandbox.

Taches :
1. **T01 — Supprimer Git (backend)** :
   - DELETE `src/main/services/git.service.ts`
   - DELETE `src/main/ipc/git.ipc.ts`
   - MODIFY `src/main/ipc/index.ts` : retirer import + appel `registerGitIpc()`
   - MODIFY `src/main/ipc/workspace.ipc.ts` : retirer imports `onWorkspaceFileChanged`, `resetGitService` de git.ipc, retirer les appels a ces fonctions

2. **T03 — Supprimer YOLO/Sandbox (backend)** :
   - DELETE `src/main/services/sandbox.service.ts`
   - DELETE `src/main/services/process-manager.service.ts`
   - DELETE `src/main/ipc/sandbox.ipc.ts`
   - DELETE `src/main/llm/yolo-tools.ts`
   - DELETE `src/main/llm/yolo-prompt.ts`
   - MODIFY `src/main/ipc/index.ts` : retirer import + appel `registerSandboxIpc()`
   - MODIFY `src/main/ipc/chat.ipc.ts` : retirer imports (buildYoloTools, buildYoloSystemPrompt, sandboxService), retirer variables isYolo/sandboxDir, retirer les blocs conditionnels YOLO dans le system prompt et les tools. **NE PAS** toucher a la logique workspace existante (elle sera refactoree en vague 2)
   - MODIFY `src/main/index.ts` : retirer le bloc cleanup YOLO orphelins (getYoloConversations + setConversationYolo), retirer processManagerService.killGlobal() du will-quit
   - MODIFY `src/main/llm/registry.ts` : retirer `supportsYolo: true/false` de TOUTES les definitions de modeles
   - MODIFY `src/main/llm/types.ts` : retirer `supportsYolo` de l'interface ModelDefinition
   - MODIFY `src/main/ipc/providers.ipc.ts` : retirer `supportsYolo` des modeles custom
   - MODIFY `src/main/db/schema.ts` : retirer `isYolo` et `sandboxPath` de la table conversations
   - MODIFY `src/main/db/queries/conversations.ts` : retirer `setConversationYolo()`, `getYoloConversations()`, `isYolo: false`/`sandboxPath: null` dans forkConversation()

IMPORTANT : NE PAS supprimer `src/main/services/seatbelt.ts` — il sera reutilise.
IMPORTANT : NE PAS modifier le schema `projects` (fait en vague 2).
Utiliser `trash` au lieu de `rm` pour supprimer les fichiers.

---

**Agent `frontend-cleanup`** (worktree) :

Contexte : Refactoring de l'app Electron Cruchot. On simplifie l'architecture workspace/sandbox.

Taches :
1. **T02 — Supprimer Git (frontend)** :
   - DELETE `src/renderer/src/stores/git.store.ts`
   - DELETE `src/renderer/src/components/workspace/ChangesPanel.tsx`
   - DELETE `src/renderer/src/components/workspace/DiffView.tsx`
   - DELETE `src/renderer/src/components/workspace/GitBranchBadge.tsx`
   - MODIFY `src/renderer/src/components/workspace/WorkspacePanel.tsx` : retirer tout import git (git.store, ChangesPanel, GitBranchBadge), retirer l'onglet "Changes", garder uniquement l'onglet Files
   - MODIFY `src/renderer/src/components/workspace/FileTree.tsx` : retirer les imports de git.store, retirer les decorations de status git (couleurs, indicateurs M/A/D/R/?)

2. **T04 — Supprimer YOLO/Sandbox (frontend)** :
   - DELETE `src/renderer/src/stores/sandbox.store.ts`
   - DELETE `src/renderer/src/components/chat/YoloToggle.tsx`
   - DELETE `src/renderer/src/components/chat/YoloStatusBar.tsx`
   - MODIFY `src/renderer/src/components/chat/ChatView.tsx` : retirer import sandbox.store, retirer import/rendu YoloStatusBar
   - MODIFY `src/renderer/src/components/chat/right-panel/OptionsSection.tsx` : retirer import YoloToggle, retirer le composant du JSX
   - MODIFY `src/renderer/src/stores/providers.store.ts` : retirer `supportsYolo` de l'interface et des usages

Utiliser `trash` au lieu de `rm` pour supprimer les fichiers.

---

### Sync Point — Merge Vague 1

Apres completion des 2 agents :
1. Merge les 2 worktrees dans la branche principale
2. Resoudre les conflits (ipc/index.ts probablement trivial)
3. Verifier la compilation : `npx tsc --noEmit` sur main et renderer
4. Corriger les erreurs de type eventuelles

---

### Vagues 2-4 — Orchestrateur sequentiel

L'orchestrateur execute les taches T05 → T06 → T10 → T07 → T08 → T09 → T11 → T12 dans cet ordre. Voir `tasks.md` pour le detail de chaque tache.

Ordre optimise :
1. T05 (Migration DB) — prerequis pour tout le reste
2. T06 (Tools unifies) — cree conversation-tools.ts
3. T10 (Preload cleanup) — nettoie les methodes mortes
4. T07 (Chat.ipc.ts) — refactore le handler principal
5. T08 (Selecteur dossier) — UI dans OptionsSection
6. T09 (WorkspacePanel) — pilote par conversation
7. T11 (Heritage projet) — polish
8. T12 (Code mort) — validation finale

---

## Annexe — Detail des taches

### T05 — Migration DB
- `schema.ts` : ajouter `workspacePath: text('workspace_path').notNull().default('~/.cruchot/sandbox/')` sur conversations
- `schema.ts` : renommer `workspacePath` en `defaultWorkspacePath` sur projects (garder le nom de colonne DB `workspace_path`, changer seulement l'alias Drizzle)
- `migrate.ts` : `ALTER TABLE conversations ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '~/.cruchot/sandbox/'`
- `migrate.ts` : `UPDATE conversations SET workspace_path = (SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id) WHERE project_id IS NOT NULL AND (SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id) IS NOT NULL`
- `migrate.ts` : `DROP INDEX IF EXISTS idx_conversations_is_yolo`
- `migrate.ts` : retirer les ALTER TABLE pour is_yolo et sandbox_path (colonnes mortes — laissees en DB, ignorees par Drizzle)
- `index.ts` : `fs.mkdirSync(path.join(os.homedir(), '.cruchot', 'sandbox'), { recursive: true })` au demarrage

### T06 — Tools unifies
- Creer `src/main/llm/conversation-tools.ts`
- Exporter `buildConversationTools(workspacePath: string)` : retourne 4 tools AI SDK v6
- Exporter `buildWorkspaceContextBlock(workspacePath: string)` (deplace depuis workspace-tools.ts)
- bash : execSandboxed() via seatbelt.ts, pas de blocklist, timeout 30s, output 100KB
- readFile : whitelist ~80 extensions, 5MB max, realpathSync + startsWith
- writeFile : 5MB max, realpathSync + startsWith, mkdirSync parents
- listFiles : 500 max, realpathSync + startsWith
- Supprimer workspace-tools.ts

### T07 — Chat.ipc.ts refactor
- Retirer `hasWorkspace` du schema Zod et du payload
- Charger `conversation.workspacePath` depuis la DB
- Appeler `buildConversationTools(workspacePath)` systematiquement
- Appeler `buildWorkspaceContextBlock(workspacePath)` systematiquement
- Retirer toute logique conditionnelle workspace/yolo
- Merger avec MCP tools comme avant

### T08 — Selecteur dossier
- OptionsSection : icone FolderOpen + path affiche (tronque) + bouton reset
- Dialog natif via `window.api.showOpenDialog({ properties: ['openDirectory'] })`
- IPC `conversations:setWorkspacePath` (Zod: `{ id: string, workspacePath: string }`)
- Validation cote main : dossiers bloques rejetes (liste existante dans workspace.ipc.ts)
- Preload : `conversationSetWorkspacePath(id: string, path: string)`

### T09 — WorkspacePanel pilote par conversation
- ChatView : quand la conversation change, sync workspace.store.rootPath depuis conversation.workspacePath
- WorkspacePanel : affiche l'arbre de rootPath (deja le cas)
- workspace.store : retirer toute logique de "workspace ouvert manuellement" — le rootPath vient toujours de la conversation
- Creer le dossier si inexistant (mkdirSync recursive)

### T11 — Heritage projet
- createConversation(title, projectId) : si projectId, charger le projet, lire defaultWorkspacePath
- Si non-null → copier dans conversation.workspace_path
- Sinon → garder le defaut ~/.cruchot/sandbox/

### T12 — Code mort
- Grep global pour references residuelles
- Supprimer tout ce qui reste
- Typecheck final
