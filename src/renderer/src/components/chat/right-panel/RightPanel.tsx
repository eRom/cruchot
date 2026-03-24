import { SlidersHorizontal, FolderOpen, Settings2, Wrench, Plug, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'
import { ParamsSection } from './ParamsSection'
import { OptionsSection } from './OptionsSection'
import { WorkspaceSection } from './WorkspaceSection'
import { McpSection } from './McpSection'
import { RemoteSection } from './RemoteSection'
import { ToolsSection } from './ToolsSection'

interface RightPanelProps {
  onPromptInsert: (text: string) => void
  onOptimizedPrompt: (text: string) => void
}

const SECTION_ICONS = [
  { icon: SlidersHorizontal, label: 'Parametres' },
  { icon: FolderOpen, label: 'Dossier de travail' },
  { icon: Settings2, label: 'Options' },
  { icon: Wrench, label: 'Outils' },
  { icon: Plug, label: 'MCP' },
  { icon: Radio, label: 'Remote' },
]

export function RightPanel({ onPromptInsert, onOptimizedPrompt }: RightPanelProps) {
  const openPanel = useUiStore((s) => s.openPanel)
  const expanded = openPanel === 'right'

  return (
    <div
      className={cn(
        'flex h-full shrink-0 flex-col bg-background',
        'transition-[width] duration-200 ease-out',
        expanded ? 'w-[300px]' : 'w-10'
      )}
    >
      {/* Expanded: full sections */}
      {expanded && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3">
          <ParamsSection />
          <WorkspaceSection />
          <OptionsSection />
          <ToolsSection onOptimizedPrompt={onOptimizedPrompt} onPromptInsert={onPromptInsert} />
          <McpSection />
          <RemoteSection />
        </div>
      )}

      {/* Collapsed: section icons */}
      {!expanded && (
        <div className="flex flex-1 flex-col items-center gap-1 pt-1">
          {SECTION_ICONS.map(({ icon: Icon, label }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => useUiStore.getState().setOpenPanel('right')}
                  className="size-8 shrink-0 text-muted-foreground/50 hover:text-foreground hover:bg-accent/60"
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  )
}
