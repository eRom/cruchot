import React from 'react'
import { Smartphone } from 'lucide-react'
import { useRemoteStore } from '@/stores/remote.store'
import { useUiStore } from '@/stores/ui.store'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-emerald-500',
  pairing: 'bg-yellow-400 animate-pulse',
  expired: 'bg-red-400',
  error: 'bg-red-500'
}

export function RemoteIndicator(): React.JSX.Element | null {
  const status = useRemoteStore((s) => s.status)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)

  // Only visible when not disconnected
  if (status === 'disconnected') return null

  const dotColor = STATUS_COLORS[status] ?? 'bg-zinc-400'

  const handleClick = () => {
    setSettingsTab('remote')
    setCurrentView('settings')
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            'relative flex items-center gap-1.5 rounded-lg px-2 py-1.5',
            'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            'transition-colors duration-150'
          )}
        >
          <Smartphone className="size-3.5" />
          <span className={cn('absolute -right-0.5 -top-0.5 size-2 rounded-full', dotColor)} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        Remote Telegram ({status})
      </TooltipContent>
    </Tooltip>
  )
}
