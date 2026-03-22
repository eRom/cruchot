import { useCallback, useEffect, useMemo } from 'react'
import { Search, Library } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import { YoloToggle } from '@/components/chat/YoloToggle'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useUiStore } from '@/stores/ui.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useLibraryStore } from '@/stores/library.store'
import { cn } from '@/lib/utils'

const NO_LIBRARY = '__none__'

export function OptionsSection() {
  const isStreaming = useUiStore((s) => s.isStreaming)
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const { selectedModelId, selectedProviderId, models } = useProvidersStore()
  const workspaceRootPath = useWorkspaceStore((s) => s.rootPath)
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)
  const { libraries, loadLibraries, activeLibraryId, setActiveLibraryId } = useLibraryStore()

  const isBusy = isStreaming

  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId && m.providerId === selectedProviderId),
    [models, selectedModelId, selectedProviderId]
  )

  useEffect(() => {
    if (libraries.length === 0) loadLibraries()
  }, [libraries.length, loadLibraries])
  // Note: activeLibraryId sync is handled in ChatView (always mounted, race-safe)

  const readyLibraries = useMemo(
    () => libraries.filter((l) => l.status === 'ready' || l.sourcesCount > 0),
    [libraries]
  )

  const activeLibrary = useMemo(
    () => libraries.find((l) => l.id === activeLibraryId) ?? null,
    [libraries, activeLibraryId]
  )

  const handleLibraryChange = useCallback(async (value: string) => {
    if (value === NO_LIBRARY) {
      setActiveLibraryId(null)
      if (activeConversationId) {
        try { await window.api.libraryDetach({ conversationId: activeConversationId }) } catch { /* silent */ }
      }
      return
    }

    setActiveLibraryId(value)
    if (activeConversationId) {
      try { await window.api.libraryAttach({ conversationId: activeConversationId, libraryId: value }) } catch { /* silent */ }
    }
  }, [activeConversationId, setActiveLibraryId])

  const selectValue = activeLibraryId ?? NO_LIBRARY

  return (
    <CollapsibleSection title="Options" defaultOpen>
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

        {/* Library selector — Radix Select, same pattern as ModelSelector */}
        <Select value={selectValue} onValueChange={handleLibraryChange} disabled={isBusy}>
          <SelectTrigger
            size="sm"
            className={cn(
              'h-auto w-full gap-2 rounded-lg border border-border/60 bg-card px-3 py-1.5',
              'text-sm transition-colors',
              'hover:bg-accent/50',
              'focus-visible:ring-1 focus-visible:ring-ring/30',
              'shadow-none',
              activeLibrary && 'border-primary/30'
            )}
          >
            {activeLibrary ? (
              <span className="shrink-0">{activeLibrary.icon || '📚'}</span>
            ) : (
              <Library className="size-4 shrink-0 text-muted-foreground/50" />
            )}
            <SelectValue>
              <span className={cn('truncate text-sm', activeLibrary ? 'text-foreground/80' : 'text-muted-foreground/50')}>
                {activeLibrary ? activeLibrary.name : 'Aucun referentiel'}
              </span>
            </SelectValue>
          </SelectTrigger>

          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            sideOffset={4}
            className={cn(
              'min-w-[200px] max-w-[280px]',
              'border-border/50 bg-popover/95 backdrop-blur-xl',
              'shadow-lg shadow-black/10 dark:shadow-black/30'
            )}
          >
            <SelectItem value={NO_LIBRARY}>
              <span className="flex items-center gap-2">
                <Library className="size-4 text-muted-foreground/50" />
                <span className="text-muted-foreground">Aucun referentiel</span>
              </span>
            </SelectItem>

            {readyLibraries.length > 0 && <SelectSeparator />}

            {readyLibraries.map((lib) => (
              <SelectItem key={lib.id} value={lib.id}>
                <span className="flex items-center gap-2">
                  <span className="shrink-0">{lib.icon || '📚'}</span>
                  <span className="truncate">{lib.name}</span>
                  <span className="text-[10px] text-muted-foreground/40">{lib.sourcesCount} src</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
