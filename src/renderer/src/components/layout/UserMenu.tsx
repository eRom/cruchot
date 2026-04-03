import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/stores/ui.store'
import { useSettingsStore } from '@/stores/settings.store'
import {
  BarChart3,
  ChevronsDownUp,
  ChevronsUpDown,
  Image,
  Search,
  Settings,
  UserPen
} from 'lucide-react'
import React, { useState } from 'react'

interface UserMenuProps {
  isCollapsed: boolean
  currentView: ViewMode
  onNavigate: (view: ViewMode) => void
}

export function UserMenu({ isCollapsed, currentView, onNavigate }: UserMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const userName = useSettingsStore((s) => s.userName) ?? ''
  const userAvatarPath = useSettingsStore((s) => s.userAvatarPath) ?? ''

  const displayName = userName || 'Anonymous'
  const initials = userName ? userName.charAt(0).toUpperCase() : '?'

  const ChevronIcon = open ? ChevronsDownUp : ChevronsUpDown

  const trigger = (
    <button
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg py-2 text-left',
        'transition-colors duration-150 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        isCollapsed ? 'justify-center px-0' : 'px-2.5'
      )}
    >
      {/* Avatar */}
      {userAvatarPath ? (
        <img
          src={`local-image://${userAvatarPath}`}
          alt={displayName}
          className="size-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
          {initials}
        </span>
      )}
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate text-[13px] font-medium leading-tight">
            {displayName}
          </span>
          <ChevronIcon className="size-4 shrink-0 text-sidebar-foreground/40 transition-colors group-hover:text-sidebar-foreground/60" />
        </>
      )}
    </button>
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      {isCollapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{displayName}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        side="top"
        sideOffset={8}
        align={isCollapsed ? 'center' : 'start'}
        className="w-56"
      >
        <DropdownMenuGroup>
          <MenuItem
            icon={UserPen}
            label="Personnaliser"
            isActive={currentView === 'customize'}
            onSelect={() => onNavigate('customize')}
            shortcut="⌘U"
          />
          <MenuItem
            icon={Search}
            label="Recherche"
            isActive={currentView === 'search'}
            onSelect={() => onNavigate('search')}
            shortcut="⌘F"
          />
          <MenuItem
            icon={Settings}
            label="Parametres"
            isActive={currentView === 'settings'}
            onSelect={() => onNavigate('settings')}
            shortcut="⌘,"
          />
          <MenuItem
            icon={Image}
            label="Images"
            isActive={currentView === 'images'}
            onSelect={() => onNavigate('images')}
          />
          <MenuItem
            icon={BarChart3}
            label="Statistiques"
            isActive={currentView === 'statistics'}
            onSelect={() => onNavigate('statistics')}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ── Internal menu item helper ─────────────────────── */

interface MenuItemProps {
  icon: typeof Settings
  label: string
  isActive: boolean
  onSelect: () => void
  badge?: number
  shortcut?: string
}

function MenuItem({ icon: Icon, label, isActive, onSelect, badge, shortcut }: MenuItemProps): React.JSX.Element {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className={cn('gap-2', isActive && 'font-semibold text-accent-foreground')}
    >
      <Icon className="size-4" />
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}
