import { useState, useEffect } from 'react'
import { BookOpen, Plus, Search, Tag } from 'lucide-react'
import { usePromptsStore, Prompt } from '../../stores/prompts.store'
import { PromptEditor } from './PromptEditor'

const TYPE_LABELS: Record<string, string> = {
  complet: 'Complet',
  complement: 'Complément',
  system: 'Système'
}

export function PromptLibrary() {
  const { prompts, setPrompts, removePrompt } = usePromptsStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadPrompts()
  }, [])

  async function loadPrompts() {
    try {
      const list = await window.api.getPrompts()
      setPrompts(list)
    } catch (err) {
      console.error('Failed to load prompts:', err)
    }
  }

  async function handleDelete(id: string) {
    try {
      await window.api.deletePrompt(id)
      removePrompt(id)
    } catch (err) {
      console.error('Failed to delete prompt:', err)
    }
  }

  const filtered = prompts.filter((p) => {
    if (filterType && p.type !== filterType) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      )
    }
    return true
  })

  if (isCreating || editingPrompt) {
    return (
      <PromptEditor
        prompt={editingPrompt ?? undefined}
        onSave={() => {
          setEditingPrompt(null)
          setIsCreating(false)
          loadPrompts()
        }}
        onCancel={() => {
          setEditingPrompt(null)
          setIsCreating(false)
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Bibliothèque de prompts</h2>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nouveau
        </button>
      </div>

      <div className="flex items-center gap-2 p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1">
          {['complet', 'complement', 'system'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? null : type)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                filterType === type
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Aucun prompt trouvé
          </div>
        ) : (
          filtered.map((prompt) => (
            <div
              key={prompt.id}
              className="p-3 border border-border rounded-md hover:bg-accent/50 transition-colors cursor-pointer group"
              onClick={() => setEditingPrompt(prompt)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{prompt.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {prompt.content}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded ml-2 flex-shrink-0">
                  {TYPE_LABELS[prompt.type]}
                </span>
              </div>

              {prompt.tags && prompt.tags.length > 0 && (
                <div className="flex items-center gap-1 mt-2">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  {prompt.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-1.5 py-0.5 bg-muted rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(prompt.id)
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
