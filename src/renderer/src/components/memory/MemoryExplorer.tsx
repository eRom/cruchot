import { useState, useCallback } from 'react'
import { ArrowLeft, Search, Loader2 } from 'lucide-react'
import { useSemanticMemoryStore } from '@/stores/semantic-memory.store'
import { MemoryResultCard } from './MemoryResultCard'
import { toast } from 'sonner'

interface MemoryExplorerProps {
  onBack: () => void
}

export function MemoryExplorer({ onBack }: MemoryExplorerProps) {
  const [query, setQuery] = useState('')
  const searchResults = useSemanticMemoryStore((s) => s.searchResults)
  const isSearching = useSemanticMemoryStore((s) => s.isSearching)
  const search = useSemanticMemoryStore((s) => s.search)
  const forget = useSemanticMemoryStore((s) => s.forget)
  const clearSearch = useSemanticMemoryStore((s) => s.clearSearch)

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    await search(trimmed)
  }, [query, search])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
    if (e.key === 'Escape') {
      setQuery('')
      clearSearch()
    }
  }

  const handleForget = async (pointId: string) => {
    try {
      await forget([pointId])
      toast.success('Souvenir oublie')
    } catch {
      toast.error('Erreur')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h3 className="text-sm font-medium text-foreground">Recherche semantique</h3>
      </div>

      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Rechercher dans la memoire..."
          autoFocus
          className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={!query.trim() || isSearching}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {searchResults.length} resultat{searchResults.length > 1 ? 's' : ''}
          </p>
          {searchResults.map((result) => (
            <MemoryResultCard
              key={result.id}
              result={result}
              onForget={handleForget}
            />
          ))}
        </div>
      )}

      {/* Empty state after search */}
      {searchResults.length === 0 && query.trim() && !isSearching && (
        <p className="text-center text-xs text-muted-foreground/60 py-8">
          Aucun souvenir correspondant
        </p>
      )}
    </div>
  )
}
