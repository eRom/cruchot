import { ConversationList } from '@/components/conversations/ConversationList'
import { ProjectSelector } from '@/components/projects/ProjectSelector'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProjectsStore } from '@/stores/projects.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore, type ViewMode } from '@/stores/ui.store'
import { useTasksStore } from '@/stores/tasks.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus
} from 'lucide-react'
import { RemoteIndicator } from './RemoteIndicator'
import { UserMenu } from './UserMenu'
import React, { useCallback, useEffect, useMemo } from 'react'

/** Sidebar width constants — keep in sync with AppLayout grid */
const SIDEBAR_WIDTH_EXPANDED = 260
const SIDEBAR_WIDTH_COLLAPSED = 52

export function Sidebar(): React.JSX.Element {
  const { conversations, activeConversationId, setActiveConversation, setConversations, addConversation, updateConversation, removeConversation } =
    useConversationsStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore()
  const { currentView, setCurrentView } = useUiStore()
  const enabledTasksCount = useTasksStore((s) => s.tasks.filter((t) => t.isEnabled).length)

  // ── Recharger les conversations quand le projet change ────
  useEffect(() => {
    window.api.getConversations(activeProjectId).then(setConversations).catch(console.error)
  }, [activeProjectId, setConversations])

  // ── Refresh sidebar quand une tache planifiee s'execute ────
  useEffect(() => {
    window.api.onTaskExecuted(() => {
      window.api.getConversations(activeProjectId).then(setConversations).catch(console.error)
    })
    return () => { window.api.offTaskExecuted() }
  }, [activeProjectId, setConversations])

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
      }
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }, [addConversation, setActiveConversation, setCurrentView, activeProjectId])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id)
      setCurrentView('chat')
    },
    [setActiveConversation, setCurrentView]
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
      {/* ── Drag region (traffic lights macOS) ─────────── */}
      <div className="h-[38px] shrink-0 [-webkit-app-region:drag]" />

      {/* ── Header ─────────────────────────────────────── */}
      <div
        className={cn(
          'flex shrink-0 items-center',
          collapsed ? 'flex-col gap-1 px-1 py-2' : 'gap-2 px-3 py-1.5'
        )}
      >
        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>

        {/* Remote indicator */}
        {!collapsed && <RemoteIndicator />}

        {/* New conversation button */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewConversation}
                className="size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent/60"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Nouvelle discussion</TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={handleNewConversation}
            className={cn(
              'flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5',
              'text-[13px] font-medium text-sidebar-foreground/70',
              'transition-colors duration-150',
              'hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
            )}
          >
            <Plus className="size-4 shrink-0" />
            <span className="truncate">Nouvelle discussion</span>
          </button>
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
          enabledTasksCount={enabledTasksCount}
        />
      </div>
    </aside>
  )
}
