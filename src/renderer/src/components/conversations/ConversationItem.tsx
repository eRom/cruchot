import React, { memo, useCallback, useState, useRef, useEffect } from 'react'
import { MessagesSquare, Pencil, Trash2, Check, X, Star, Swords } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Conversation } from '@/stores/conversations.store'


interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  isCollapsed: boolean
  onSelect: (id: string) => void
  onRename?: (id: string, title: string) => void
  onDelete?: (id: string) => void
  onToggleFavorite?: (id: string, isFavorite: boolean) => void
}

function ConversationItemBase({
  conversation,
  isActive,
  isCollapsed,
  onSelect,
  onRename,
  onDelete,
  onToggleFavorite
}: ConversationItemProps): React.JSX.Element {
  const Icon = conversation.isArena ? Swords : MessagesSquare
  const [isRenaming, setIsRenaming] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const isFav = !!conversation.isFavorite

  // Focus input quand on passe en mode renommage
  useEffect(() => {
    if (isRenaming) {
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [isRenaming])

  const handleClick = useCallback(() => {
    if (!isRenaming && !isConfirmingDelete) {
      onSelect(conversation.id)
    }
  }, [onSelect, conversation.id, isRenaming, isConfirmingDelete])

  const handleToggleFavorite = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(conversation.id, !isFav)
  }, [onToggleFavorite, conversation.id, isFav])

  const startRename = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setRenameValue(conversation.title)
    setIsRenaming(true)
    setIsConfirmingDelete(false)
  }, [conversation.title])

  const confirmRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== conversation.title) {
      onRename?.(conversation.id, trimmed)
    }
    setIsRenaming(false)
  }, [renameValue, conversation.id, conversation.title, onRename])

  const cancelRename = useCallback(() => {
    setIsRenaming(false)
  }, [])

  const startDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsConfirmingDelete(true)
    setIsRenaming(false)
  }, [])

  const confirmDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete?.(conversation.id)
    setIsConfirmingDelete(false)
  }, [onDelete, conversation.id])

  const cancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsConfirmingDelete(false)
  }, [])

  // ── Mode confirmation suppression ──────────────────────
  if (isConfirmingDelete && !isCollapsed) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-2',
        'bg-destructive/10 border border-destructive/20'
      )}>
        <span className="flex-1 truncate text-xs text-destructive">Supprimer ?</span>
        <button
          onClick={confirmDelete}
          className="rounded p-1 text-destructive-foreground bg-destructive hover:bg-destructive/90 transition-colors"
          title="Confirmer"
        >
          <Check className="size-3" />
        </button>
        <button
          onClick={cancelDelete}
          className="rounded p-1 border border-border hover:bg-accent transition-colors"
          title="Annuler"
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }

  // ── Mode renommage ─────────────────────────────────────
  if (isRenaming && !isCollapsed) {
    return (
      <div className={cn(
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5',
        'bg-sidebar-accent border border-ring/30'
      )}>
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmRename()
            if (e.key === 'Escape') cancelRename()
          }}
          onBlur={confirmRename}
          className={cn(
            'flex-1 min-w-0 bg-transparent text-[13px] text-sidebar-foreground',
            'outline-none border-none'
          )}
        />
        <button
          onClick={confirmRename}
          className="rounded p-1 text-primary hover:bg-primary/10 transition-colors"
          title="Valider"
        >
          <Check className="size-3" />
        </button>
        <button
          onMouseDown={(e) => { e.preventDefault(); cancelRename() }}
          className="rounded p-1 text-muted-foreground hover:bg-accent transition-colors"
          title="Annuler"
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }

  // ── Mode normal ────────────────────────────────────────
  const item = (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-out cursor-pointer',
        'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <Icon
        className={cn(
          'shrink-0 transition-colors duration-150',
          isActive
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60',
          isCollapsed ? 'size-4.5' : 'size-4'
        )}
      />
      {!isCollapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] leading-tight font-medium">
            {conversation.title}
          </span>

          {/* Favorite star — always visible if fav, hover-only otherwise */}
          {isFav && (
            <button
              onClick={handleToggleFavorite}
              className="shrink-0 rounded p-0.5 text-amber-500 hover:text-amber-400 transition-colors z-10"
              title="Retirer des favoris"
            >
              <Star className="size-3 fill-amber-500" />
            </button>
          )}

          {/* Actions au survol */}
          <div className={cn(
            'absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-2 pl-6',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
            isActive
              ? 'bg-gradient-to-l from-sidebar-accent from-60% to-transparent'
              : 'bg-gradient-to-l from-sidebar from-60% to-transparent group-hover:from-sidebar-accent/50'
          )}>
            {!isFav && (
              <button
                onClick={handleToggleFavorite}
                className="rounded p-1 text-sidebar-foreground/40 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Ajouter aux favoris"
              >
                <Star className="size-3" />
              </button>
            )}
            <button
              onClick={startRename}
              className="rounded p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title="Renommer"
            >
              <Pencil className="size-3" />
            </button>
            <button
              onClick={startDelete}
              className="rounded p-1 text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </>
      )}
    </div>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {isFav && <Star className="mr-1 inline size-3 fill-amber-500 text-amber-500" />}
          {conversation.title}
        </TooltipContent>
      </Tooltip>
    )
  }

  return item
}

export const ConversationItem = memo(ConversationItemBase)
