# SearchView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vue dediee "Recherche" (CMD+F) avec FTS5 plein texte dans tous les messages, filtres role/projet, resultats groupes par conversation avec highlight.

**Architecture:** Le backend FTS5 existe deja (table, triggers, query, IPC, preload). On enrichit la query pour supporter des filtres (role, projectId), on ajoute un nouveau ViewMode `search`, et on cree le composant `SearchView`. Navigation via UserMenu + raccourci CMD+F.

**Tech Stack:** React 19, Zustand, SQLite FTS5, hotkeys-js, Zod, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-03-search-view-design.md`
**Maquette:** `mockup-search.html`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/preload/types.ts` | Ajouter `SearchFilters`, enrichir `SearchResult` avec `projectId` |
| Modify | `src/main/db/queries/search.ts` | Filtres role/projectId dans la query SQL |
| Modify | `src/main/ipc/search.ipc.ts` | Payload objet au lieu de string |
| Modify | `src/preload/index.ts` | Signature mise a jour |
| Modify | `src/renderer/src/stores/ui.store.ts` | `'search'` dans ViewMode |
| Modify | `src/renderer/src/hooks/useKeyboardShortcuts.ts` | Callback `onSearch` + CMD+F |
| Modify | `src/renderer/src/App.tsx` | Lazy import SearchView + route + handler |
| Modify | `src/renderer/src/components/layout/UserMenu.tsx` | Item "Recherche" |
| Create | `src/renderer/src/components/search/SearchView.tsx` | Vue recherche complete |

---

### Task 1: Backend — types + filtres + IPC

**Files:**
- Modify: `src/preload/types.ts:245-252` (SearchResult) + `:797` (searchMessages signature)
- Modify: `src/main/db/queries/search.ts`
- Modify: `src/main/ipc/search.ipc.ts`
- Modify: `src/preload/index.ts:139`

- [ ] **Step 1: Ajouter SearchFilters et enrichir SearchResult dans types.ts**

Dans `src/preload/types.ts`, remplacer le bloc SearchResult (lignes 245-252) :

```typescript
export interface SearchFilters {
  role?: 'user' | 'assistant'
  projectId?: string
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  projectId: string | null
  role: string
  content: string
  createdAt: number
}
```

Et mettre a jour la signature de searchMessages (ligne 797) :

```typescript
  searchMessages: (payload: { query: string; filters?: SearchFilters }) => Promise<SearchResult[]>
```

- [ ] **Step 2: Enrichir la query SQL avec filtres dans search.ts**

Remplacer le contenu de `src/main/db/queries/search.ts` :

```typescript
import { getSqliteDatabase } from '../index'

export interface SearchFilters {
  role?: 'user' | 'assistant'
  projectId?: string
}

export interface SearchResult {
  messageId: string
  conversationId: string
  conversationTitle: string
  projectId: string | null
  role: string
  content: string
  createdAt: number
}

/**
 * Sanitize FTS5 query input to prevent query injection.
 * Strips FTS5 special operators and wraps terms in double quotes.
 */
function sanitizeFtsQuery(query: string): string {
  const stripped = query
    .replace(/[{}()*^"]/g, '')
    .replace(/\bAND\b/gi, '')
    .replace(/\bOR\b/gi, '')
    .replace(/\bNOT\b/gi, '')
    .replace(/\bNEAR\b/gi, '')
    .replace(/\w+\s*:/g, '')
    .trim()

  if (!stripped) return '""'

  const terms = stripped.split(/\s+/).filter(Boolean)
  return terms.map(t => `"${t}"`).join(' ')
}

export function searchMessages(query: string, filters?: SearchFilters): SearchResult[] {
  const sqlite = getSqliteDatabase()
  const sanitized = sanitizeFtsQuery(query)

  const conditions: string[] = ['messages_fts MATCH ?']
  const params: unknown[] = [sanitized]

  if (filters?.role) {
    conditions.push('m.role = ?')
    params.push(filters.role)
  }

  if (filters?.projectId) {
    conditions.push('c.project_id = ?')
    params.push(filters.projectId)
  }

  const whereClause = conditions.join(' AND ')

  const results = sqlite
    .prepare(
      `
      SELECT
        m.id AS messageId,
        m.conversation_id AS conversationId,
        c.title AS conversationTitle,
        c.project_id AS projectId,
        m.role,
        substr(m.content, 1, 500) AS content,
        m.created_at AS createdAt
      FROM messages_fts
      JOIN messages m ON messages_fts.rowid = m.rowid
      JOIN conversations c ON m.conversation_id = c.id
      WHERE ${whereClause}
      ORDER BY rank
      LIMIT 50
    `
    )
    .all(...params) as SearchResult[]

  return results
}
```

