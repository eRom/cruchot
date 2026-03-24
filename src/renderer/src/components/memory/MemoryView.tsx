import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Brain, Plus, Check, X } from 'lucide-react'
import { useMemoryStore } from '@/stores/memory.store'
import { useBardaStore } from '@/stores/barda.store'
import { MemoryFragmentCard } from './MemoryFragmentCard'
import { MemoryPreview } from './MemoryPreview'
import { SemanticMemorySection } from './SemanticMemorySection'
import { toast } from 'sonner'

export function MemoryView() {

  const fragments = useMemoryStore((s) => s.fragments)
  const createFragment = useMemoryStore((s) => s.createFragment)
  const updateFragment = useMemoryStore((s) => s.updateFragment)
  const deleteFragment = useMemoryStore((s) => s.deleteFragment)
  const toggleFragment = useMemoryStore((s) => s.toggleFragment)
  const reorderFragments = useMemoryStore((s) => s.reorderFragments)

  const disabledNamespaces = useBardaStore((s) => s.disabledNamespaces)
  const filteredFragments = useMemo(
    () => fragments.filter((f) => !f.namespace || !disabledNamespaces.has(f.namespace)),
    [fragments, disabledNamespaces]
  )

  const [isAdding, setIsAdding] = useState(false)
  const [newContent, setNewContent] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemIndex = useRef<number | null>(null)

  const handleCreate = useCallback(async () => {
    const trimmed = newContent.trim()
    if (!trimmed) return
    try {
      await createFragment(trimmed)
      setNewContent('')
      setIsAdding(false)
      toast.success('Fragment ajoute')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }, [newContent, createFragment])

  const handleUpdate = useCallback(async (id: string, content: string) => {
    try {
      await updateFragment(id, { content })
      toast.success('Fragment modifie')
    } catch {
      toast.error('Erreur lors de la modification')
    }
  }, [updateFragment])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteFragment(id)
      toast.success('Fragment supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }, [deleteFragment])

  const handleToggle = useCallback(async (id: string) => {
    try {
      await toggleFragment(id)
    } catch {
      toast.error('Erreur')
    }
  }, [toggleFragment])

  // ── Drag & Drop (HTML5 natif) ──────────────────
  const handleDragStart = useCallback((index: number) => {
    dragItemIndex.current = index
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    setDragOverIndex(null)
    const from = dragItemIndex.current
    if (from === null || from === dropIndex) return

    const ordered = [...fragments]
    const [moved] = ordered.splice(from, 1)
    ordered.splice(dropIndex, 0, moved)
    reorderFragments(ordered.map(f => f.id))
    dragItemIndex.current = null
  }, [fragments, reorderFragments])

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null)
    dragItemIndex.current = null
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleCreate()
    } else if (e.key === 'Escape') {
      setIsAdding(false)
      setNewContent('')
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Memoire</h1>
          {/* Subheader */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filteredFragments.length === 0
                ? 'Fragments de contexte personnel injectes dans toutes les conversations'
                : `${filteredFragments.filter(f => f.isActive).length} actif${filteredFragments.filter(f => f.isActive).length > 1 ? 's' : ''} sur ${filteredFragments.length}`
              }
            </p>
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-3.5" />
              Ajouter
            </button>
          </div>

          {/* Empty state */}
          {filteredFragments.length === 0 && !isAdding && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
              <Brain className="size-10 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Aucun fragment de memoire</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Ajoutez des informations personnelles (identite, preferences, contexte) qui seront injectees dans chaque conversation
                </p>
              </div>
              <button
                onClick={() => setIsAdding(true)}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-3.5" />
                Ajouter un fragment
              </button>
            </div>
          )}

          {/* Add form */}
          {isAdding && (
            <div className="rounded-xl border border-primary/30 bg-card p-4">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={2000}
                autoFocus
                placeholder="Ex: Je suis Romain, architecte logiciel..."
                className="w-full resize-none bg-transparent p-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                rows={3}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {newContent.length}/2000
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { setIsAdding(false); setNewContent('') }}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    <X className="size-3" />
                    Annuler
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newContent.trim()}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Check className="size-3" />
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Fragment list */}
          {filteredFragments.length > 0 && (
            <div className="space-y-2">
              {filteredFragments.map((fragment, index) => (
                <div
                  key={fragment.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={dragOverIndex === index ? 'border-t-2 border-primary' : ''}
                >
                  <MemoryFragmentCard
                    fragment={fragment}
                    onToggle={handleToggle}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          {filteredFragments.length > 0 && (
            <div className="border-t border-border/40 pt-6">
              <MemoryPreview fragments={fragments} />
            </div>
          )}

          {/* Semantic Memory Section */}
          <div className="border-t border-border/40 pt-6">
            <SemanticMemorySection />
          </div>
        </div>
      </div>
    </div>
  )
}
