import { cn } from '@/lib/utils'
import type { LibrarySourceForMessage } from '../../../../preload/types'
import { BookOpen, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { useState } from 'react'

interface SourceCitationProps {
  sources: LibrarySourceForMessage[]
}

export function SourceCitation({ sources }: SourceCitationProps) {
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  // Group by filename
  const grouped = new Map<string, LibrarySourceForMessage[]>()
  for (const s of sources) {
    const key = s.filename
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(s)
  }

  const fileCount = grouped.size
  const displayLimit = 3
  const entries = Array.from(grouped.entries())

  return (
    <div className="mt-3 rounded-lg border border-border/40 bg-muted/30">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors',
          'text-muted-foreground hover:text-foreground'
        )}
      >
        <BookOpen className="size-3.5" />
        <span>
          Sources utilisees ({sources.length} chunk{sources.length > 1 ? 's' : ''} de {fileCount} fichier{fileCount > 1 ? 's' : ''})
        </span>
        {expanded ? <ChevronUp className="ml-auto size-3.5" /> : <ChevronDown className="ml-auto size-3.5" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-2">
          {entries.slice(0, expanded ? entries.length : displayLimit).map(([filename, chunks]) => (
            <div key={filename} className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <FileText className="size-3" />
                <span className="truncate">{filename}</span>
              </div>
              {chunks.map((chunk, i) => (
                <div
                  key={`${chunk.sourceId}-${i}`}
                  className="ml-5 rounded bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {chunk.heading && (
                      <span className="font-medium text-foreground/70">{chunk.heading}</span>
                    )}
                    {chunk.lineStart != null && chunk.lineEnd != null && (
                      <span className="text-muted-foreground/50">
                        L{chunk.lineStart}-{chunk.lineEnd}
                      </span>
                    )}
                    <span className="text-muted-foreground/40 ml-auto">
                      score {(chunk.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap leading-relaxed">
                    {chunk.chunkPreview}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