- [ ] **Step 3: Mettre a jour le IPC handler dans search.ipc.ts**

Remplacer le contenu de `src/main/ipc/search.ipc.ts` :

```typescript
import { ipcMain } from 'electron'
import { z } from 'zod'
import { searchMessages } from '../db/queries/search'

const searchPayloadSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.object({
    role: z.enum(['user', 'assistant']).optional(),
    projectId: z.string().optional(),
  }).optional(),
})

export function registerSearchIpc(): void {
  ipcMain.handle('search:messages', async (_event, payload: unknown) => {
    const parsed = searchPayloadSchema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid search payload')
    return searchMessages(parsed.data.query.trim(), parsed.data.filters)
  })

  console.log('[IPC] Search handlers registered')
}
```

- [ ] **Step 4: Mettre a jour le preload bridge dans index.ts**

A la ligne 139 de `src/preload/index.ts`, remplacer :

```typescript
  searchMessages: (query) => ipcRenderer.invoke('search:messages', query),
```

par :

```typescript
  searchMessages: (payload) => ipcRenderer.invoke('search:messages', payload),
```

- [ ] **Step 5: Verifier que le build compile**

Run: `cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit --project src/main/tsconfig.json 2>&1 | head -20`

Expected: Pas d'erreur sur les fichiers modifies (search.ts, search.ipc.ts). Des erreurs renderer sont normales car SearchView n'existe pas encore.

- [ ] **Step 6: Commit**

```bash
git add src/preload/types.ts src/main/db/queries/search.ts src/main/ipc/search.ipc.ts src/preload/index.ts
git commit -m "feat(search): add filters (role, projectId) to FTS5 search backend"
```

---

### Task 2: ViewMode + raccourci CMD+F + UserMenu

**Files:**
- Modify: `src/renderer/src/stores/ui.store.ts:3`
- Modify: `src/renderer/src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/layout/UserMenu.tsx`

- [ ] **Step 1: Ajouter `search` au ViewMode dans ui.store.ts**

Ligne 3 de `src/renderer/src/stores/ui.store.ts`, remplacer :

```typescript
export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'tasks' | 'arena' | 'customize'
```

par :

```typescript
export type ViewMode = 'chat' | 'settings' | 'statistics' | 'images' | 'projects' | 'tasks' | 'arena' | 'customize' | 'search'
```

- [ ] **Step 2: Ajouter le callback onSearch dans useKeyboardShortcuts.ts**

Dans `src/renderer/src/hooks/useKeyboardShortcuts.ts`, ajouter dans l'interface (apres la ligne 18 `onCustomize`):

```typescript
  /** Cmd+F — open search */
  onSearch?: () => void
```

Dans le corps du useEffect, ajouter apres le bloc `onCustomize` (apres la ligne 52) :

```typescript
    if (callbacks.onSearch) {
      const handler = callbacks.onSearch
      bindings.push(['command+f,ctrl+f', handler])
    }
```

Dans le tableau de dependances du useEffect (ligne 118), ajouter `callbacks.onSearch` :

```typescript
  ], [
    callbacks.onNewConversation,
    callbacks.onCommandPalette,
    callbacks.onSettings,
    callbacks.onModelList,
    callbacks.onToggleSidebar,
    callbacks.onToggleRightPanel,
    callbacks.onCustomize,
    callbacks.onSearch,
    callbacks.onEscape,
  ])
```

- [ ] **Step 3: Ajouter le lazy import, le handler et la route dans App.tsx**

Dans `src/renderer/src/App.tsx` :

Apres la ligne 20 (ArenaView lazy), ajouter :

```typescript
const SearchView = React.lazy(() => import('@/components/search/SearchView').then(m => ({ default: m.SearchView })))
```

Apres le handler `handleCustomize` (apres la ligne 87), ajouter :

```typescript
  const handleSearch = useCallback(() => {
    setCurrentView('search')
  }, [setCurrentView])
```

