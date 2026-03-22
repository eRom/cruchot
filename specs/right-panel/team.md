# Team Orchestration — Right Panel

> **Date** : 2026-03-22
> **Genere depuis** : TEAM-ANALYSIS.md

## Lancement

### Prerequis
- Branche de travail creee depuis main
- `npm install` OK, `npm run typecheck` passe sur main

### Commandes
```bash
# Lancer Claude Code avec ce prompt
cat specs/right-panel/team.md | claude --model opus
```

---

## Instructions d'orchestration

Tu es le **leader** d'une agent team. Tu dois orchestrer **2 agents** (toi + 1 agent worktree) pour realiser **11 taches** du projet **Right Panel**.

### Contexte projet
App desktop Electron multi-LLM nommee Cruchot. L'InputZone (1336 lignes) concentre 12+ controles dans sa toolbar. On deplace ces controles vers un Right Panel compose de 4 sections. Le Right Panel et le WorkspacePanel sont mutuellement exclusifs. **Aucune modification backend/DB** — tout est frontend (stores + composants React).

### Stack technique
- Electron 35 + React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + Zustand
- Stores dans `src/renderer/src/stores/`, composants dans `src/renderer/src/components/`
- Imports stores depuis composants chat : `../../../preload/types` (3 `../`), composants chat : `@/stores/...`, `@/components/...`, `@/hooks/...`
- `hotkeys-js` pour les raccourcis clavier
- `lucide-react` pour les icones
- Typecheck : `npx tsc --noEmit -p src/renderer/tsconfig.json`

### Regles d'orchestration
1. Tu es le leader. Tu codes les taches des Vagues 1, 3, 4, 5.
2. Tu spawn un agent en worktree pour la Vague 2 (4 sections).
3. Les fichiers de la Vague 2 sont 100% nouveaux — zero risque de conflit.
4. Tu respectes le sequencage par vagues — ne lance pas une vague avant que la precedente soit terminee.
5. Aux points de synchronisation, tu valides par typecheck avant de continuer.
6. Si un agent echoue, tu diagnostiques et relances.
7. Utilise `trash` au lieu de `rm` pour supprimer des fichiers.

---

### Etape 1 : Creer la branche

```bash
git checkout -b feature-right-panel main
```

---

### Etape 2 : Vague 1 — Fondations (toi)

Execute ces 3 taches sequentiellement. Typecheck apres chaque tache.

#### T01 — ui.store + workspace.store

**But** : Creer le state `openPanel` dans ui.store pour gerer l'exclusivite mutuelle right panel / workspace.

**Fichier 1** : `src/renderer/src/stores/ui.store.ts` [MODIFY]

Contenu actuel :
```typescript
import { create } from 'zustand'

export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'prompts' | 'roles' | 'tasks' | 'mcp' | 'memory' | 'commands' | 'libraries' | 'arena' | 'brigade'

export type SettingsTab = 'general' | 'appearance' | 'apikeys' | 'model' | 'audio' | 'keybindings' | 'data' | 'backup' | 'remote' | 'summary' | 'privacy'

interface UiState {
  currentView: ViewMode
  isStreaming: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean
  settingsTab: SettingsTab | null

  setCurrentView: (view: ViewMode) => void
  setIsStreaming: (streaming: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setSettingsTab: (tab: SettingsTab | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentView: 'chat',
  isStreaming: false,
  commandPaletteOpen: false,
  searchOpen: false,
  settingsTab: null,

  setCurrentView: (view) => set({ currentView: view }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab })
}))
```

Modifications :
- Ajouter `openPanel: 'workspace' | 'right' | null` dans UiState (valeur initiale `null`)
- Ajouter `toggleRightPanel: () => void` — si `openPanel === 'right'` → `null`, sinon → `'right'`
- Ajouter `setOpenPanel: (panel: 'workspace' | 'right' | null) => void`

**Fichier 2** : `src/renderer/src/stores/workspace.store.ts` [MODIFY]

Contenu actuel du `isPanelOpen` et `togglePanel` :
```typescript
isPanelOpen: false,
// ...
togglePanel: () => {
  set((s) => ({ isPanelOpen: !s.isPanelOpen }))
},
setIsPanelOpen: (open) => {
  set({ isPanelOpen: open })
},
```

