import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useLibraryStore } from '@/stores/library.store'
import { useConversationsStore } from '@/stores/conversations.store'
import type { LibraryInfo } from '../../../../preload/types'
import { Library, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface LibraryPickerProps {
  disabled?: boolean
  onLibraryChange?: (libraryId: string | null) => void
}

export function LibraryPicker({ disabled, onLibraryChange }: LibraryPickerProps) {
  const { libraries, loadLibraries } = useLibraryStore()
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load libraries on mount
  useEffect(() => {
    if (libraries.length === 0) loadLibraries()
  }, [libraries.length, loadLibraries])

  // Load sticky library for current conversation
  useEffect(() => {
    if (!activeConversationId) {
      setActiveLibraryId(null)
      return
    }
    window.api.libraryGetAttached({ conversationId: activeConversationId })
      .then((id) => {
        setActiveLibraryId(id ?? null)
        onLibraryChange?.(id ?? null)
      })
      .catch(() => setActiveLibraryId(null))
  }, [activeConversationId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const readyLibraries = useMemo(
    () => libraries.filter((l) => l.status === 'ready' || l.sourcesCount > 0),
    [libraries]
  )

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId]
  )

  const handleSelect = useCallback(async (lib: LibraryInfo) => {
    if (!activeConversationId) return
    try {
      await window.api.libraryAttach({ conversationId: activeConversationId, libraryId: lib.id })
      setActiveLibraryId(lib.id)
      onLibraryChange?.(lib.id)
    } catch { /* silent */ }
    setOpen(false)
  }, [activeConversationId, onLibraryChange])

  const handleDetach = useCallback(async () => {
    if (!activeConversationId) return
    try {
      await window.api.libraryDetach({ conversationId: activeConversationId })
      setActiveLibraryId(null)
      onLibraryChange?.(null)
    } catch { /* silent */ }
  }, [activeConversationId, onLibraryChange])

  // No libraries = don't render
  if (readyLibraries.length === 0) return null

  // Active library badge
  if (activeLibrary) {
    return (
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(!open)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1',
                'text-xs font-medium',
                'transition-colors',
                'bg-primary/10 text-primary hover:bg-primary/20',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span>{activeLibrary.icon || '📚'}</span>
              <span className="max-w-[120px] truncate">{activeLibrary.name}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Referentiel actif (sticky)</TooltipContent>
        </Tooltip>
        <button
          onClick={handleDetach}
          disabled={disabled}
          className="rounded p-0.5 text-muted-foreground/60 hover:text-destructive transition-colors"
          title="Detacher le referentiel"
        >
          <X className="size-3" />
        </button>
      </div>
    )
  }

  // Picker button + dropdown
  return (
    <div ref={containerRef} className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(!open)}
            disabled={disabled}
            className={cn(
              'size-7 rounded-lg',
              'text-muted-foreground/60 hover:text-muted-foreground',
              'transition-colors'
            )}
          >
            <Library className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Attacher un referentiel</TooltipContent>
      </Tooltip>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 z-50">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground/60">
            Attacher un referentiel
          </p>
          {readyLibraries.map((lib) => (
            <button
              key={lib.id}
              onClick={() => handleSelect(lib)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                'hover:bg-accent text-foreground'
              )}
            >
              <span>{lib.icon || '📚'}</span>
              <span className="flex-1 truncate text-left">{lib.name}</span>
              <span className="text-[10px] text-muted-foreground/50">
                {lib.sourcesCount} src
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
