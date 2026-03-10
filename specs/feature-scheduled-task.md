# Plan — Scheduled Tasks (Taches Planifiees)

## Contexte

Romain veut pouvoir creer des taches qui executent automatiquement un prompt LLM selon une planification (manuelle, intervalle, quotidienne, hebdomadaire). Chaque execution cree une conversation visible dans la sidebar, comme un envoi normal. L'app doit etre ouverte pour que les taches s'executent (timers Node.js dans le main process).

## Vue d'ensemble

- **Nouvelle table DB** `scheduled_tasks` avec schedule JSON
- **Service `SchedulerService`** dans le main process — gere les timers
- **Fonction `executeTask()`** — extrait du flow `chat.ipc.ts` pour une execution programmatique
- **CRUD IPC** `tasks:*` — pattern identique a `roles:*`
- **Vue `TasksView`** — grille + form inline, NavButton sidebar, ViewMode `'tasks'`
- **Notification Electron** a chaque execution

---

## 1. Database

### 1.1 Table `scheduled_tasks` (schema.ts)

```typescript
export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  prompt: text('prompt').notNull(),
  modelId: text('model_id').notNull(),          // format 'providerId::modelId'
  roleId: text('role_id').references(() => roles.id),
  projectId: text('project_id').references(() => projects.id),
  scheduleType: text('schedule_type', {
    enum: ['manual', 'interval', 'daily', 'weekly']
  }).notNull(),
  scheduleConfig: text('schedule_config', { mode: 'json' })
    .$type<ScheduleConfig>(),                    // params specifiques au type
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  lastRunStatus: text('last_run_status', {
    enum: ['success', 'error']
  }),
  lastRunError: text('last_run_error'),
  lastConversationId: text('last_conversation_id'),
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

**Type `ScheduleConfig`** (union discriminee par `scheduleType`) :
```typescript
type ScheduleConfig =
  | null                                              // manual
  | { value: number; unit: 'seconds' | 'minutes' | 'hours' }  // interval
  | { time: string }                                  // daily — "HH:MM"
  | { days: number[]; time: string }                  // weekly — days 0-6 (dim-sam), "HH:MM"
```

### 1.2 Migration (migrate.ts)

Ajouter `CREATE TABLE IF NOT EXISTS scheduled_tasks (...)` dans le bloc principal de `runMigrations()`.

### 1.3 Relations (relations.ts)

```typescript
export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
  role: one(roles, { fields: [scheduledTasks.roleId], references: [roles.id] }),
  project: one(projects, { fields: [scheduledTasks.projectId], references: [projects.id] }),
}))
```

---

## 2. Backend — Fichiers a creer/modifier

### 2.1 `src/main/db/queries/scheduled-tasks.ts` (nouveau)

Queries CRUD standard :
- `getAllScheduledTasks()` — ORDER BY updatedAt DESC
- `getScheduledTask(id)` — single by ID
- `getEnabledScheduledTasks()` — WHERE isEnabled = true (pour le scheduler au demarrage)
- `createScheduledTask(data)` — nanoid(), new Date(), calcul nextRunAt
- `updateScheduledTask(id, data)` — recalcul nextRunAt si schedule change
- `deleteScheduledTask(id)` — cleanup direct (pas de FK dependantes)
- `updateTaskRunStatus(id, status, error?, conversationId?)` — apres execution
- `incrementRunCount(id)` — atomique

### 2.2 `src/main/services/scheduler.service.ts` (nouveau)

Service singleton, demarre au boot de l'app :

```typescript
class SchedulerService {
  private timers: Map<string, NodeJS.Timeout> = new Map()
  private mainWindow: BrowserWindow | null = null

  init(mainWindow: BrowserWindow): void
  scheduleTask(task: ScheduledTask): void
  unscheduleTask(taskId: string): void
  rescheduleTask(task: ScheduledTask): void    // unschedule + schedule
  executeTask(taskId: string): Promise<void>   // execution immediate (manuelle ou timer)
  scheduleAllEnabled(): void                   // au demarrage
  stopAll(): void                              // au shutdown