Modifications :
- `isPanelOpen` : transformer en getter qui lit `useUiStore.getState().openPanel === 'workspace'`
  - ATTENTION : Zustand ne supporte pas les getters natifs. L'approche correcte est de **garder `isPanelOpen` comme un champ normal** mais de changer `togglePanel()` et `setIsPanelOpen()` pour qu'ils delegent a `ui.store.setOpenPanel()`.
  - `togglePanel()` : `const openPanel = useUiStore.getState().openPanel; useUiStore.getState().setOpenPanel(openPanel === 'workspace' ? null : 'workspace')`
  - `setIsPanelOpen(open)` : `useUiStore.getState().setOpenPanel(open ? 'workspace' : null)`
  - Partout ou `closeWorkspace()` fait `set({ isPanelOpen: false })`, remplacer par `useUiStore.getState().setOpenPanel(null)`
  - Supprimer `isPanelOpen` du state initial (pas besoin, on le garde uniquement si d'autres composants le lisent via `useWorkspaceStore(s => s.isPanelOpen)` — dans ce cas, synchroniser via un subscribe ou garder le champ et le mettre a jour dans togglePanel/setIsPanelOpen)

  **Approche recommandee (plus simple)** : garder `isPanelOpen` dans workspace.store en parallele, mais faire en sorte que `togglePanel()` et `setIsPanelOpen()` mettent a jour les DEUX stores. Ainsi la retro-compatibilite est assuree pour tous les composants qui lisent `isPanelOpen`.

**Criteres d'acceptation** :
- `openPanel` gere 3 etats : `'workspace'`, `'right'`, `null`
- `toggleRightPanel()` : si `openPanel === 'right'` → `null`, sinon → `'right'`
- Ouvrir le workspace ferme le right panel et vice versa
- `workspace.store.togglePanel()` et `setIsPanelOpen()` delegent a ui.store
- Typecheck passe : `npx tsc --noEmit -p src/renderer/tsconfig.json`

#### T02 — CollapsibleSection.tsx

**But** : Wrapper generique pour les sections collapsables du Right Panel.

**Fichier** : `src/renderer/src/components/chat/right-panel/CollapsibleSection.tsx` [NEW]

Creer le dossier `right-panel/` s'il n'existe pas.

```typescript
import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, icon: Icon, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 p-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{title}</span>
        {isOpen ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
```

**Criteres d'acceptation** :
- Props : `title`, `icon` (LucideIcon), `defaultOpen?` (default true), `children`
- Header cliquable avec titre, icone, chevron
- Toggle via useState local
- Style : texte muted, espacement, separator border-b
- Typecheck passe

#### T10 — useKeyboardShortcuts.ts

**But** : Ajouter le raccourci OPT+CMD+B pour toggle le Right Panel.

**Fichier** : `src/renderer/src/hooks/useKeyboardShortcuts.ts` [MODIFY]

Contenu actuel :
```typescript
import { useEffect } from 'react'
import hotkeys from 'hotkeys-js'

export interface KeyboardShortcutCallbacks {
  onNewConversation?: () => void
  onCommandPalette?: () => void
  onSettings?: () => void
  onModelList?: () => void
  onToggleWorkspace?: () => void
  onEscape?: () => void
}

export function useKeyboardShortcuts(callbacks: KeyboardShortcutCallbacks) {
  useEffect(() => {
    hotkeys.filter = () => true
    const bindings: Array<[string, () => void]> = []

    if (callbacks.onNewConversation) {
      bindings.push(['command+n,ctrl+n', callbacks.onNewConversation])
    }
    if (callbacks.onCommandPalette) {
      bindings.push(['command+k,ctrl+k', callbacks.onCommandPalette])
    }
    if (callbacks.onModelList) {
      bindings.push(['command+m,ctrl+m', callbacks.onModelList])
    }
    if (callbacks.onToggleWorkspace) {
      bindings.push(['command+b,ctrl+b', callbacks.onToggleWorkspace])
    }
    if (callbacks.onEscape) {
      bindings.push(['escape', callbacks.onEscape])
    }

    for (const [keys, handler] of bindings) {
      hotkeys(keys, (event) => {
        event.preventDefault()
        handler()
      })
    }

    // Cmd+, — native listener (hotkeys-js can't handle comma)
    const settingsHandler = callbacks.onSettings
    function handleSettingsKey(e: KeyboardEvent) {
      if (e.key === ',' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        settingsHandler?.()
      }
    }
    if (settingsHandler) {
      document.addEventListener('keydown', handleSettingsKey)
    }

    return () => {
      for (const [keys] of bindings) {
        hotkeys.unbind(keys)
      }
      document.removeEventListener('keydown', handleSettingsKey)
    }
  }, [/* deps */])
}
```

Modifications :
- Ajouter `onToggleRightPanel?: () => void` dans `KeyboardShortcutCallbacks`
- Ajouter un listener natif `keydown` (meme pattern que CMD+,) pour OPT+CMD+B :
  ```typescript
  const rightPanelHandler = callbacks.onToggleRightPanel
  function handleRightPanelKey(e: KeyboardEvent) {
    if (e.key === 'b' && e.metaKey && e.altKey && !e.ctrlKey) {
      e.preventDefault()
      rightPanelHandler?.()
    }
  }
  if (rightPanelHandler) {
    document.addEventListener('keydown', handleRightPanelKey)
  }
  ```
  Utiliser un listener natif plutot que hotkeys-js car `option+command+b` peut etre capricieux avec hotkeys-js. Cleanup dans le return.
- Ajouter `callbacks.onToggleRightPanel` dans le tableau de deps du useEffect
- NE PAS toucher au binding `command+b` existant (CMD+B = toggle workspace)

**Criteres d'acceptation** :
- OPT+CMD+B toggle le right panel
- CMD+B reste inchange
- Les deux raccourcis coexistent
- Typecheck passe

**Apres T01 + T02 + T10** : commit "feat: right panel foundations — store openPanel + CollapsibleSection + OPT+CMD+B shortcut"

---

### Etape 3 : Vague 2 — 4 Sections (agent en worktree)

Spawn un agent en worktree isole. L'agent cree 4 fichiers NEW dans `src/renderer/src/components/chat/right-panel/`. Zero conflit possible.

**IMPORTANT** : L'agent doit d'abord appliquer les changements de la Vague 1 (T01/T02/T10) dans son worktree avant de commencer ses taches, car les sections dependent de `CollapsibleSection.tsx` et du store `openPanel`. Soit :
- Option A : cherry-pick le commit de la Vague 1 dans le worktree
- Option B : l'agent travaille sur la meme branche `feature-right-panel` qui contient deja le commit

**Approche recommandee** : Lancer l'agent avec `isolation: "worktree"` APRES avoir commit la Vague 1 sur la branche `feature-right-panel`. Le worktree sera cree depuis le HEAD de cette branche et contiendra les fondations.

Prompt de l'agent :

---

Tu es **agent-sections**. Tu crees les 4 sections du Right Panel de Cruchot (app Electron multi-LLM desktop).

**TON PERIMETRE** : `src/renderer/src/components/chat/right-panel/` uniquement — 4 fichiers NEW.

**STACK** : React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui + Zustand + lucide-react.

**IMPORTS** :
- Stores : `import { useXxxStore } from '@/stores/xxx.store'`
- Composants chat : `import { Xxx } from '@/components/chat/Xxx'`
- Composants ui (shadcn) : `import { Button } from '@/components/ui/button'`, `import { Switch } from '@/components/ui/switch'`, `import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'`
- Hooks : `import { useContextWindow } from '@/hooks/useContextWindow'`
- Preload types : `import type { ... } from '../../../../preload/types'`
- CollapsibleSection (deja cree) : `import { CollapsibleSection } from './CollapsibleSection'`

**REGLES** :
- Ne modifie JAMAIS de fichiers en dehors de `components/chat/right-panel/`
- Typecheck apres chaque fichier : `npx tsc --noEmit -p src/renderer/tsconfig.json`
- Si le typecheck echoue, corrige avant de passer au fichier suivant
- Style : Tailwind CSS classes, pas de CSS inline (sauf style={{}} pour des valeurs dynamiques)
- Composants fonctionnels, pas de classes
- Pas de useEffect pour le data fetching — appels IPC dans des event handlers

---

#### T03 — ParamsSection.tsx [NEW]

**But** : Section non collapsable avec les parametres principaux du chat.

**Fichier** : `src/renderer/src/components/chat/right-panel/ParamsSection.tsx`

La section n'est PAS wrappee dans CollapsibleSection. Elle a son propre header simple.

**Composants a importer et rendre (layout vertical, chacun sur sa propre ligne)** :
1. `<ModelSelector disabled={isBusy} />` — depuis `@/components/chat/ModelSelector`
2. `<ChatOptionsMenu disabled={isBusy} supportsThinking={selectedModel?.supportsThinking} />` — depuis `@/components/chat/ChatOptionsMenu`
3. `<RoleSelector disabled={isBusy || isRoleLocked} />` — depuis `@/components/roles/RoleSelector`
4. Toggle Web Search — `<Switch>` shadcn avec label "Recherche Web", bind a `useSettingsStore(s => s.searchEnabled)` / `useSettingsStore(s => s.setSearchEnabled)`

**Info tokens/cout** en bas :
```typescript
import { useContextWindow } from '@/hooks/useContextWindow'
import { useMessagesStore } from '@/stores/messages.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'

// Dans le composant :
const messages = useMessagesStore((s) => s.messages)
const activeConversationId = useConversationsStore((s) => s.activeConversationId)
const { selectedModelId, selectedProviderId, models } = useProvidersStore()
const isStreaming = useUiStore((s) => s.isStreaming)

const conversationMessages = useMemo(
  () => messages.filter((m) => m.conversationId === activeConversationId),
  [messages, activeConversationId]
)
const selectedModel = useMemo(
  () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
  [models, selectedModelId, selectedProviderId]
)
const { currentTokens, maxTokens } = useContextWindow(
  conversationMessages,
  '', // pas de content draft dans le panel
  selectedModel?.contextWindow ?? 0
)
const totalCost = useMemo(
  () => conversationMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0),
  [conversationMessages]
)
```

Affichage tokens : `text-[11px] tabular-nums text-muted-foreground/60`
```
~{formatTokens(currentTokens)} / {formatTokens(maxTokens)} tokens {totalCost > 0 ? `$${totalCost.toFixed(3)}` : ''}
```

Fonction `formatTokens` :
```typescript
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}
```

**Header** : `<div className="flex items-center gap-2 p-3 text-sm font-medium text-muted-foreground border-b border-border/40">` avec icone `Settings` (lucide-react) et texte "Parametres".

**Derived state** :
- `isBusy = isStreaming` (lire depuis `useUiStore`)
- `isRoleLocked = conversationMessages.length > 0` (role non modifiable si messages existent)

**Criteres d'acceptation** :
- ModelSelector, ChatOptionsMenu, RoleSelector, Switch Web Search, tokens/cout affiches
- Section NON collapsable
- Layout vertical, gap-3
- Typecheck passe

---

#### T04 — OptionsSection.tsx [NEW]

**But** : Section collapsable avec les options secondaires.

**Fichier** : `src/renderer/src/components/chat/right-panel/OptionsSection.tsx`

```typescript
import { Sliders } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { PromptPicker } from '@/components/chat/PromptPicker'
import { LibraryPicker } from '@/components/chat/LibraryPicker'
import { YoloToggle } from '@/components/chat/YoloToggle'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
```

Wrappe dans `<CollapsibleSection title="Options" icon={Sliders} defaultOpen>`.

Layout vertical (flex col gap-3) :
1. `<PromptPicker onInsert={onPromptInsert} disabled={isBusy} />` — le callback `onPromptInsert` est passe via props : `interface OptionsSectionProps { onPromptInsert: (text: string) => void }`
2. `<LibraryPicker disabled={isBusy} onLibraryChange={...} />` — `onLibraryChange` peut etre un no-op (le store gere l'etat sticky)
3. `<YoloToggle conversationId={activeConversationId} modelSupportsYolo={selectedModel?.supportsYolo ?? false} workspacePath={workspaceRootPath ?? undefined} disabled={isBusy} />` — conditionnel sur `activeConversationId`

**Criteres d'acceptation** :
- CollapsibleSection "Options" avec icone Sliders
- PromptPicker, LibraryPicker, YoloToggle affiches
- Layout vertical, gap-3
- Typecheck passe

---

#### T05 — McpSection.tsx [NEW]

**But** : Section collapsable listant les serveurs MCP avec toggle on/off.

**Fichier** : `src/renderer/src/components/chat/right-panel/McpSection.tsx`

```typescript
import { useState, useEffect } from 'react'
import { Plug } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { CollapsibleSection } from './CollapsibleSection'
```

Wrappe dans `<CollapsibleSection title="MCP" icon={Plug} defaultOpen>`.

**Donnees** : charger la liste des serveurs MCP au mount :
```typescript
const [servers, setServers] = useState<Array<{ id: string; name: string; enabled: boolean; status: string }>>([])

useEffect(() => {
  window.api.mcpListServers().then(setServers).catch(() => {})
}, [])
```

**Rendu de chaque serveur** : ligne flex avec :
- Pastille status : `<span className="size-2 rounded-full shrink-0 {status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/30'}" />`
- Nom truncate : `<span className="flex-1 truncate text-sm">{server.name}</span>`
- Switch : `<Switch checked={server.enabled} onCheckedChange={(checked) => handleToggle(server.id, checked)} />`

`handleToggle` appelle `window.api.mcpToggleServer(serverId, enabled)` puis rafraichit la liste.

**Container** : `max-h-[200px] overflow-y-auto` (~5 items de 40px visible).

**Empty state** : `<p className="text-sm text-muted-foreground">Aucun serveur MCP</p>`

**Criteres d'acceptation** :
- CollapsibleSection "MCP" avec icone Plug
- Liste serveurs avec pastille + nom + Switch
- Toggle appelle IPC
- Max 5 items visibles, scroll au-dela
- Empty state si 0 serveur
- Typecheck passe

---

#### T06 — ToolsSection.tsx [NEW]

**But** : Section collapsable avec 4 boutons outils en grille 2x2.

**Fichier** : `src/renderer/src/components/chat/right-panel/ToolsSection.tsx`

```typescript
import { Wrench, Send, FileText, Sparkles, GitFork } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CollapsibleSection } from './CollapsibleSection'
import { useConversationsStore } from '@/stores/conversations.store'
import { useMessagesStore } from '@/stores/messages.store'
import { useUiStore } from '@/stores/ui.store'
import { useRemoteStore } from '@/stores/remote.store'
```

Wrappe dans `<CollapsibleSection title="Outils" icon={Wrench} defaultOpen>`.

Grille `grid grid-cols-2 gap-2`.

4 boutons, chacun est :
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="sm"
      className="h-10 w-full border border-border/40 gap-2"
      disabled={conditionDisabled}
      onClick={handler}
    >
      <Icon className="size-4" />
      <span className="text-xs">Label</span>
    </Button>
  </TooltipTrigger>
  <TooltipContent>Tooltip text</TooltipContent>
</Tooltip>
```

Les 4 boutons :
1. **Telegram** (Send icon) — Label "Remote". `disabled` si `!remoteConfig?.hasToken`. onClick : `window.api.remoteToggle()` (toggle start/stop). Lire `useRemoteStore(s => s.config)`.
2. **Resume** (FileText icon) — Label "Resume". `disabled` si pas de messages ou isStreaming. onClick : `window.api.summarizeConversation(...)` (copier resultat dans clipboard, toast). Needs `summaryModelId` et `summaryPrompt` depuis `useSettingsStore`.
3. **Optimizer** (Sparkles icon) — Label "Optimiser". `disabled` si inputContent vide ou isStreaming. onClick appelle IPC `window.api.optimizePrompt(...)`. **Le contenu du textarea est passe via props** : `interface ToolsSectionProps { inputContent: string; onOptimizedPrompt: (text: string) => void }`.
4. **Fork** (GitFork icon) — Label "Fork". `disabled` si pas de `activeConversationId`. onClick : `window.api.forkConversation(activeConversationId)` puis `addConversation(forked); setActiveConversation(forked.id)`.

**Criteres d'acceptation** :
- CollapsibleSection "Outils" avec icone Wrench
- Grille 2x2
- 4 boutons avec icone + label + tooltip
- Chaque bouton grise quand indisponible
- Typecheck passe

---

Apres les 4 fichiers, typecheck : `npx tsc --noEmit -p src/renderer/tsconfig.json`

Commit : "feat: right panel sections — ParamsSection, OptionsSection, McpSection, ToolsSection"

---

### Etape 4 : Merge du worktree

Apres que l'agent-sections a termine :
1. Le worktree aura cree une branche avec les 4 fichiers
2. Merge cette branche dans `feature-right-panel` :
```bash
git merge <branche-worktree> --no-edit
```
3. Typecheck pour valider le merge :
```bash
npx tsc --noEmit -p src/renderer/tsconfig.json
```

---

### Etape 5 : Vague 3 — Assemblage (toi)

#### T07 — RightPanel.tsx [NEW]

**But** : Composant assembleur qui importe et compose les 4 sections.

**Fichier** : `src/renderer/src/components/chat/right-panel/RightPanel.tsx`

```typescript
import { ParamsSection } from './ParamsSection'
import { OptionsSection } from './OptionsSection'
import { McpSection } from './McpSection'
import { ToolsSection } from './ToolsSection'

interface RightPanelProps {
  onPromptInsert: (text: string) => void
  inputContent: string
  onOptimizedPrompt: (text: string) => void
}

export function RightPanel({ onPromptInsert, inputContent, onOptimizedPrompt }: RightPanelProps) {
  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-l border-border/40 bg-background overflow-y-auto">
      <ParamsSection />
      <OptionsSection onPromptInsert={onPromptInsert} />
      <McpSection />
      <ToolsSection inputContent={inputContent} onOptimizedPrompt={onOptimizedPrompt} />
    </div>
  )
}
```

**Criteres d'acceptation** :
- 4 sections assemblees dans l'ordre
- Layout 260px, border-l, overflow-y-auto, shrink-0
- Props propagees aux sections qui en ont besoin
- Typecheck passe

Commit : "feat: right panel assembleur — RightPanel.tsx"

---

### Etape 6 : Vague 4 — Integration (toi)

#### T08 — ChatView.tsx [MODIFY]

**But** : Integrer le RightPanel dans ChatView, mutuellement exclusif avec WorkspacePanel.

**Fichier** : `src/renderer/src/components/chat/ChatView.tsx`

Contenu actuel du return :
```tsx
return (
  <div className="flex h-full">
    <div className="flex flex-1 flex-col bg-background min-w-0">
      <YoloStatusBar />
      {activeConversationId && hasMessages ? (
        <MessageList messages={conversationMessages} streamingMessageId={streamingMessageId} />
      ) : (
        <EmptyState hasConversation={!!activeConversationId} />
      )}
      <div className="shrink-0">
        <InputZone />
      </div>
    </div>
    {workspaceRootPath && <WorkspacePanel />}
  </div>
)
```

Modifications :
1. Importer `useUiStore` et `RightPanel` (lazy import) :
   ```typescript
   import { useUiStore } from '@/stores/ui.store'
   const RightPanel = React.lazy(() => import('./right-panel/RightPanel').then(m => ({ default: m.RightPanel })))
   ```
2. Lire `openPanel` :
   ```typescript
   const openPanel = useUiStore((s) => s.openPanel)
   ```
3. Gerer les callbacks pour le RightPanel (prompt insert et optimize) — creer des fonctions qui dispatch vers l'InputZone. Deux approches possibles :
   - Via un store Zustand ephemere (ex: `ui.store` avec `pendingPromptInsert`)
   - Via des refs passees en props a InputZone

   **Approche simple** : ajouter un state `inputContent` dans ChatView qui est synced depuis InputZone via un callback, ou utiliser un ref. Pour la V1, le PromptPicker et l'Optimizer dans le RightPanel peuvent simplement ne pas avoir le contenu du textarea (disabled optimizer, prompt insert via un event custom).

   **Alternative pragmatique** : ajouter un petit store ou utiliser un custom event (`window.dispatchEvent(new CustomEvent('prompt-insert', { detail: text }))`). InputZone ecoute cet event et insere le texte.

4. Remplacer le rendu du WorkspacePanel :
   ```tsx
   return (
     <div className="flex h-full">
       <div className="flex flex-1 flex-col bg-background min-w-0">
         <YoloStatusBar />
         {activeConversationId && hasMessages ? (
           <MessageList messages={conversationMessages} streamingMessageId={streamingMessageId} />
         ) : (
           <EmptyState hasConversation={!!activeConversationId} />
         )}
         <div className="shrink-0">
           <InputZone />
         </div>
       </div>
       {openPanel === 'right' && (
         <React.Suspense fallback={null}>
           <RightPanel
             onPromptInsert={(text) => window.dispatchEvent(new CustomEvent('prompt-insert', { detail: text }))}
             inputContent=""
             onOptimizedPrompt={(text) => window.dispatchEvent(new CustomEvent('prompt-optimized', { detail: text }))}
           />
         </React.Suspense>
       )}
       {openPanel === 'workspace' && workspaceRootPath && <WorkspacePanel />}
     </div>
   )
   ```

5. Ajouter un bouton toggle pour le RightPanel. Option : icone `PanelRight` (lucide-react) dans l'InputZone toolbar cote droit, ou un bouton en haut du chat. **Decision** : ajouter un bouton `PanelRight` dans la toolbar de l'InputZone (cote gauche, apres le Paperclip), qui appelle `useUiStore.getState().toggleRightPanel()`. Ce bouton sera conserve dans InputZone lors du cleanup T09.

**Criteres d'acceptation** :
- RightPanel affiche quand `openPanel === 'right'`
- WorkspacePanel affiche quand `openPanel === 'workspace'` et `workspaceRootPath`
- Jamais les deux en meme temps
- Bouton toggle present
- Typecheck passe

#### T09 — InputZone.tsx [MODIFY]

**But** : Retirer tous les controles migres vers le Right Panel.

**Fichier** : `src/renderer/src/components/chat/InputZone.tsx` (1336 lignes)

**A RETIRER de la toolbar (lignes ~1105-1236)** :
- `<ModelSelector />` (ligne ~1153)
- `<ChatOptionsMenu />` (lignes ~1154-1159)
- `<RoleSelector />` (lignes ~1160-1162)
- `<LibraryPicker />` (lignes ~1163-1168)
- `<YoloToggle />` (lignes ~1169-1176)
- `<PromptPicker />` (lignes ~1177-1180)
- Bouton Sparkles/Optimizer (lignes ~1181-1205)
- Bouton Fork (lignes ~1206-1231)
- Bouton FolderOpen/Workspace (lignes ~1109-1130)

**A RETIRER du bas** :
- `<ContextWindowIndicator />` (lignes ~1316-1319)
- Hint clavier (lignes ~1324-1331) — optionnel, a voir

**A CONSERVER dans la toolbar** :
- Paperclip (piece jointe) — cote gauche
- **Bouton PanelRight (NOUVEAU)** — toggle right panel, cote gauche apres Paperclip
- VoiceInput — cote gauche (fin)
- Send / Cancel — cote droit

**A AJOUTER** :
- Bouton toggle RightPanel (icone `PanelRight` de lucide-react) :
  ```tsx
  import { PanelRight } from 'lucide-react'
  import { useUiStore } from '@/stores/ui.store'

  // Dans la toolbar, apres Paperclip :
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => useUiStore.getState().toggleRightPanel()}
        className={cn(
          'size-7 rounded-lg',
          'text-muted-foreground/60 hover:text-muted-foreground',
          'transition-colors',
          openPanel === 'right' && 'text-primary'
        )}
      >
        <PanelRight className="size-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="top">Panneau lateral (Opt+Cmd+B)</TooltipContent>
  </Tooltip>
  ```

- Ecoute des events custom pour le prompt insert/optimize depuis le RightPanel :
  ```typescript
  useEffect(() => {
    function handlePromptInsert(e: Event) {
      const text = (e as CustomEvent).detail as string
      setContent((prev) => prev ? `${prev}\n${text}` : text)
    }
    function handlePromptOptimized(e: Event) {
      const text = (e as CustomEvent).detail as string
      setContent(text)
    }
    window.addEventListener('prompt-insert', handlePromptInsert)
    window.addEventListener('prompt-optimized', handlePromptOptimized)
    return () => {
      window.removeEventListener('prompt-insert', handlePromptInsert)
      window.removeEventListener('prompt-optimized', handlePromptOptimized)
    }
  }, [])
  ```

**Nettoyer les imports inutilises** : ModelSelector, ChatOptionsMenu, RoleSelector, LibraryPicker, YoloToggle, PromptPicker, ContextWindowIndicator, FolderOpen, GitFork, Sparkles, Loader2 (si plus utilise), useContextWindow (si plus utilise), useRolesStore (si plus utilise), etc.

**Verifier** : `handleSendText()` doit continuer a fonctionner — il lit les stores Zustand directement (`useProvidersStore.getState()`, `useSettingsStore.getState()`, etc.), pas les composants UI retires. Donc aucune modification necessaire sur la logique d'envoi.

**Criteres d'acceptation** :
- Toolbar simplifiee : Paperclip + PanelRight + VoiceInput | Send/Cancel
- ContextWindowIndicator retire du bas
- Imports inutilises nettoyes
- handleSendText fonctionne toujours
- @mentions et slash commands restent fonctionnels
- Typecheck passe

Commit : "feat: right panel integration — ChatView layout + InputZone cleanup"

---

### Etape 7 : Vague 5 — Finition (toi)

#### T11 — Comportement ouverture/fermeture automatique

**But** : Le Right Panel s'ouvre auto sur nouvelle conversation, se ferme au switch.

**Fichier** : `src/renderer/src/components/chat/ChatView.tsx` [MODIFY]

Dans le `useEffect` qui reagit au changement de `activeConversationId` (lignes ~65-135), ajouter :

```typescript
useEffect(() => {
  // ... code existant (sandbox deactivate, load messages, restore model/role) ...

  // Auto-open/close right panel based on conversation state
  if (!activeConversationId) {
    // Pas de conversation → fermer le right panel s'il est ouvert
    if (useUiStore.getState().openPanel === 'right') {
      useUiStore.getState().setOpenPanel(null)
    }
    return
  }

  // Verifier si la conversation a des messages (= conversation existante vs nouvelle)
  // On attend le chargement des messages pour decider
  // → Fait APRES le loadMessages()

}, [activeConversationId])
```

**Approche** : Apres `loadMessages()`, verifier si la conversation vient d'etre creee :
```typescript
async function loadMessages() {
  try {
    const msgs = await window.api.getMessages(activeConversationId!)
    // ...
    setMessages(loadedMessages)

    // Auto-open right panel for new conversations (no messages yet)
    if (loadedMessages.length === 0) {
      useUiStore.getState().setOpenPanel('right')
    } else {
      // Existing conversation — close right panel if it was open
      if (useUiStore.getState().openPanel === 'right') {
        useUiStore.getState().setOpenPanel(null)
      }
    }
    // ... rest of the function
  }
}
```

**Criteres d'acceptation** :
- Nouvelle conversation → right panel s'ouvre
- Switch vers conversation existante → right panel se ferme
- Le workspace panel n'est pas affecte
- Pas de flash/clignotement
- Typecheck passe

Commit : "feat: right panel auto open/close on conversation switch"

---

### Etape 8 : Validation finale

1. Typecheck complet : `npx tsc --noEmit -p src/renderer/tsconfig.json`
2. Verification visuelle (optionnel) : `npm run dev` et tester :
   - OPT+CMD+B ouvre/ferme le right panel
   - Le workspace panel et le right panel sont mutuellement exclusifs
   - Les controles fonctionnent (model selector, role, thinking, etc.)
   - L'InputZone est simplifiee
   - Nouvelle conversation → right panel s'ouvre auto
3. Si tout est OK, le chantier est termine.

---

## Annexe : Detail des fichiers par tache

| Tache | Fichier | Action |
|-------|---------|--------|
| T01 | `src/renderer/src/stores/ui.store.ts` | MODIFY |
| T01 | `src/renderer/src/stores/workspace.store.ts` | MODIFY |
| T02 | `src/renderer/src/components/chat/right-panel/CollapsibleSection.tsx` | NEW |
| T03 | `src/renderer/src/components/chat/right-panel/ParamsSection.tsx` | NEW |
| T04 | `src/renderer/src/components/chat/right-panel/OptionsSection.tsx` | NEW |
| T05 | `src/renderer/src/components/chat/right-panel/McpSection.tsx` | NEW |
| T06 | `src/renderer/src/components/chat/right-panel/ToolsSection.tsx` | NEW |
| T07 | `src/renderer/src/components/chat/right-panel/RightPanel.tsx` | NEW |
| T08 | `src/renderer/src/components/chat/ChatView.tsx` | MODIFY |
| T09 | `src/renderer/src/components/chat/InputZone.tsx` | MODIFY |
| T10 | `src/renderer/src/hooks/useKeyboardShortcuts.ts` | MODIFY |
| T11 | `src/renderer/src/components/chat/ChatView.tsx` | MODIFY |

## Annexe : Chemin critique

```
T01 → T03 → T07 → T08 → T11
      T04 ↗
      T05 ↗
      T06 ↗
```

## Annexe : Points de synchronisation

| Point | Condition |
|-------|-----------|
| Apres Vague 1 | Typecheck passe, commit |
| Apres Vague 2 | Merge worktree, typecheck passe |
| Apres Vague 4 | Typecheck passe, app demarre (`npm run dev`) |
