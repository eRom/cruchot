import { useMemo } from 'react'
import { Brain, Check, Network, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSettingsStore, type ThinkingEffort } from '@/stores/settings.store'
import { useProvidersStore } from '@/stores/providers.store'
import { useMcpStore } from '@/stores/mcp.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'

interface ChatOptionsMenuProps {
  disabled?: boolean
  supportsThinking?: boolean
}

const EFFORT_OPTIONS: { value: ThinkingEffort; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Faible' },
  { value: 'medium', label: 'Moyen' },
  { value: 'high', label: 'Eleve' }
]

export function ChatOptionsMenu({ disabled, supportsThinking }: ChatOptionsMenuProps) {
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const setThinkingEffort = useSettingsStore((s) => s.setThinkingEffort)

  const providers = useProvidersStore((s) => s.providers)
  const hasPerplexityKey = useMemo(
    () => providers.some((p) => p.id === 'perplexity' && p.isConfigured),
    [providers]
  )

  const servers = useMcpStore((s) => s.servers)
  const toggleServer = useMcpStore((s) => s.toggleServer)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setCustomizeTab = useUiStore((s) => s.setCustomizeTab)

  const mcpConnectedCount = useMemo(
    () => servers.filter((s) => s.status === 'connected').length,
    [servers]
  )

  // Count active features for badge
  const activeCount =
    (searchEnabled ? 1 : 0) +
    (supportsThinking && thinkingEffort !== 'off' ? 1 : 0) +
    mcpConnectedCount

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              className={cn(
                'h-7 gap-1 rounded-lg px-2 text-xs font-medium transition-colors',
                activeCount > 0
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              {activeCount > 0 && <span>{activeCount}</span>}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Options du chat</TooltipContent>
      </Tooltip>

      <DropdownMenuContent side="top" sideOffset={8} className="w-56">
        {/* ── Search ── */}
        {hasPerplexityKey && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setSearchEnabled(!searchEnabled)
            }}
            className="gap-2"
          >
            <Search className="size-4" />
            <span className="flex-1">Recherche web</span>
            {searchEnabled && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        )}

        {/* ── Thinking ── */}
        {supportsThinking && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Brain className="size-4" />
              <span className="flex-1">Reflexion</span>
              <span className="text-[10px] text-muted-foreground">
                {EFFORT_OPTIONS.find((o) => o.value === thinkingEffort)?.label}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {EFFORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={() => setThinkingEffort(opt.value)}
                  className="gap-2"
                >
                  <span className="flex-1">{opt.label}</span>
                  {thinkingEffort === opt.value && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* ── MCP ── */}
        {(hasPerplexityKey || supportsThinking) && servers.length > 0 && <DropdownMenuSeparator />}

        {servers.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Network className="size-4" />
              <span className="flex-1">MCP</span>
              {mcpConnectedCount > 0 && (
                <span className="text-[10px] text-emerald-500">{mcpConnectedCount}</span>
              )}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {servers.map((server) => (
                <DropdownMenuItem
                  key={server.id}
                  onSelect={(e) => e.preventDefault()}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'size-1.5 shrink-0 rounded-full',
                        server.status === 'connected' ? 'bg-emerald-500' :
                        server.status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
                      )}
                    />
                    <span className="truncate text-sm">{server.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleServer(server.id)
                    }}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      server.isEnabled ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
                        server.isEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { setCustomizeTab('mcp'); setCurrentView('customize') }} className="gap-2">
                <Settings2 className="size-4" />
                Gerer les serveurs...
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem onSelect={() => { setCustomizeTab('mcp'); setCurrentView('customize') }} className="gap-2">
            <Network className="size-4 text-muted-foreground" />
            <span className="flex-1 text-muted-foreground">MCP</span>
            <span className="text-[10px] text-muted-foreground">Configurer...</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