  private computeNextRunAt(task): Date | null
  private scheduleNextRun(task): void
  private getDelayMs(task): number             // calcul du delai jusqu'a prochaine execution
}
```

**Logique de planification** :
- `manual` → pas de timer, `nextRunAt = null`
- `interval` → `setInterval(executeTask, value * unitMs)`
- `daily` → `setTimeout` jusqu'a la prochaine occurrence de HH:MM, puis `setInterval(24h)`
- `weekly` → `setTimeout` jusqu'au prochain jour+heure valide, puis recalcul apres chaque execution

**Gestion du daily/weekly** : calculer le delai jusqu'a la prochaine occurrence. Apres execution, recalculer `nextRunAt` et reschedule avec `setTimeout`.

### 2.3 `src/main/services/task-executor.ts` (nouveau)

Fonction extraite du flow chat.ipc.ts pour execution programmatique sans renderer :

```typescript
export async function executeScheduledTask(
  task: ScheduledTask,
  mainWindow: BrowserWindow | null
): Promise<{ conversationId: string; success: boolean; error?: string }>
```

**Flow** :
1. Resoudre `modelId` → `split('::')` → `providerId` + `modelId`
2. Creer conversation via `createConversation(task.name, task.projectId)`
3. Si `task.roleId` → charger le role, extraire systemPrompt
4. Sauvegarder le message user (task.prompt) en DB
5. Renommer la conversation avec le nom de la tache
6. Construire aiMessages[] (system prompt + user message)
7. Charger temperature/maxTokens/topP depuis les settings DB
8. `streamText()` avec le modele
9. Si `mainWindow` existe → forward chunks via `webContents.send('chat:chunk')` avec `conversationId` pour filtrage
10. `await result.text` + `await result.usage`
11. Calculer cout, sauvegarder message assistant
12. `updateConversationModel()` + `updateConversationRole()`
13. `updateTaskRunStatus()` + `incrementRunCount()`
14. Notifier le renderer : `webContents.send('task:executed', { taskId, conversationId })`
15. Notification Electron : `new Notification({ title: 'Tache executee', body: task.name })`

### 2.4 `src/main/ipc/scheduled-tasks.ipc.ts` (nouveau)

```typescript
export function registerScheduledTasksIpc(): void
```

**Handlers** :
- `tasks:list` → `getAllScheduledTasks()`
- `tasks:get` → `getScheduledTask(id)`
- `tasks:create` → Zod validation + `createScheduledTask()` + `scheduler.scheduleTask()`
- `tasks:update` → Zod validation + `updateScheduledTask()` + `scheduler.rescheduleTask()`
- `tasks:delete` → `deleteScheduledTask()` + `scheduler.unscheduleTask()`
- `tasks:execute` → `scheduler.executeTask(id)` (execution manuelle)
- `tasks:toggle` → toggle `isEnabled` + schedule/unschedule

**Zod schemas** :
```typescript
const scheduleConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('interval'), value: z.number().min(1), unit: z.enum(['seconds', 'minutes', 'hours']) }),
  z.object({ type: z.literal('daily'), time: z.string().regex(/^\d{2}:\d{2}$/) }),
  z.object({ type: z.literal('weekly'), days: z.array(z.number().min(0).max(6)).min(1), time: z.string().regex(/^\d{2}:\d{2}$/) }),
])

const createTaskSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  prompt: z.string().min(1).max(50000),
  modelId: z.string().min(1),
  roleId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  scheduleType: z.enum(['manual', 'interval', 'daily', 'weekly']),
  scheduleConfig: scheduleConfigSchema,
})
```

### 2.5 Modifications existantes

| Fichier | Modification |
|---------|-------------|
| `src/main/ipc/index.ts` | Ajouter `registerScheduledTasksIpc()` dans `registerAllIpcHandlers()` |
| `src/main/index.ts` | Apres `registerAllIpcHandlers()`, init `SchedulerService` avec mainWindow |
| `src/main/db/schema.ts` | Ajouter la table `scheduledTasks` |
| `src/main/db/migrate.ts` | Ajouter `CREATE TABLE IF NOT EXISTS scheduled_tasks` |
| `src/main/db/relations.ts` | Ajouter `scheduledTasksRelations` |
| `src/main/db/queries/roles.ts` | Dans `deleteRole()`, ajouter cleanup FK : `set scheduled_tasks.role_id = null WHERE role_id = id` |
| `src/main/db/queries/conversations.ts` | Pas de changement (les conversations creees par les taches sont normales) |

---

## 3. Preload

### 3.1 `src/preload/types.ts` — Nouveaux types

```typescript
export type ScheduleType = 'manual' | 'interval' | 'daily' | 'weekly'

