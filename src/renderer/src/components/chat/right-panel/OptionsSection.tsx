import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sliders, Search, Library, X } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { YoloToggle } from '@/components/chat/YoloToggle'
import { Switch } from '@/components/ui/switch'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useLibraryStore } from '@/stores/library.store'
import { cn } from '@/lib/utils'
import type { LibraryInfo } from '../../../../../preload/types'

export function OptionsSection() {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)
  const { libraries, loadLibraries } = useLibraryStore()

  const isBusy = isStreaming

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  // ── Library picker state ──
  const [activeLibraryId, setActiveLibraryId] = useState<string | null>(null)
  const [libOpen, setLibOpen] = useState(false)
  const libRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (libraries.length === 0) loadLibraries()
  }, [libraries.length, loadLibraries])

  useEffect(() => {
    if (!activeConversationId) { setActiveLibraryId(null); return }
    window.api.libraryGetAttached({ conversationId: activeConversationId })
      .then((id) => setActiveLibraryId(id ?? null))
      .catch(() => setActiveLibraryId(null))
  }, [activeConversationId])

  useEffect(() => {
    if (!libOpen) return
    const handler = (e: MouseEvent) => {
      if (libRef.current && !libRef.current.contains(e.target as Node)) setLibOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [libOpen])

  const readyLibraries = useMemo(
    () => libraries.filter((l) => l.status === 'ready' || l.sourcesCount > 0),
    [libraries]
  )

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId]
  )

  const handleSelectLib = useCallback(async (lib: LibraryInfo) => {
    if (!activeConversationId) return
    try {
      await window.api.libraryAttach({ conversationId: activeConversationId, libraryId: lib.id })
      setActiveLibraryId(lib.id)
    } catch { /* silent */ }
    setLibOpen(false)
  }, [activeConversationId])

  const handleDetachLib = useCallback(async () => {
    if (!activeConversationId) return
    try {
      await window.api.libraryDetach({ conversationId: activeConversationId })
      setActiveLibraryId(null)
    } catch { /* silent */ }
  }, [activeConversationId])

  return (
    <CollapsibleSection title="Options" icon={Sliders} defaultOpen>
      <div className="flex flex-col gap-2.5">
        {/* Web Search toggle */}
        <div className="flex items-center justify-between gap-2 px-1">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="size-4" />
            Recherche web
          </label>
          <Switch
            checked={searchEnabled}
            onCheckedChange={setSearchEnabled}
            disabled={isBusy}
          />
        </div>

        {/* Library selector — inline, same style as ModelSelector */}
        <div className="relative" ref={libRef}>
          <div className="flex items-center gap-1">
            <button
              onClick={() => !isBusy && setLibOpen(!libOpen)}
              disabled={isBusy}
              className={cn(
                'flex flex-1 items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-1.5',
                'text-sm transition-colors',
                !isBusy ? 'hover:bg-accent/50 cursor-pointer' : 'opacity-50 cursor-not-allowed',
                activeLibrary && 'border-primary/30'
              )}
            >
              {activeLibrary ? (
                <>
                  <span className="shrink-0">{activeLibrary.icon || '📚'}</span>
                  <span className="flex-1 text-left truncate text-foreground/80">{activeLibrary.name}</span>
                </>
              ) : (
                <>
                  <Library className="size-4 shrink-0 text-muted-foreground/50" />
                  <span className="flex-1 text-left text-muted-foreground/50">Aucun referentiel</span>
                </>
              )}
            </button>
            {activeLibrary && (
              <button
                onClick={handleDetachLib}
                disabled={isBusy}
                className="rounded-md p-1 text-muted-foreground/50 hover:text-destructive transition-colors"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {libOpen && readyLibraries.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-border/60 bg-popover py-1 shadow-md max-h-[200px] overflow-y-auto">
              {readyLibraries.map((lib) => (
                <button
                  key={lib.id}
                  onClick={() => handleSelectLib(lib)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent/50',
                    activeLibraryId === lib.id && 'bg-accent/30'
                  )}
                >
                  <span className="shrink-0">{lib.icon || '📚'}</span>
                  <span className="flex-1 truncate text-left">{lib.name}</span>
                  <span className="text-[10px] text-muted-foreground/40">{lib.sourcesCount} src</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* YOLO toggle */}
        {activeConversationId && (
          <YoloToggle
            conversationId={activeConversationId}
            modelSupportsYolo={selectedModel?.supportsYolo ?? false}
            workspacePath={workspaceRootPath ?? undefined}
            disabled={isBusy}
          />
        )}
      </div>
    </CollapsibleSection>
  )
}