Dans `useKeyboardShortcuts` (ligne 99-108), ajouter `onSearch: handleSearch` :

```typescript
  useKeyboardShortcuts({
    onNewConversation: handleNewConversation,
    onCommandPalette: handleCommandPalette,
    onSettings: handleSettings,
    onModelList: handleModelList,
    onToggleSidebar: handleToggleSidebar,
    onToggleRightPanel: handleToggleRightPanel,
    onCustomize: handleCustomize,
    onSearch: handleSearch,
    onEscape: handleEscape,
  })
```

Dans le Suspense (apres ligne 147 `arena`), ajouter :

```typescript
              {currentView === 'search' && <SearchView />}
```

- [ ] **Step 4: Ajouter l'item Recherche dans UserMenu.tsx**

Dans `src/renderer/src/components/layout/UserMenu.tsx` :

Ajouter `Search` a l'import lucide-react (ligne 14-21) :

```typescript
import {
  BarChart3,
  ChevronsDownUp,
  ChevronsUpDown,
  Image,
  Search,
  Settings,
  UserPen
} from 'lucide-react'
```

Dans le `DropdownMenuGroup` (entre le MenuItem "Personnaliser" et "Parametres", vers ligne 99), ajouter :

```typescript
          <MenuItem
            icon={Search}
            label="Recherche"
            isActive={currentView === 'search'}
            onSelect={() => onNavigate('search')}
            shortcut="⌘F"
          />
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/ui.store.ts src/renderer/src/hooks/useKeyboardShortcuts.ts src/renderer/src/App.tsx src/renderer/src/components/layout/UserMenu.tsx
git commit -m "feat(search): add search ViewMode, CMD+F shortcut, UserMenu entry"
```

---

### Task 3: SearchView component

**Files:**
- Create: `src/renderer/src/components/search/SearchView.tsx`

- [ ] **Step 1: Creer le composant SearchView**

Creer `src/renderer/src/components/search/SearchView.tsx` :

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare, Search, User, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import type { SearchResult, SearchFilters } from '../../../../preload/types'

// ── Helpers ─────────────────────────────────────────────

