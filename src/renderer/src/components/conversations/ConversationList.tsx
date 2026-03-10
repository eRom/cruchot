import React, { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
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
}

export function ConversationList({
  conversations,
  activeConversationId,
  isCollapsed,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation
}: ConversationListProps): React.JSX.Element {
  const grouped = useMemo(() => groupConversations(conversations), [conversations])

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
    <ScrollArea className="flex-1">
      <div className={cn(isCollapsed ? 'px-1.5 py-2' : 'px-2 py-1', 'overflow-hidden')}>
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
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
