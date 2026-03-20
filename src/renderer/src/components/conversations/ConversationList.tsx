import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'
import { ConversationItem } from './ConversationItem'
import type { Conversation } from '@/stores/conversations.store'

/** Date group labels (french UI default) */
type DateGroup = 'Aujourd\'hui' | 'Hier' | '7 derniers jours' | 'Plus ancien'

interface GroupedConversations {
  label: DateGroup
  conversations: Conversation[]
}

function getDateGroup(date: Date): DateGroup {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (d >= today) return 'Aujourd\'hui'
  if (d >= yesterday) return 'Hier'
  if (d >= weekAgo) return '7 derniers jours'
  return 'Plus ancien'
}

function groupConversations(conversations: Conversation[]): GroupedConversations[] {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  const groupOrder: DateGroup[] = ['Aujourd\'hui', 'Hier', '7 derniers jours', 'Plus ancien']
  const groups = new Map<DateGroup, Conversation[]>()

  for (const conv of sorted) {
    const group = getDateGroup(new Date(conv.updatedAt))
    if (!groups.has(group)) {
      groups.set(group, [])
    }
    groups.get(group)!.push(conv)
  }

  return groupOrder
    .filter((label) => groups.has(label))
    .map((label) => ({ label, conversations: groups.get(label)! }))
}

interface ConversationListProps {
  conversations: Conversation[]
  activeConversationId: string | null
  isCollapsed: boolean
  onSelectConversation: (id: string) => void
  onRenameConversation?: (id: string, title: string) => void
  onDeleteConversation?: (id: string) => void
  onToggleFavorite?: (id: string, isFavorite: boolean) => void
  onForkConversation?: (id: string) => void
}

export function ConversationList({
  conversations,
  activeConversationId,
  isCollapsed,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onToggleFavorite,
  onForkConversation
}: ConversationListProps): React.JSX.Element {
  // Split favorites and non-favorites
  const { favorites, others } = useMemo(() => {
    const favs: Conversation[] = []
    const rest: Conversation[] = []
    for (const c of conversations) {
      if (c.isFavorite) {
        favs.push(c)
      } else {
        rest.push(c)
      }
    }
    // Sort favorites by updatedAt desc
    favs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return { favorites: favs, others: rest }
  }, [conversations])

  const grouped = useMemo(() => groupConversations(others), [others])

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        {!isCollapsed && (
          <p className="text-center text-xs text-sidebar-foreground/40">
            Aucune conversation
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className={cn(isCollapsed ? 'px-1.5 py-2' : 'px-2 py-1')}>
        {/* ── Favorites section ─────────────────────────── */}
        {favorites.length > 0 && (
          <div className="mb-1">
            {!isCollapsed && (
              <div className="sticky top-0 z-10 bg-sidebar/95 backdrop-blur-sm px-2.5 pb-1 pt-3">
                <span className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-amber-500/70 uppercase">
                  <Star className="size-3 fill-amber-500/70" />
                  Favoris
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {favorites.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  isCollapsed={isCollapsed}
                  onSelect={onSelectConversation}
                  onRename={onRenameConversation}
                  onDelete={onDeleteConversation}
                  onToggleFavorite={onToggleFavorite}
                  onFork={onForkConversation}
                />
              ))}
            </div>
            {/* Separator between favorites and the rest */}
            {others.length > 0 && !isCollapsed && (
              <div className="mx-2 my-2 border-b border-sidebar-border/40" />
            )}
          </div>
        )}

        {/* ── Regular conversations (grouped by date) ──── */}
        {grouped.map((group) => (
          <div key={group.label} className="mb-1">
            {!isCollapsed && (
              <div className="sticky top-0 z-10 bg-sidebar/95 backdrop-blur-sm px-2.5 pb-1 pt-3">
                <span className="text-[11px] font-semibold tracking-wide text-sidebar-foreground/40 uppercase">
                  {group.label}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              {group.conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  isCollapsed={isCollapsed}
                  onSelect={onSelectConversation}
                  onRename={onRenameConversation}
                  onDelete={onDeleteConversation}
                  onToggleFavorite={onToggleFavorite}
                  onFork={onForkConversation}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
