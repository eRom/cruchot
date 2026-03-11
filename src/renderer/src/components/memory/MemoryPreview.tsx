import React from 'react'
import type { MemoryFragment } from '../../../../preload/types'

interface MemoryPreviewProps {
  fragments: MemoryFragment[]
}

export function MemoryPreview({ fragments }: MemoryPreviewProps) {
  const activeFragments = fragments.filter(f => f.isActive)

  if (activeFragments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-4">
        <p className="text-xs text-muted-foreground/60 text-center">
          Aucun fragment actif — rien ne sera injecte dans les conversations
        </p>
      </div>
    )
  }

  const totalChars = activeFragments.reduce((sum, f) => sum + f.content.length, 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Apercu memoire active</p>
        <p className="text-xs text-muted-foreground">
          {activeFragments.length} fragment{activeFragments.length > 1 ? 's' : ''} — {totalChars} car.
          {totalChars > 5000 && (
            <span className="ml-1 text-amber-500">Impact sur le cout et la fenetre de contexte</span>
          )}
        </p>
      </div>
      <div className="rounded-lg border border-border/40 bg-muted/30 p-3">
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono leading-relaxed">
          {'<user-memory>\n'}
          {activeFragments.map(f => f.content).join('\n')}
          {'\n</user-memory>'}
        </pre>
      </div>
    </div>
  )
}