function formatRelativeDate(ts: number): string {
  const date = new Date(ts * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return `Aujourd'hui, ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diffDays === 1) return `Hier, ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  if (diffDays < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function highlightTerms(text: string, query: string): (string | { highlight: string })[] {
  if (!query.trim()) return [text]
  const terms = query.trim().split(/\s+/).filter(Boolean)
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts: (string | { highlight: string })[] = []
  let lastIndex = 0

  for (const match of text.matchAll(regex)) {
    if (match.index! > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push({ highlight: match[0] })
    lastIndex = match.index! + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

// ── Types ───────────────────────────────────────────────

type RoleFilter = 'all' | 'user' | 'assistant'

interface ConversationGroup {
  conversationId: string
  conversationTitle: string
  projectId: string | null
  messages: SearchResult[]
}

// ── Component ───────────────────────────────────────────

export function SearchView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setActiveConversation = useConversationsStore((s) => s.setActiveConversation)
  const setActiveProject = useProjectsStore((s) => s.setActiveProject)
  const projects = useProjectsStore((s) => s.projects)

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string>('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Autofocus on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      setResults([])
      setHasSearched(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const filters: SearchFilters = {}
        if (roleFilter !== 'all') filters.role = roleFilter
        if (projectFilter) filters.projectId = projectFilter
        const res = await window.api.searchMessages({ query: query.trim(), filters })
        setResults(res)
        setHasSearched(true)
      } catch (err) {
        console.error('Search failed:', err)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, roleFilter, projectFilter])

  // Group results by conversation
  const groups = useMemo<ConversationGroup[]>(() => {
    const map = new Map<string, ConversationGroup>()
    for (const r of results) {
      let group = map.get(r.conversationId)
      if (!group) {
        group = {
          conversationId: r.conversationId,
          conversationTitle: r.conversationTitle || 'Sans titre',
          projectId: r.projectId,
          messages: [],
        }
        map.set(r.conversationId, group)
      }
      group.messages.push(r)
    }
    return Array.from(map.values())
  }, [results])

  const handleSelectResult = useCallback((result: SearchResult) => {
    if (result.projectId) {
      setActiveProject(result.projectId)
    }
    setActiveConversation(result.conversationId)
    setCurrentView('chat')
  }, [setActiveConversation, setActiveProject, setCurrentView])

  const roleButtons: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'Tout' },
    { value: 'user', label: 'User' },
    { value: 'assistant', label: 'Assistant' },
  ]

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <button
          onClick={() => setCurrentView('chat')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Recherche</h1>
        {hasSearched && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {results.length} resultat{results.length !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto rounded border border-border/40 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
          ⌘F
        </span>
      </div>

      {/* Search input */}
      <div className="px-6 pt-4">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 size-[18px] text-muted-foreground/50 pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans toutes les conversations..."
            className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-border/40 px-6 py-3">
        <span className="text-xs text-muted-foreground">Role :</span>
        {roleButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setRoleFilter(btn.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              roleFilter === btn.value
                ? 'border-primary bg-primary text-primary-foreground font-semibold'
                : 'border-border text-muted-foreground hover:border-primary hover:text-foreground'
            )}
          >
            {btn.label}
          </button>
        ))}

        <div className="mx-1 h-5 w-px bg-border" />

        <span className="text-xs text-muted-foreground">Projet :</span>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground outline-none hover:border-primary"
        >
          <option value="">Tous les projets</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Empty state — no query */}
        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
            <Search className="mb-3 size-10 opacity-30" />
            <p className="text-sm">Rechercher dans toutes vos conversations</p>
            <p className="text-xs mt-1">Minimum 2 caracteres</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="size-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
          </div>
        )}

        {/* No results */}
        {hasSearched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
            <p className="text-sm">Aucun resultat pour &laquo; {query} &raquo;</p>
          </div>
        )}

        {/* Results grouped by conversation */}
        {!loading && groups.map((group) => (
          <div key={group.conversationId} className="mt-4 first:mt-2">
            {/* Conversation header */}
            <div className="flex items-center gap-2 px-0 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">
              <MessageSquare className="size-3.5 opacity-50" />
              <span className="truncate">{group.conversationTitle}</span>
              <span className="font-normal opacity-60">
                — {group.messages.length} message{group.messages.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Messages */}
            {group.messages.map((msg) => (
              <button
                key={msg.messageId}
                onClick={() => handleSelectResult(msg)}
                className="flex w-full gap-3 rounded-lg border border-transparent px-3.5 py-3 text-left transition-colors hover:border-border hover:bg-card"
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {msg.role === 'user' ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {msg.role === 'user' ? 'Vous' : 'Assistant'}
                    </span>
                    <span className="text-[11px] text-muted-foreground/50">
                      {formatRelativeDate(msg.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                    {highlightTerms(msg.content, query).map((part, i) =>
                      typeof part === 'string' ? (
                        <span key={i}>{part}</span>
                      ) : (
                        <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-primary">
                          {part.highlight}
                        </mark>
                      )
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifier que le build compile**

Run: `cd /Users/recarnot/dev/claude-desktop-multi-llm && npx tsc --noEmit 2>&1 | head -30`

Expected: 0 erreurs. Si erreurs d'import type, ajuster le chemin relatif vers preload/types.ts.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/search/SearchView.tsx
git commit -m "feat(search): add SearchView with filters, grouping, and highlight"
```

---

### Task 4: Test visuel + cleanup

**Files:**
- Aucun nouveau fichier

- [ ] **Step 1: Lancer l'app et tester**

Run: `cd /Users/recarnot/dev/claude-desktop-multi-llm && npm run dev`

Verifier :
1. CMD+F ouvre la vue Recherche
2. Menu utilisateur affiche "Recherche" avec raccourci ⌘F entre Personnaliser et Parametres
3. Input autofocus, placeholder visible
4. Taper un terme (>= 2 chars) → resultats apparaissent apres 300ms
5. Resultats groupes par conversation, highlights orange sur les termes
6. Clic sur un resultat → retour au chat avec la bonne conversation selectionnee
7. Filtre role (pills User/Assistant) fonctionne
8. Filtre projet (dropdown) fonctionne
9. ArrowLeft retourne au chat
10. Etat vide et zero resultats affichent les messages corrects

- [ ] **Step 2: Supprimer la maquette**

```bash
trash /Users/recarnot/dev/claude-desktop-multi-llm/mockup-search.html
```

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "chore: remove search mockup"
```