export interface ScheduleConfig {
  // interval
  value?: number
  unit?: 'seconds' | 'minutes' | 'hours'
  // daily + weekly
  time?: string       // "HH:MM"
  // weekly
  days?: number[]     // 0=dimanche, 1=lundi, ..., 6=samedi
}

export interface ScheduledTaskInfo {
  id: string
  name: string
  description: string
  prompt: string
  modelId: string            // "providerId::modelId"
  roleId?: string | null
  projectId?: string | null
  scheduleType: ScheduleType
  scheduleConfig: ScheduleConfig | null
  isEnabled: boolean
  lastRunAt?: Date | null
  nextRunAt?: Date | null
  lastRunStatus?: 'success' | 'error' | null
  lastRunError?: string | null
  lastConversationId?: string | null
  runCount: number
  createdAt: Date
  updatedAt: Date
}
```

### 3.2 `src/preload/index.ts` — Nouvelles methodes

```typescript
// Scheduled Tasks
getScheduledTasks: () => ipcRenderer.invoke('tasks:list'),
getScheduledTask: (id) => ipcRenderer.invoke('tasks:get', id),
createScheduledTask: (data) => ipcRenderer.invoke('tasks:create', data),
updateScheduledTask: (id, data) => ipcRenderer.invoke('tasks:update', id, data),
deleteScheduledTask: (id) => ipcRenderer.invoke('tasks:delete', id),
executeScheduledTask: (id) => ipcRenderer.invoke('tasks:execute', id),
toggleScheduledTask: (id) => ipcRenderer.invoke('tasks:toggle', id),
onTaskExecuted: (cb) => ipcRenderer.on('task:executed', (_, data) => cb(data)),
offTaskExecuted: () => ipcRenderer.removeAllListeners('task:executed'),
```

---

## 4. Renderer — Store

### 4.1 `src/renderer/src/stores/tasks.store.ts` (nouveau)

```typescript
interface TasksState {
  tasks: ScheduledTaskInfo[]
  setTasks: (tasks: ScheduledTaskInfo[]) => void
  addTask: (task: ScheduledTaskInfo) => void
  updateTask: (id: string, updates: Partial<ScheduledTaskInfo>) => void
  removeTask: (id: string) => void
  loadTasks: () => Promise<void>
}
```

Pattern Zustand identique a `roles.store.ts`. Pas de persist (donnees viennent de la DB).

---

## 5. Renderer — Composants

### 5.1 `src/renderer/src/components/tasks/TasksView.tsx` (nouveau)

Pattern identique a `RolesView.tsx` :
- `subView: 'grid' | 'create' | 'edit'`
- Header : titre "Taches planifiees" + bouton "Nouvelle tache"
- Recherche + tri (activite/nom/creation)
- Grille de `TaskCard`
- `TaskForm` inline (remplace la grille)

### 5.2 `src/renderer/src/components/tasks/TaskCard.tsx` (nouveau)

Carte avec :
- **Barre couleur** : bleu (manual), vert (interval actif), orange (daily), violet (weekly)
- **Nom** + description preview
- **Badge schedule** : "Manuel", "Toutes les 5 min", "Chaque jour a 09:00", "Lun, Mer, Ven a 14:30"
- **Badge statut** : dernier run (succes/erreur/jamais)
- **Toggle isEnabled** (switch inline, sans ouvrir le form)
- **Info** : prochaine execution, nombre d'executions, dernier run
- **Hover actions** : Executer maintenant (Play), Modifier, Supprimer
- **Delete confirmation** : overlay inline (pattern ConversationItem)

### 5.3 `src/renderer/src/components/tasks/TaskForm.tsx` (nouveau)

Formulaire inline (pattern ProjectForm/RoleForm) :

**Champs** :
1. **Nom** (required, input text)
2. **Description** (required, textarea)
3. **Prompt** (required, textarea grande — le message envoye au LLM)
4. **Modele** (required, Select groupe par provider — meme pattern que ProjectForm.defaultModelId, TOUS les modeles texte)
5. **Role** (optional, Select — liste des roles existants + "Aucun role")
6. **Projet** (optional, Select — liste des projets + "Aucun projet")
7. **Planification** :
   - **Type** : radio group ou Select — Manuel / Intervalle / Quotidien / Hebdomadaire
   - **Config conditionnelle** selon le type :
     - `manual` → rien
     - `interval` → input nombre + select unite (secondes/minutes/heures)
     - `daily` → input time (HH:MM)
     - `weekly` → checkboxes jours (Lun-Dim) + input time (HH:MM)

**Validation** : `canSave = name.trim() && description.trim() && prompt.trim() && modelId && scheduleValid`
- `scheduleValid` : `manual` → toujours OK, `interval` → value > 0, `daily` → time valide, `weekly` → au moins 1 jour + time

**Layout** : Header (back + titre) + scrollable body + fixed footer (Sauvegarder/Annuler)

---

## 6. Navigation

### 6.1 `src/renderer/src/stores/ui.store.ts`

Ajouter `'tasks'` au type `ViewMode`.

### 6.2 `src/renderer/src/App.tsx`

```tsx
{currentView === 'tasks' && <TasksView />}
```

### 6.3 `src/renderer/src/components/layout/Sidebar.tsx`

Ajouter NavButton :
```tsx
<NavButton icon={Clock} label="Taches" isActive={currentView === 'tasks'} onClick={() => setCurrentView('tasks')} />
```
Icone : `Clock` (Lucide) — entre Roles et Parametres.

### 6.4 `src/renderer/src/components/common/CommandPalette.tsx`

Ajouter action "Taches planifiees" → `setCurrentView('tasks')`.

---

## 7. Streaming et notifications

### 7.1 Filtrage chunks par conversation

**Probleme** : `useStreaming` actuel ne filtre pas par `conversationId`. Si une tache s'execute en arriere-plan pendant que l'user chat, les chunks de la tache polluent le chat actif.

**Solution** : Ajouter `conversationId` dans chaque chunk envoye depuis `task-executor.ts`. Dans `useStreaming`, ignorer les chunks dont le `conversationId` ne correspond pas a `activeConversationId`.

Modification de `useStreaming.ts` :
```typescript
// Dans handleChunk:
if (chunk.conversationId && chunk.conversationId !== activeConversationId) {
  return // ignore chunks d'une autre conversation (tache planifiee en background)
}
```

**Note** : Les chunks envoyes depuis `chat.ipc.ts` (chat normal) n'auront pas de `conversationId` (backward compatible). Seuls les chunks de `task-executor.ts` en auront un.

### 7.2 Event `task:executed`

Quand une tache termine :
- Main envoie `task:executed` via IPC avec `{ taskId, conversationId, success, error? }`
- Le renderer ecoute cet event (dans `useEffect` de App.tsx ou un hook dedie)
- Met a jour le store tasks (lastRunAt, lastRunStatus, runCount)
- Refresh la liste des conversations (sidebar) si le projet actif correspond

### 7.3 Notification Electron

```typescript
import { Notification } from 'electron'
new Notification({
  title: `Tache executee : ${task.name}`,
  body: success ? 'Execution reussie' : `Erreur : ${error}`,
}).show()
```

---

## 8. Sequence d'implementation

### Phase 1 — Backend DB + Queries
1. `schema.ts` — ajouter table `scheduledTasks`
2. `migrate.ts` — ajouter `CREATE TABLE IF NOT EXISTS scheduled_tasks`
3. `relations.ts` — ajouter `scheduledTasksRelations`
4. `queries/scheduled-tasks.ts` — CRUD complet

### Phase 2 — Execution engine
5. `services/task-executor.ts` — fonction `executeScheduledTask()`
6. `services/scheduler.service.ts` — gestion timers + appel executor

### Phase 3 — IPC + Preload
7. `ipc/scheduled-tasks.ipc.ts` — handlers CRUD + execute + toggle
8. `ipc/index.ts` — register
9. `preload/types.ts` — types ScheduledTaskInfo, ScheduleConfig
10. `preload/index.ts` — methodes bridge

### Phase 4 — Main process boot
11. `index.ts` — init SchedulerService apres IPC registration

### Phase 5 — Renderer
12. `stores/tasks.store.ts`
13. `stores/ui.store.ts` — ViewMode 'tasks'
14. `components/tasks/TasksView.tsx` + `TaskCard.tsx` + `TaskForm.tsx`
15. `App.tsx` — routing
16. `Sidebar.tsx` — NavButton
17. `CommandPalette.tsx` — action

### Phase 6 — Streaming fix
18. `useStreaming.ts` — filtrage par conversationId
19. `chat.ipc.ts` — optionnel: ajouter conversationId aux chunks (ou pas, backward compat)

### Phase 7 — FK cleanup
20. `queries/roles.ts` — nullifier `scheduled_tasks.role_id` dans `deleteRole()`

---

## 9. Fichiers concernes — Resume

| Fichier | Action | Complexite |
|---------|--------|------------|
| `src/main/db/schema.ts` | Modifier — ajouter table | Faible |
| `src/main/db/migrate.ts` | Modifier — ajouter CREATE TABLE | Faible |
| `src/main/db/relations.ts` | Modifier — ajouter relations | Faible |
| `src/main/db/queries/scheduled-tasks.ts` | **Creer** — CRUD + helpers | Moyenne |
| `src/main/db/queries/roles.ts` | Modifier — FK cleanup | Faible |
| `src/main/services/task-executor.ts` | **Creer** — flow execution LLM | Haute |
| `src/main/services/scheduler.service.ts` | **Creer** — timers + scheduling | Haute |
| `src/main/ipc/scheduled-tasks.ipc.ts` | **Creer** — 7 handlers | Moyenne |
| `src/main/ipc/index.ts` | Modifier — register | Faible |
| `src/main/index.ts` | Modifier — init scheduler | Faible |
| `src/preload/types.ts` | Modifier — types | Faible |
| `src/preload/index.ts` | Modifier — 9 methodes | Faible |
| `src/renderer/src/stores/tasks.store.ts` | **Creer** | Faible |
| `src/renderer/src/stores/ui.store.ts` | Modifier — ViewMode | Faible |
| `src/renderer/src/components/tasks/TasksView.tsx` | **Creer** | Moyenne |
| `src/renderer/src/components/tasks/TaskCard.tsx` | **Creer** | Moyenne |
| `src/renderer/src/components/tasks/TaskForm.tsx` | **Creer** — form conditionnel schedule | Haute |
| `src/renderer/src/App.tsx` | Modifier — routing | Faible |
| `src/renderer/src/components/layout/Sidebar.tsx` | Modifier — NavButton | Faible |
| `src/renderer/src/components/common/CommandPalette.tsx` | Modifier — action | Faible |
| `src/renderer/src/hooks/useStreaming.ts` | Modifier — filtrage conversationId | Faible |

**Total** : 7 fichiers a creer, 14 fichiers a modifier.

---

## 10. Verification

1. **CRUD** : Creer/modifier/supprimer une tache dans TasksView → verifier persistence DB
2. **Execution manuelle** : Cliquer "Executer" sur une tache manuelle → conversation creee dans la sidebar avec reponse LLM
3. **Planification interval** : Creer une tache "toutes les 30 secondes" → verifier qu'elle s'execute automatiquement
4. **Planification daily** : Creer une tache daily proche de l'heure actuelle → verifier execution
5. **Toggle** : Desactiver une tache active → verifier que le timer est arrete
6. **Streaming** : Pendant qu'une tache s'execute en background, chatter normalement → les chunks ne doivent pas se melanger
7. **Notification** : Verifier que la notification Electron apparait apres execution
8. **Role** : Tache avec role → verifier que le system prompt est applique
9. **Projet** : Tache avec projet → la conversation creee a le bon projectId, visible dans le bon filtre sidebar
10. **Restart app** : Redemarrer → les taches enabled doivent se re-scheduler automatiquement
11. **Delete role/projet** : Supprimer un role/projet utilise par une tache → FK mis a null, tache reste fonctionnelle
