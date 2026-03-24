import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquarePlus, Moon, Settings, Sun, FolderOpen, Cpu, UserPen, UserCircle, Clock, Shield, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConversationsStore, type Conversation } from '@/stores/conversations.store'
import { useProjectsStore, type Project } from '@/stores/projects.store'
import { useUiStore } from '@/stores/ui.store'

// ── Types ────────────────────────────────────────────────────

interface CommandItem {
  id: string
  label: string
  group: string
  icon?: React.ReactNode
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNewConversation?: () => void
  onOpenSettings?: () => void
  onSelectConversation?: (id: string, projectId?: string) => void
  onSelectProject?: (id: string) => void
}

// ── Helpers ──────────────────────────────────────────────────

function toggleTheme() {
  document.documentElement.classList.toggle('dark')
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

// ── Component ────────────────────────────────────────────────

/**
 * Command palette opened via Cmd+K.
 * Displays searchable list of actions and recent conversations.
 */
function CommandPalette({
  open,
  onClose,
  onNewConversation,
  onOpenSettings,
  onSelectConversation,
  onSelectProject,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const conversations = useConversationsStore((s) => s.conversations)
  const projects = useProjectsStore((s) => s.projects)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)
  const setCustomizeTab = useUiStore((s) => s.setCustomizeTab)

  // Fetch ALL conversations when palette opens (store only has current project's)
  const [allConversations, setAllConversations] = useState<Conversation[]>([])

  useEffect(() => {
    if (open) {
      window.api.getConversations().then(setAllConversations).catch(console.error)
    }
  }, [open])

  // Build the items list
  const items = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      {
        id: 'action:new',
        label: 'Nouvelle conversation',
        group: 'Actions',
        icon: <MessageSquarePlus className="size-4" />,
        onSelect: () => {
          onNewConversation?.()
          onClose()
        },
      },
      {
        id: 'action:settings',
        label: 'Parametres',
        group: 'Actions',
        icon: <Settings className="size-4" />,
        onSelect: () => {
          onOpenSettings?.()
          onClose()
        },
      },
      {
        id: 'action:models',
        label: 'Liste des modeles',
        group: 'Actions',
        icon: <Cpu className="size-4" />,
        onSelect: () => {
          setSettingsTab('model')
          setCurrentView('settings')
          onClose()
        },
      },
      {
        id: 'action:customize',
        label: 'Personnaliser',
        group: 'Actions',
        icon: <UserPen className="size-4" />,
        onSelect: () => {
          setCustomizeTab('prompts')
          setCurrentView('customize')
          onClose()
        },
      },
      {
        id: 'action:roles',
        label: 'Roles',
        group: 'Actions',
        icon: <UserCircle className="size-4" />,
        onSelect: () => {
          setCustomizeTab('roles')
          setCurrentView('customize')
          onClose()
        },
      },
      {
        id: 'action:tasks',
        label: 'Taches planifiees',
        group: 'Actions',
        icon: <Clock className="size-4" />,
        onSelect: () => {
          setCurrentView('tasks')
          onClose()
        },
      },
      {
        id: 'action:arena',
        label: 'Arena — Comparer deux modeles',
        group: 'Actions',
        icon: <Swords className="size-4" />,
        onSelect: () => {
          setCurrentView('arena')
          onClose()
        },
      },
      {
        id: 'action:brigade',
        label: 'Brigade — Gestion de bardas',
        group: 'Actions',
        icon: <Shield className="size-4" />,
        onSelect: () => {
          setCustomizeTab('brigade')
          setCurrentView('customize')
          onClose()
        },
      },
      {
        id: 'action:theme',
        label: isDarkMode() ? 'Passer en mode clair' : 'Passer en mode sombre',
        group: 'Actions',
        icon: isDarkMode() ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        ),
        onSelect: () => {
          toggleTheme()
          onClose()
        },
      },
    ]

    const projectItems: CommandItem[] = projects.map((p: Project) => ({
      id: `project:${p.id}`,
      label: p.name,
      group: 'Projets',
      icon: <FolderOpen className="size-4" />,
      onSelect: () => {
        onSelectProject?.(p.id)
        onClose()
      },
    }))

    const recent: CommandItem[] = allConversations.slice(0, 20).map((c: Conversation) => ({
      id: `conv:${c.id}`,
      label: c.title || 'Sans titre',
      group: 'Conversations',
      icon: undefined,
      onSelect: () => {
        onSelectConversation?.(c.id, c.projectId)
        onClose()
      },
    }))

    return [...actions, ...projectItems, ...recent]
  }, [allConversations, projects, onNewConversation, onOpenSettings, onSelectConversation, onSelectProject, onClose, setCurrentView, setSettingsTab])

  // Filter items by query
  const filtered = useMemo(() => {
    if (!query.trim()) return items
    const q = query.toLowerCase()
    return items.filter((item) => item.label.toLowerCase().includes(q))
  }, [items, query])

  // Group items for display
  const groups = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of filtered) {
      const group = map.get(item.group)
      if (group) {
        group.push(item)
      } else {
        map.set(item.group, [item])
      }
    }
    return map
  }, [filtered])

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      // Focus input next frame
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Clamp active index when filtered results change
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeEl = list.querySelector('[data-active="true"]')
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((prev) =>
            prev < filtered.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : filtered.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[activeIndex]) {
            filtered[activeIndex].onSelect()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filtered, activeIndex, onClose]
  )

  if (!open) return null

  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border/60 bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-border/40 px-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Rechercher une action ou conversation..."
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="ml-2 shrink-0 rounded border border-border/40 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/60">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground/50">
              Aucun resultat
            </div>
          )}
          {Array.from(groups.entries()).map(([groupName, groupItems]) => (
            <div key={groupName}>
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40">
                {groupName}
              </div>
              {groupItems.map((item) => {
                const itemIndex = flatIndex++
                const isActive = itemIndex === activeIndex
                return (
                  <button
                    key={item.id}
                    data-active={isActive}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIndex(itemIndex)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      isActive
                        ? 'bg-primary/10 text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {item.icon && (
                      <span className="shrink-0 text-muted-foreground/60">
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default React.memo(CommandPalette)
