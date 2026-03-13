import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { SlashCommand } from '@/stores/slash-commands.store'

interface SlashCommandMatch {
  command: SlashCommand
  isProjectScoped: boolean
}

interface SlashCommandPickerProps {
  matches: SlashCommandMatch[]
  onSelect: (commandName: string) => void
  onClose: () => void
  visible: boolean
}

export function SlashCommandPicker({ matches, onSelect, onClose, visible }: SlashCommandPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset selection when matches change
  useEffect(() => {
    setSelectedIndex(0)
  }, [matches])

  // Scroll selected into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!visible || matches.length === 0) return null

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 right-0 z-50 mb-1',
        'max-h-[320px] overflow-y-auto',
        'rounded-xl border border-border/60 bg-popover shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2 duration-150'
      )}
    >
      {matches.map(({ command, isProjectScoped }, index) => (
        <button
          key={command.id}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-2.5 text-left',
            'transition-colors',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50'
          )}
          onClick={() => onSelect(command.name)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium font-mono">/{command.name}</span>
              {isProjectScoped && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                  projet
                </span>
              )}
              {command.category && (
                <span className="text-[10px] text-muted-foreground/50">{command.category}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
              {command.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * Keyboard handler for the SlashCommandPicker.
 * Call this from the textarea's onKeyDown to handle arrow navigation.
 * Returns true if the event was handled (caller should preventDefault).
 */
export function handleSlashPickerKeyboard(
  e: KeyboardEvent<HTMLTextAreaElement>,
  matchCount: number,
  selectedIndex: number,
  setSelectedIndex: (i: number) => void,
  onSelect: (index: number) => void,
  onClose: () => void
): boolean {
  if (matchCount === 0) return false

  if (e.key === 'ArrowDown') {
    setSelectedIndex((selectedIndex + 1) % matchCount)
    return true
  }
  if (e.key === 'ArrowUp') {
    setSelectedIndex((selectedIndex - 1 + matchCount) % matchCount)
    return true
  }
  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
    onSelect(selectedIndex)
    return true
  }
  if (e.key === 'Escape') {
    onClose()
    return true
  }
  return false
}
