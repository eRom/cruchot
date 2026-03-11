import React, { useState } from 'react'
import { GripVertical, Pencil, Trash2, Check, X } from 'lucide-react'
import type { MemoryFragment } from '../../../../preload/types'
import { cn } from '@/lib/utils'

interface MemoryFragmentCardProps {
  fragment: MemoryFragment
  onToggle: (id: string) => void
  onUpdate: (id: string, content: string) => void
  onDelete: (id: string) => void
  dragHandleProps?: Record<string, unknown>
}

export function MemoryFragmentCard({ fragment, onToggle, onUpdate, onDelete, dragHandleProps }: MemoryFragmentCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(fragment.content)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = () => {
    const trimmed = editContent.trim()
    if (trimmed && trimmed !== fragment.content) {
      onUpdate(fragment.id, trimmed)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditContent(fragment.content)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-xl border border-primary/30 bg-card p-4">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
          autoFocus
          className="w-full resize-none bg-transparent p-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          rows={3}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {editContent.length}/2000
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              <X className="size-3" />
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!editContent.trim() || editContent.trim() === fragment.content}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="size-3" />
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'group relative flex items-start gap-2 rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border',
        !fragment.isActive && 'opacity-50'
      )}
    >
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="mt-0.5 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </div>

      {/* Toggle */}
      <button
        onClick={() => onToggle(fragment.id)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          fragment.isActive ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
            fragment.isActive ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>

      {/* Content */}
      <p className="flex-1 text-sm text-foreground leading-relaxed">
        {fragment.content}
      </p>

      {/* Actions (hover) */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => {
            setEditContent(fragment.content)
            setIsEditing(true)
          }}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Modifier"
        >
          <Pencil className="size-3.5" />
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onDelete(fragment.id)}
              className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10"
              title="Confirmer"
            >
              <Check className="size-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              title="Annuler"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
            title="Supprimer"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
