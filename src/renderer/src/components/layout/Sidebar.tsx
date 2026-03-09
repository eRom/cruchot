import React, { useCallback } from 'react'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  BarChart3
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConversationList } from '@/components/conversations/ConversationList'
import { useConversationsStore } from '@/stores/conversations.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore, type ViewMode } from '@/stores/ui.store'

/** Sidebar width constants — keep in sync with AppLayout grid */
const SIDEBAR_WIDTH_EXPANDED = 260
const SIDEBAR_WIDTH_COLLAPSED = 52

export function Sidebar(): React.JSX.Element {
  const { conversations, activeConversationId, setActiveConversation, addConversation } =
    useConversationsStore()
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore()
  const { currentView, setCurrentView } = useUiStore()

  const handleNewConversation = useCallback(async () => {
    try {
      const conv = await window.api.createConversation()
      if (conv) {
        addConversation(conv)
        setActiveConversation(conv.id)
        setCurrentView('chat')
      }
    } catch (error) {
      console.error('Failed to create conversation:', error)
    }
  }, [addConversation, setActiveConversation, setCurrentView])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id)
      setCurrentView('chat')
    },
    [setActiveConversation, setCurrentView]
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
          'flex shrink-0 items-center border-b border-sidebar-border/50',
          collapsed ? 'flex-col gap-1 px-1 py-2' : 'gap-2 px-3 py-2.5'
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

        {/* Title — hidden when collapsed */}
        {!collapsed && (
          <span className="flex-1 truncate text-[13px] font-semibold tracking-tight text-sidebar-foreground/80">
            Multi-LLM
          </span>
        )}

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
            <TooltipContent side="right">Nouvelle conversation</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewConversation}
            className="size-8 shrink-0 text-sidebar-foreground/50 hover:text-sidebar-primary hover:bg-sidebar-accent/60"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {/* ── Conversation list (scrollable, flex-1) ──── */}
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        isCollapsed={collapsed}
        onSelectConversation={handleSelectConversation}
      />

      {/* ── Footer navigation ──────────────────────── */}
      <nav
        className={cn(
          'flex shrink-0 border-t border-sidebar-border/50',
          collapsed ? 'flex-col items-center gap-0.5 px-1 py-2' : 'flex-col gap-0.5 px-2 py-2'
        )}
      >
        <NavButton
          icon={Settings}
          label="Parametres"
          isActive={currentView === 'settings'}
          isCollapsed={collapsed}
          onClick={() => handleNavClick('settings')}
        />
        <NavButton
          icon={BarChart3}
          label="Statistiques"
          isActive={currentView === 'statistics'}
          isCollapsed={collapsed}
          onClick={() => handleNavClick('statistics')}
        />
      </nav>
    </aside>
  )
}

/* ── Small internal nav button ─────────────────────── */

interface NavButtonProps {
  icon: typeof Settings
  label: string
  isActive: boolean
  isCollapsed: boolean
  onClick: () => void
}

function NavButton({ icon: Icon, label, isActive, isCollapsed, onClick }: NavButtonProps): React.JSX.Element {
  const button = (
    <button
      onClick={onClick}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <Icon
        className={cn(
          'shrink-0 size-4 transition-colors duration-150',
          isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60'
        )}
      />
      {!isCollapsed && (
        <span className="text-[13px] font-medium leading-tight">{label}</span>
      )}
    </button>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return button
}
