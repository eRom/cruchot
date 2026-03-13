import { useEffect, useRef } from 'react'
import { File, Folder, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileMentionResult } from '@/hooks/useFileMention'

interface FileMentionPopoverProps {
  results: FileMentionResult[]
  selectedIndex: number
  currentDir: string
  onSelect: (index: number) => void
  onClose: () => void
}

export function FileMentionPopover({
  results,
  selectedIndex,
  currentDir,
  onSelect,
  onClose
}: FileMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll selected into view
  useEffect(() => {
    const item = listRef.current?.children[currentDir ? 1 : 0]?.parentElement?.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, currentDir])

  if (results.length === 0) return null

  return (
    <div
      className={cn(
        'absolute bottom-full left-0 right-0 z-50 mb-1',
        'max-h-[320px] overflow-y-auto',
        'rounded-xl border border-border/60 bg-popover shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2 duration-150'
      )}
    >
      {/* Breadcrumb header when inside a subdirectory */}
      {currentDir && (
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/40 text-xs text-muted-foreground/70">
          <span className="text-muted-foreground/50">@</span>
          {currentDir.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 text-muted-foreground/40" />}
              <span>{segment}</span>
            </span>
          ))}
          <ChevronRight className="size-3 text-muted-foreground/40" />
        </div>
      )}

      <div ref={listRef}>
        {results.map((result, index) => (
          <button
            key={result.fullPath}
            data-index={index}
            className={cn(
              'flex w-full items-center gap-3 px-4 py-2 text-left',
              'transition-colors',
              result.isAlreadyAttached && 'opacity-40 cursor-default',
              index === selectedIndex
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground hover:bg-accent/50'
            )}
            onClick={() => !result.isAlreadyAttached && onSelect(index)}
            onMouseEnter={() => !result.isAlreadyAttached && undefined}
          >
            {result.isDirectory ? (
              <Folder className="size-4 shrink-0 text-amber-500/70" />
            ) : (
              <File className="size-4 shrink-0 text-muted-foreground/60" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-sm truncate block">{result.node.name}</span>
              {!currentDir && result.fullPath.includes('/') && (
                <span className="text-[10px] text-muted-foreground/50 truncate block">
                  {result.fullPath}
                </span>
              )}
            </div>
            {result.isDirectory && (
              <ChevronRight className="size-3.5 text-muted-foreground/40 shrink-0" />
            )}
            {result.isAlreadyAttached && (
              <span className="text-[10px] text-muted-foreground/50 shrink-0">attache</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
