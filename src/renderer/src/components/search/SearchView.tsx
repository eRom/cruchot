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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
