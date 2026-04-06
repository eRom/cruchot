import { ConversationList } from '@/components/conversations/ConversationList'
import { ProjectSelector } from '@/components/projects/ProjectSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useUiStore, type ViewMode } from '@/stores/ui.store'

import { useWorkspaceStore } from '@/stores/workspace.store'
import {
  Clock,
  MessageSquarePlus,
  Plus,
  Swords
} from 'lucide-react'
import { RemoteIndicator } from './RemoteIndicator'
import { UserMenu } from './UserMenu'
import React, { useCallback, useEffect, useMemo } from 'react'

/** Sidebar width constants — keep in sync with AppLayout grid */
const SIDEBAR_WIDTH_EXPANDED = 300
const SIDEBAR_WIDTH_COLLAPSED = 52

export function Sidebar(): React.JSX.Element {
  const { conversations, activeConversationId, setActiveConversation, setConversations, addConversation, updateConversation, removeConversation } =
    useConversationsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const { sidebarCollapsed } = useSettingsStore()
  const { currentView, setCurrentView } = useUiStore()
  const loadTasks = useTasksStore((s) => s.loadTasks)


  // ── Recharger les conversations quand le projet change ────
  useEffect(() => {
    window.api.getConversations(activeProjectId).then(setConversations).catch(console.error)
  }, [activeProjectId, setConversations])

  // ── Refresh sidebar + tasks store quand une tache planifiee s'execute ────
  useEffect(() => {
    window.api.onTaskExecuted(() => {
      window.api.getConversations(activeProjectId).then(setConversations).catch(console.error)
      loadTasks()
    })
    return () => { window.api.offTaskExecuted() }
  }, [activeProjectId, setConversations, loadTasks])

  // ── Filtrage local (securite, au cas ou le backend n'est pas sync) ──
  const filteredConversations = useMemo(() => {
    if (activeProjectId === null) {
      // Boite de reception : conversations sans projet
      return conversations.filter((c) => !c.projectId)
    }
    return conversations.filter((c) => c.projectId === activeProjectId)
  }, [conversations, activeProjectId])

  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await window.api.createConversation(undefined, activeProjectId ?? undefined)
      if (conv) {
        addConversation(conv)
        setActiveConversation(conv.id)
        setCurrentView('chat')
        // Auto-open right panel for new conversations
        useUiStore.getState().setOpenPanel('right')
      }
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }, [addConversation, setActiveConversation, setCurrentView, activeProjectId])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id)
      // Check if this is an arena conversation
      const conv = conversations.find((c) => c.id === id)
      if (conv?.isArena) {
        setCurrentView('arena')
      } else {
        setCurrentView('chat')
      }
    },
    [setActiveConversation, setCurrentView, conversations]
  )

  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await window.api.renameConversation(id, title)
        updateConversation(id, { title })
      } catch (err) {
        console.error('Failed to rename conversation:', err)
      }
    },
    [updateConversation]
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await window.api.deleteConversation(id)
        removeConversation(id)
      } catch (err) {
        console.error('Failed to delete conversation:', err)
      }
    },
    [removeConversation]
  )

  const handleToggleFavorite = useCallback(
    async (id: string, isFavorite: boolean) => {
      try {
        await window.api.toggleConversationFavorite(id, isFavorite)
        updateConversation(id, { isFavorite })
      } catch (err) {
        console.error('Failed to toggle favorite:', err)
      }
    },
    [updateConversation]
  )

  const handleNavClick = useCallback(
    (view: ViewMode) => {
      setCurrentView(view)
    },
    [setCurrentView]
  )

  const collapsed = sidebarCollapsed

  return (
    <aside
      style={{ width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED }}
      className={cn(
        'flex h-full flex-col bg-sidebar border-r border-sidebar-border',
        'transition-[width] duration-200 ease-out',
        'select-none overflow-hidden'
      )}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div
        className={cn(
          'flex shrink-0 items-center',
          collapsed ? 'flex-col gap-1 px-1 py-2' : 'gap-2 px-3 py-1.5'
        )}
      >
        {/* Remote indicator */}
        {!collapsed && <RemoteIndicator />}

        {/* Action buttons: Chat + Tasks */}
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewConversation}
                  data-testid="new-conversation"
                  className={cn(
                    'size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent/60',
                    currentView === 'chat' && 'text-sidebar-primary bg-sidebar-accent/60'
                  )}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Nouvelle discussion</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setCurrentView('tasks'); }}
                  className={cn(
                    'size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                    currentView === 'tasks' && 'text-sidebar-primary bg-sidebar-accent/60'
                  )}
                >
                  <Clock className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Taches</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setCurrentView('arena'); }}
                  className={cn(
                    'size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60',
                    currentView === 'arena' && 'text-sidebar-primary bg-sidebar-accent/60'
                  )}
                >
                  <Swords className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Arena</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <div className="flex flex-1 gap-1">
            <button
              onClick={handleNewConversation}
              data-testid="new-conversation"
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5',
                'text-[13px] font-medium text-sidebar-foreground/70',
                'transition-colors duration-150',
                'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                currentView === 'chat' && 'text-sidebar-primary bg-sidebar-accent/60'
              )}
            >
              <MessageSquarePlus className="size-4 shrink-0" />
              <span className="truncate">Chat</span>
            </button>
            <button
              onClick={() => { setCurrentView('tasks'); }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5',
                'text-[13px] font-medium text-sidebar-foreground/70',
                'transition-colors duration-150',
                'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                currentView === 'tasks' && 'text-sidebar-primary bg-sidebar-accent/60'
              )}
            >
              <Clock className="size-4 shrink-0" />
              <span className="truncate">Taches</span>
            </button>
            <button
              onClick={() => { setCurrentView('arena'); }}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5',
                'text-[13px] font-medium text-sidebar-foreground/70',
                'transition-colors duration-150',
                'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                currentView === 'arena' && 'text-sidebar-primary bg-sidebar-accent/60'
              )}
            >
              <Swords className="size-4 shrink-0" />
              <span className="truncate">Arena</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Project selector ────────────────────────── */}
      {!collapsed && (
        <div className="shrink-0 border-b border-sidebar-border/50 px-3 py-2">
          <div className="relative">
            <ProjectSelector />
            {/* Workspace active indicator */}
            {useWorkspaceStore.getState().rootPath && (
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-emerald-500" title="Workspace actif" />
            )}
          </div>
        </div>
      )}

      {/* ── Conversation list (scrollable, flex-1) ──── */}
      <ConversationList
        conversations={filteredConversations}
        activeConversationId={activeConversationId}
        isCollapsed={collapsed}
        onSelectConversation={handleSelectConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* ── Footer — User Menu ──────────────────────── */}
      <div
        className={cn(
          'shrink-0 border-t border-sidebar-border/50',
          collapsed ? 'px-1 py-2' : 'px-2 py-2'
        )}
      >
        <UserMenu
          isCollapsed={collapsed}
          currentView={currentView}
          onNavigate={handleNavClick}
        />
      </div>
    </aside>
  )
}
