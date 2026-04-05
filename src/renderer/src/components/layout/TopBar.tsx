import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { useGeminiLiveStore } from '@/stores/gemini-live.store'
import { NotchBar } from '../chat/NotchBar'

export function TopBar() {
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar)
  const openPanel = useUiStore((s) => s.openPanel)
  const rightExpanded = openPanel === 'right'
  const isGeminiAvailable = useGeminiLiveStore((s) => s.isAvailable)

  return (
    <div className="relative flex h-[38px] shrink-0 items-center bg-background border-b">
      {/* Drag region — fills all space, traffic lights macOS */}
      <div className="flex-1 h-full [-webkit-app-region:drag]" />

      {/* Gemini Live notch */}
      {isGeminiAvailable && <NotchBar />}

      {/* Toggle buttons — right side, no-drag */}
      <div className="flex items-center gap-0.5 px-1.5 [-webkit-app-region:no-drag]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="size-7 shrink-0 text-muted-foreground/40 hover:text-foreground hover:bg-accent/60"
            >
              {collapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Sidebar (Cmd+B)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => useUiStore.getState().toggleRightPanel()}
              className="size-7 shrink-0 text-muted-foreground/40 hover:text-foreground hover:bg-accent/60"
            >
              {rightExpanded ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Panneau lateral (Opt+Cmd+B)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
